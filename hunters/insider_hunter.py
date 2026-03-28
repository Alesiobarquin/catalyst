import httpx

from .common.kafka_client import KafkaClient
from .common.liquidity_lookup import fetch_liquidity_metrics
from .common.logger import get_logger
from .common.topics import KAFKA_TOPIC_INSIDER, RAW_EVENTS_TOPIC

logger = get_logger("insider_hunter")

# SEC requires a User-Agent with contact info
HEADERS = {"User-Agent": "CatalystBot yourname@example.com", "Accept-Encoding": "gzip, deflate"}


NS = {'atom': 'http://www.w3.org/2005/Atom'}

# Human-readable transaction code mapping
TRANSACTION_CODES = {
    "P": "Buy",
    "S": "Sell",
    "A": "Award",           # Grant (options, RSUs) — not a market signal
    "D": "Disposition",     # Surrender/gift
    "M": "Option Exercise", # Pre-cursor to a sale, watch for paired S
    "F": "Tax Withholding", # Shares withheld for taxes — not a signal
    "G": "Gift",
    "V": "Voluntary",
    "X": "Option Exercise (Expired)"
}

# Only these codes are meaningful buy/sell signals
SIGNAL_CODES = {"P", "S"}


def get_text(element, tag):
    """Safely extract text from an XML element, handling <tag><value>x</value></tag> pattern."""
    node = element.find(tag)
    if node is None:
        return None
    # Form 4 XML wraps values: <transactionShares><value>123</value></transactionShares>
    value_node = node.find("value")
    if value_node is not None:
        return value_node.text.strip() if value_node.text else None
    # Fallback: direct text (e.g. issuerTradingSymbol, rptOwnerName)
    return node.text.strip() if node.text else None


async def fetch_filing_xml(client: httpx.AsyncClient, index_url: str, cik: str) -> str | None:
    try:
        accession_dashed = index_url.split('/')[-1].replace('-index.htm', '')
        accession_nodash = accession_dashed.replace('-', '')
        cik_stripped = cik.lstrip('0')

        folder_url = (
            f"https://www.sec.gov/Archives/edgar/data/{cik_stripped}"
            f"/{accession_nodash}/"
        )

        resp = await client.get(folder_url)
        if resp.status_code != 200:
            logger.warning(f"Could not fetch filing folder: {folder_url}")
            return None

        from html.parser import HTMLParser

        class LinkParser(HTMLParser):
            def __init__(self):
                super().__init__()
                self.xml_files = []
            def handle_starttag(self, tag, attrs):
                if tag == "a":
                    for attr, val in attrs:
                        if attr == "href" and val.endswith(".xml"):
                            self.xml_files.append(val)

        parser = LinkParser()
        parser.feed(resp.text)

        # Filter: must be .xml, not .xsd schema, not XBRL fee exhibits
        # Form 4 XML files typically contain "form4", "wf-form", "doc", or the accession number
        # Most importantly: exclude files that are clearly not ownership documents
        xml_files = [
            f for f in parser.xml_files
            if not f.endswith(".xsd")
            and "xsl" not in f.lower()
            and not any(x in f.lower() for x in ["r2.htm", "r3.htm"])
        ]

        if not xml_files:
            logger.warning(f"No XML file found in folder: {folder_url}")
            return None

        # Prefer files with "form4" or "wf-form" in the name, fall back to first
        preferred = [f for f in xml_files if any(k in f.lower() for k in ["form4", "wf-form", "doc4"])]
        chosen = preferred[0] if preferred else xml_files[0]

        # Verify it's actually an ownershipDocument before returning
        full_url = f"https://www.sec.gov{chosen}" if chosen.startswith("/") else f"{folder_url}{chosen}"

        # Quick peek: fetch first 200 bytes to confirm it's a Form 4
        peek = await client.get(full_url, headers={"Range": "bytes=0-500"})
        if "ownershipDocument" not in peek.text and "documentType" not in peek.text:
            logger.warning(f"XML at {full_url} is not a Form 4 ownershipDocument, skipping.")
            return None

        return full_url

    except Exception as e:
        logger.error(f"Error fetching filing index for {index_url}: {e}")
        return None

