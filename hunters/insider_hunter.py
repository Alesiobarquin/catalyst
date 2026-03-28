from collections import deque
import asyncio
import httpx
import xml.etree.ElementTree as ET
from .common.logger import get_logger
from .common.kafka_client import KafkaClient
from .common.config import KAFKA_TOPIC_INSIDER, SEC_RSS_URL

logger = get_logger("insider_hunter")

SEC_RSS_URL = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&output=atom"

HEADERS = {
    "User-Agent": "CatalystBot yourname@example.com",
    "Accept-Encoding": "gzip, deflate"
}

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

        xml_files = [
            f for f in parser.xml_files
            if not f.endswith(".xsd")
            and "xsl" not in f.lower()
            and not any(x in f.lower() for x in ["r2.htm", "r3.htm"])
        ]

        if not xml_files:
            logger.warning(f"No XML file found in folder: {folder_url}")
            return None

        preferred = [f for f in xml_files if any(k in f.lower() for k in ["form4", "wf-form", "doc4"])]
        chosen = preferred[0] if preferred else xml_files[0]

        full_url = f"https://www.sec.gov{chosen}" if chosen.startswith("/") else f"{folder_url}{chosen}"

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

            if txn_code not in SIGNAL_CODES:
                continue

            amounts_el = txn.find("transactionAmounts")
            shares_str = get_text(amounts_el, "transactionShares") if amounts_el is not None else None
            price_str = get_text(amounts_el, "transactionPricePerShare") if amounts_el is not None else None

            post_el = txn.find("postTransactionAmounts")
            shares_owned_after = get_text(post_el, "sharesOwnedFollowingTransaction") if post_el is not None else None

            ownership_el = txn.find("ownershipNature")
            ownership_type = get_text(ownership_el, "directOrIndirectOwnership") if ownership_el is not None else None

            shares = float(shares_str) if shares_str else None
            price = float(price_str) if price_str else None
            total_value = round(shares * price, 2) if shares and price else None

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
    processed_accessions_order = deque(maxlen=500)
    processed_accessions = set()

    async with httpx.AsyncClient(headers=HEADERS, timeout=15.0) as client:
        while True:
            try:
                response = await client.get(SEC_RSS_URL)

                if response.status_code == 200:
                    root = ET.fromstring(response.content)
                    entries = root.findall('atom:entry', NS)

                    for entry in entries:
                        title_el = entry.find('atom:title', NS)
                        link_el = entry.find('atom:link', NS)

                        if title_el is None or link_el is None:
                            logger.warning("Skipping malformed entry: missing title or link")
                            continue

                        title = title_el.text or ""
                        link = link_el.attrib.get('href', '')
                        if not link:
                            continue

                        accession = link.split('/')[-1].replace('-index.htm', '')

                        if accession in processed_accessions:
                            continue

                        try:
                            cik = title.split('(')[1].split(')')[0]
                        except IndexError:
                            cik = "Unknown"

                        xml_url = await fetch_filing_xml(client, link, cik)
                        if not xml_url:
                            processed_accessions.add(accession)
                            processed_accessions_order.append(accession)
                            continue

                        xml_resp = await client.get(xml_url)
                        if xml_resp.status_code != 200:
                            logger.warning(f"Failed to fetch XML: {xml_url}")
                            processed_accessions.add(accession)
                            processed_accessions_order.append(accession)
                            continue

                        signals = parse_form4_xml(xml_resp.content, cik, accession, xml_url)

                        for signal in signals:
                            KafkaClient.send_message(KAFKA_TOPIC_INSIDER, signal)

                            shares_str = f"{signal['shares']:,.0f}" if signal['shares'] else "?"
                            price_str  = f"${signal['pricePerShare']}" if signal['pricePerShare'] else "$?"
                            value_str  = f"${signal['totalValue']:,.0f}" if signal['totalValue'] else "$?"
                            roles_str  = ', '.join(signal['insiderRoles']) if signal['insiderRoles'] else "Unknown"

                            logger.info(
                                f"[{signal['signalStrength']}] {signal['ticker']} | "
                                f"{signal['insiderName']} ({roles_str}) | "
                                f"{signal['transactionType']} {shares_str} shares "
                                f"@ {price_str} = {value_str}"
                            )

                        if not signals:
                            logger.debug(f"No actionable signals in {accession}")

                        processed_accessions.add(accession)
                        processed_accessions_order.append(accession)

                        if len(processed_accessions) > 500:
                            oldest = processed_accessions_order[0]
                            processed_accessions.discard(oldest)

                        await asyncio.sleep(0.5)

                else:
                    logger.error(f"SEC Feed Error: {response.status_code}")

            except Exception as e:
                logger.error(f"Error in RSS loop: {e}")

            logger.debug("Sleeping for 60 seconds...")
            await asyncio.sleep(60)


if __name__ == "__main__":
    asyncio.run(run())