def parse_form4_xml(xml_content: bytes, cik: str, accession: str, filing_url: str) -> list[dict]:
    """
    Parse a Form 4 XML filing into structured signal payloads.
    One filing can contain multiple transactions, so we return a list.
    """
    signals = []

    try:
        root = ET.fromstring(xml_content)
        
        # --- Issuer (the company) ---
        issuer = root.find("issuer")
        ticker = get_text(issuer, "issuerTradingSymbol") if issuer is not None else None
        company_name = get_text(issuer, "issuerName") if issuer is not None else None

        # --- Reporting Owner (the insider) ---
        owner_el = root.find("reportingOwner")
        insider_name = None
        insider_roles = []

        if owner_el is not None:
            id_el = owner_el.find("reportingOwnerId")
            insider_name = get_text(id_el, "rptOwnerName") if id_el is not None else None

            rel_el = owner_el.find("reportingOwnerRelationship")
            if rel_el is not None:
                if get_text(rel_el, "isDirector") == "1":
                    insider_roles.append("Director")
                if get_text(rel_el, "isOfficer") == "1":
                    title = get_text(rel_el, "officerTitle") or "Officer"
                    insider_roles.append(title)
                if get_text(rel_el, "isTenPercentOwner") == "1":
                    insider_roles.append("10% Owner")

        # --- Non-Derivative Transactions (actual stock, the most important) ---
        for txn in root.findall(".//nonDerivativeTransaction"):
            code_el = txn.find("transactionCoding")
            txn_code = get_text(code_el, "transactionCode") if code_el is not None else None

            # Skip non-signal codes (awards, tax withholding, gifts)
            if txn_code not in SIGNAL_CODES:
                continue

            amounts_el = txn.find("transactionAmounts")
            shares_str = get_text(amounts_el, "transactionShares") if amounts_el is not None else None
            price_str = get_text(amounts_el, "transactionPricePerShare") if amounts_el is not None else None

            # Post-transaction holdings
            post_el = txn.find("postTransactionAmounts")
            shares_owned_after = get_text(post_el, "sharesOwnedFollowingTransaction") if post_el is not None else None

            # Ownership type: D = Direct, I = Indirect (through trust/entity)
            ownership_el = txn.find("ownershipNature")
            ownership_type = get_text(ownership_el, "directOrIndirectOwnership") if ownership_el is not None else None

            shares = float(shares_str) if shares_str else None
            price = float(price_str) if price_str else None
            total_value = round(shares * price, 2) if shares and price else None

            # Signal strength heuristic
            signal_strength = classify_signal(txn_code, total_value, insider_roles)

            signals.append({
                "cik": cik,
                "accessionNumber": accession,
                "filing_url": filing_url,
                "ticker": ticker,
                "companyName": company_name,
                "insiderName": insider_name,
                "insiderRoles": insider_roles,
                "transactionCode": txn_code,
                "transactionType": TRANSACTION_CODES.get(txn_code, txn_code),
                "isBuy": txn_code == "P",
                "isSell": txn_code == "S",
                "shares": shares,
                "pricePerShare": price,
                "totalValue": total_value,
                "sharesOwnedAfter": float(shares_owned_after) if shares_owned_after else None,
                "ownershipType": "Direct" if ownership_type == "D" else "Indirect" if ownership_type == "I" else "Unknown",
                "signalStrength": signal_strength,
                "source": "edgar_form4",
            })

    except Exception as e:
        logger.error(f"Error parsing Form 4 XML for {accession}: {e}")

    return signals


def classify_signal(txn_code: str, total_value: float | None, roles: list[str]) -> str:
    """
    Heuristic signal strength classifier.
    Buys from C-suite executives in large size are the strongest signals.
    """
    if txn_code not in ("P", "S"):
        return "NOISE"

    is_executive = any(r in roles for r in ["CEO", "CFO", "COO", "President", "Director"])
    value = total_value or 0

    if txn_code == "P":
        if value >= 1_000_000 and is_executive:
            return "STRONG_BUY"
        elif value >= 250_000:
            return "BUY"
        else:
            return "WEAK_BUY"
    elif txn_code == "S":
        if value >= 1_000_000 and is_executive:
            return "STRONG_SELL"
        elif value >= 250_000:
            return "SELL"
        else:
            return "WEAK_SELL"

    return "NEUTRAL"


async def run():
    logger.info("Insider Hunter starting...")
    # TODO: Implement insider trading scraping logic using SEC_RSS_URL

    # Target CIKs - In production, you might load these from a config or DB
    target_ciks = ["0000320193"]  # Example: Apple

    async with httpx.AsyncClient(headers=HEADERS, timeout=15.0) as client:
        while True:
            try:
                # 1. Access the Submissions API as per your provided docs
                # URL: https://data.sec.gov/submissions/CIK##########.json
                formatted_cik = cik.zfill(10)
                url = f"https://data.sec.gov/submissions/CIK{formatted_cik}.json"

                response = await client.get(url)
                if response.status_code == 200:
                    data = response.json()
                    recent = data.get("filings", {}).get("recent", {})

                    # 2. Logic: Extract transaction metadata safely
                    # Fetch the lists once, defaulting to empty lists if they don't exist
                    forms = recent.get("form", [])
                    accessions = recent.get("accessionNumber", [])
                    confirms = recent.get("isConfirmingCopy", [])
                    dates = recent.get("reportDate", [])

                    for i, form in enumerate(forms):
                        if form == "4":
                            accession = accessions[i] if i < len(accessions) else "Unknown"
                            is_confirmatory = confirms[i] if i < len(confirms) else False
                            report_date = dates[i] if i < len(dates) else "Unknown"
                            ticker = data.get("tickers", [None])[0]

                            if not ticker:
                                logger.debug("Skipping Form 4 for CIK %s: no ticker", cik)
                                continue

                            liquidity = fetch_liquidity_metrics(ticker)
                            if not liquidity:
                                logger.debug("Skipping %s: liquidity lookup failed", ticker)
                                continue

                            payload = {
                                "cik": cik,
                                "ticker": ticker,
                                "accession_number": accession,
                                "report_date": report_date,
                                "is_confirming_copy": is_confirmatory,
                                "transaction_code": "P",  # Placeholder for Purchase
                                "source": "edgar_api_json",
                                "hunter": "insider",
                                "source_hunter": "insider",
                                "price": liquidity["price"],
                                "volume": liquidity["volume"],
                                "relative_volume": liquidity["relative_volume"],
                                "timestamp_utc": None,
                            }

                            KafkaClient.send_message(KAFKA_TOPIC_INSIDER, payload)
                            KafkaClient.send_message(RAW_EVENTS_TOPIC, payload)
                            logger.info("Signal sent for CIK %s: Accession %s", cik, accession)
            except Exception as e:
                logger.error(f"Error in RSS loop: {e}")

    # raw_data = await scrape_insider_data()
    # KafkaClient.send_message(KAFKA_TOPIC_INSIDER, {"source": "insider", "data": ...})
    logger.info("Insider Hunter finished.")
