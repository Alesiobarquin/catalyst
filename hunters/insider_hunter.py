import asyncio
import time
import xml.etree.ElementTree as ET
from datetime import UTC, date, datetime, timedelta
from html.parser import HTMLParser

import httpx

from .common.config import (
    INSIDER_LOOKBACK_HOURS,
    INSIDER_MAX_PAGES,
    INSIDER_MAX_TRADE_AGE_DAYS,
    SEC_RSS_URL,
    SEC_USER_AGENT,
)
from .common.http_retry import async_http_get_with_retry
from .common.kafka_client import KafkaClient
from .common.liquidity_lookup import fetch_liquidity_metrics
from .common.logger import get_logger
from .common.provider_errors import ProviderError
from .common.tickers import canonical_ticker
from .common.topics import KAFKA_TOPIC_INSIDER, RAW_EVENTS_TOPIC

logger = get_logger("insider_hunter")

NS = {"atom": "http://www.w3.org/2005/Atom"}
FEED_PAGE_SIZE = 100
# SEC fair access allows at most 10 requests per second per client.
SEC_MIN_INTERVAL_SECONDS = 0.125
FILING_CONCURRENCY = 4
MAX_REMEMBERED_ACCESSIONS = 5000

# Only open-market purchases (P) and sales (S) are signals; grants, exercises,
# tax withholding and gifts are not.
SIGNAL_CODES = {"P", "S"}
EXECUTIVE_TITLES = (
    "ceo",
    "chief executive",
    "cfo",
    "chief financial",
    "coo",
    "chief operating",
    "president",
    "director",
)


class _RateLimiter:
    def __init__(self, interval: float):
        self._interval = interval
        self._lock = asyncio.Lock()
        self._next = 0.0

    async def wait(self) -> None:
        async with self._lock:
            delay = self._next - time.monotonic()
            if delay > 0:
                await asyncio.sleep(delay)
            self._next = time.monotonic() + self._interval


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


def _flag(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true"}


def _to_float(value: str | None) -> float | None:
    try:
        return float(value) if value else None
    except ValueError:
        return None


def parse_feed(content: bytes) -> list[dict]:
    """Parse EDGAR's current-filings Atom feed, newest first."""
    entries = []
    for entry in ET.fromstring(content).findall("atom:entry", NS):
        title = entry.findtext("atom:title", default="", namespaces=NS)
        link_el = entry.find("atom:link", NS)
        link = link_el.attrib.get("href", "") if link_el is not None else ""
        category = entry.find("atom:category", NS)
        try:
            updated = datetime.fromisoformat(
                entry.findtext("atom:updated", default="", namespaces=NS)
            )
        except ValueError:
            updated = None
        try:
            cik = title.split("(")[1].split(")")[0]
        except IndexError:
            cik = "Unknown"
        entries.append(
            {
                "accession": link.split("/")[-1].replace("-index.htm", ""),
                "cik": cik,
                "link": link,
                "form": category.attrib.get("term") if category is not None else None,
                "updated": updated,
            }
        )
    return entries


async def fetch_recent_entries(
    client: httpx.AsyncClient, limiter: _RateLimiter, now: datetime
) -> list[dict]:
    """Page the current Form 4 feed back to the lookback cutoff, one entry per filing."""
    cutoff = now - timedelta(hours=INSIDER_LOOKBACK_HOURS)
    seen: set[str] = set()
    recent: list[dict] = []
    for page in range(INSIDER_MAX_PAGES):
        await limiter.wait()
        url = f"{SEC_RSS_URL}&count={FEED_PAGE_SIZE}&start={page * FEED_PAGE_SIZE}"
        response = await async_http_get_with_retry(client, url, custom_logger=logger)
        if response.status_code != 200:
            raise ProviderError("sec", "http_error", response.status_code)
        entries = parse_feed(response.content)
        for entry in entries:
            if entry["updated"] is not None and entry["updated"] < cutoff:
                return recent
            if not entry["link"] or entry["form"] not in (None, "4"):
                continue
            if entry["accession"] not in seen:
                seen.add(entry["accession"])
                recent.append(entry)
        if len(entries) < FEED_PAGE_SIZE:
            break
    return recent


class _XmlLinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.xml_files: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            for attr, val in attrs:
                if attr == "href" and val and val.endswith(".xml"):
                    self.xml_files.append(val)


async def fetch_filing_xml(
    client: httpx.AsyncClient, limiter: _RateLimiter, index_url: str, cik: str
) -> str | None:
    accession_nodash = index_url.split("/")[-1].replace("-index.htm", "").replace("-", "")
    folder_url = f"https://www.sec.gov/Archives/edgar/data/{cik.lstrip('0')}/{accession_nodash}/"
    await limiter.wait()
    resp = await async_http_get_with_retry(client, folder_url, custom_logger=logger)
    if resp.status_code != 200:
        logger.warning("Could not fetch filing folder: %s", folder_url)
        return None

    parser = _XmlLinkParser()
    parser.feed(resp.text)
    xml_files = [f for f in parser.xml_files if not f.endswith(".xsd") and "xsl" not in f.lower()]
    if not xml_files:
        logger.warning("No XML file found in folder: %s", folder_url)
        return None
    preferred = [f for f in xml_files if any(k in f.lower() for k in ["form4", "wf-form", "doc4"])]
    chosen = preferred[0] if preferred else xml_files[0]
    return f"https://www.sec.gov{chosen}" if chosen.startswith("/") else f"{folder_url}{chosen}"


def parse_form4_xml(xml_content: bytes, cik: str, accession: str, filing_url: str) -> list[dict]:
    """
    Parse a Form 4 filing into one signal per transaction code (P or S).
    Rows of the same code are aggregated, so a sale split across many rows is one event.
    """
    try:
        root = ET.fromstring(xml_content)
    except ET.ParseError as e:
        logger.error("Error parsing Form 4 XML for %s: %s", accession, e)
        return []
    if root.tag != "ownershipDocument":
        return []

    issuer = root.find("issuer")
    ticker = (
        canonical_ticker(get_text(issuer, "issuerTradingSymbol")) if issuer is not None else None
    )
    company_name = get_text(issuer, "issuerName") if issuer is not None else None

    names: list[str] = []
    roles: list[str] = []
    for owner in root.findall("reportingOwner"):
        id_el = owner.find("reportingOwnerId")
        name = get_text(id_el, "rptOwnerName") if id_el is not None else None
        if name:
            names.append(name)
        rel_el = owner.find("reportingOwnerRelationship")
        if rel_el is None:
            continue
        if _flag(get_text(rel_el, "isDirector")):
            roles.append("Director")
        if _flag(get_text(rel_el, "isOfficer")):
            roles.append(get_text(rel_el, "officerTitle") or "Officer")
        if _flag(get_text(rel_el, "isTenPercentOwner")):
            roles.append("10% Owner")
    roles = list(dict.fromkeys(roles))

    footnotes = " ".join((note.text or "") for note in root.iter("footnote")).lower()
    is_10b5_1 = _flag(root.findtext("aff10b5One")) or "10b5-1" in footnotes
    document_type = (root.findtext("documentType") or "").strip() or None

    totals: dict[str, dict] = {}
    for txn in root.findall(".//nonDerivativeTransaction"):
        code_el = txn.find("transactionCoding")
        txn_code = get_text(code_el, "transactionCode") if code_el is not None else None
        if txn_code not in SIGNAL_CODES:
            continue
        amounts_el = txn.find("transactionAmounts")
        if amounts_el is not None:
            shares = _to_float(get_text(amounts_el, "transactionShares"))
            price = _to_float(get_text(amounts_el, "transactionPricePerShare"))
        else:
            shares = price = None
        post_el = txn.find("postTransactionAmounts")
        owned_after = (
            _to_float(get_text(post_el, "sharesOwnedFollowingTransaction"))
            if post_el is not None
            else None
        )
        txn_date = get_text(txn, "transactionDate")

        agg = totals.setdefault(
            txn_code,
            {"shares": 0.0, "value": 0.0, "priced": 0.0, "rows": 0, "dates": [], "after": None},
        )
        agg["rows"] += 1
        if shares:
            agg["shares"] += shares
            if price:
                agg["value"] += shares * price
                agg["priced"] += shares
        if txn_date:
            agg["dates"].append(txn_date[:10])
        if owned_after is not None:
            agg["after"] = owned_after

    signals = []
    for txn_code, agg in totals.items():
        total_value = round(agg["value"], 2) if agg["value"] else None
        signals.append(
            {
                "hunter": "insider",
                "ticker": ticker,
                "transaction_price_per_share": (
                    round(agg["value"] / agg["priced"], 4) if agg["priced"] else None
                ),
                "transaction_code": txn_code,
                "transaction_amount_usd": total_value,
                "transaction_rows": agg["rows"],
                "transaction_date": max(agg["dates"]) if agg["dates"] else None,
                "insider_name": "; ".join(names) if names else None,
                "insider_title": ", ".join(roles) if roles else None,
                "shares": agg["shares"] or None,
                "signal_strength": classify_signal(txn_code, total_value, roles),
                "source": "edgar_form4",
                "cik": cik,
                "accession_number": accession,
                "filing_url": filing_url,
                "company_name": company_name,
                "document_type": document_type,
                "is_10b5_1": is_10b5_1,
                "is_buy": txn_code == "P",
                "is_sell": txn_code == "S",
                "shares_owned_after": agg["after"],
            }
        )
    return signals


def classify_signal(txn_code: str, total_value: float | None, roles: list[str]) -> str:
    """
    Heuristic signal strength classifier.
    Buys from C-suite executives in large size are the strongest signals.
    """
    if txn_code not in ("P", "S"):
        return "NOISE"

    is_executive = any(
        keyword in role.lower().replace("vice president", "")
        for role in roles
        for keyword in EXECUTIVE_TITLES
    )
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


def is_recent_trade(signal: dict, today: date) -> bool:
    """Amendments and late filings re-report old trades; they are not new events."""
    if signal.get("document_type") == "4/A":
        return False
    traded = signal.get("transaction_date")
    if not traded:
        return True
    try:
        return (today - date.fromisoformat(traded)).days <= INSIDER_MAX_TRADE_AGE_DAYS
    except ValueError:
        return True


async def process_filing(
    client: httpx.AsyncClient, limiter: _RateLimiter, entry: dict, today: date
) -> list[dict]:
    xml_url = await fetch_filing_xml(client, limiter, entry["link"], entry["cik"])
    if not xml_url:
        return []
    await limiter.wait()
    xml_resp = await async_http_get_with_retry(client, xml_url, custom_logger=logger)
    if xml_resp.status_code != 200:
        logger.warning("Failed to fetch XML: %s", xml_url)
        return []
    signals = parse_form4_xml(xml_resp.content, entry["cik"], entry["accession"], xml_url)
    return [signal for signal in signals if is_recent_trade(signal, today)]


async def fetch_liquidity(tickers: set[str]) -> dict[str, dict | None]:
    semaphore = asyncio.Semaphore(FILING_CONCURRENCY)

    async def one(ticker: str) -> dict | None:
        async with semaphore:
            return await asyncio.to_thread(fetch_liquidity_metrics, ticker)

    ordered = sorted(tickers)
    return dict(zip(ordered, await asyncio.gather(*(one(t) for t in ordered)), strict=True))


def publish_signal(signal: dict, liquidity: dict[str, dict | None]) -> bool:
    ticker = signal.get("ticker")
    if not ticker:
        return False
    liq = liquidity.get(ticker)
    if not liq:
        logger.warning("Skipping insider signal for %s: liquidity lookup failed", ticker)
        return False
    signal["price"] = liq["price"]
    signal["volume"] = liq["volume"]
    signal["relative_volume"] = liq["relative_volume"]
    signal["relative_volume_basis"] = liq.get("relative_volume_basis")
    signal["source_hunter"] = "insider"
    KafkaClient.send_message(KAFKA_TOPIC_INSIDER, signal)
    KafkaClient.send_message(RAW_EVENTS_TOPIC, signal)
    value = signal["transaction_amount_usd"]
    logger.info(
        "[%s] %s | %s (%s) | %s %s shares in %s row(s) = %s%s",
        signal["signal_strength"],
        ticker,
        signal["insider_name"],
        signal["insider_title"] or "Unknown",
        signal["transaction_code"],
        f"{signal['shares']:,.0f}" if signal["shares"] else "?",
        signal["transaction_rows"],
        f"${value:,.0f}" if value else "$?",
        " (10b5-1 plan)" if signal["is_10b5_1"] else "",
    )
    return True


async def sweep(client: httpx.AsyncClient, processed: dict[str, None]) -> int:
    limiter = _RateLimiter(SEC_MIN_INTERVAL_SECONDS)
    now = datetime.now(UTC)
    entries = [
        entry
        for entry in await fetch_recent_entries(client, limiter, now)
        if entry["accession"] not in processed
    ]
    semaphore = asyncio.Semaphore(FILING_CONCURRENCY)
    failures = 0

    async def one(entry: dict) -> list[dict]:
        nonlocal failures
        async with semaphore:
            try:
                return await process_filing(client, limiter, entry, now.date())
            except (httpx.HTTPError, ET.ParseError, ValueError) as exc:
                failures += 1
                logger.warning("Skipping filing %s: %s", entry["accession"], type(exc).__name__)
                return []

    results = await asyncio.gather(*(one(entry) for entry in entries))
    if entries and failures == len(entries):
        raise ProviderError("sec", "source_unavailable")

    liquidity = await fetch_liquidity(
        {signal["ticker"] for signals in results for signal in signals if signal.get("ticker")}
    )
    emitted = 0
    for entry, signals in zip(entries, results, strict=True):
        processed[entry["accession"]] = None
        for signal in signals:
            emitted += publish_signal(signal, liquidity)
    while len(processed) > MAX_REMEMBERED_ACCESSIONS:
        processed.pop(next(iter(processed)))
    logger.info(
        "Scanned %d Form 4 filings from the last %dh (%d failed); emitted %d signals.",
        len(entries),
        INSIDER_LOOKBACK_HOURS,
        failures,
        emitted,
    )
    return emitted


async def run(once: bool = False):
    if not SEC_USER_AGENT:
        if once:
            raise ProviderError("sec", "missing_configuration")
        logger.warning("SEC_USER_AGENT is empty — insider hunter idle. Set a monitored contact.")
        while True:
            await asyncio.sleep(3600)

    logger.info("Insider Hunter starting...")
    processed: dict[str, None] = {}
    headers = {"User-Agent": SEC_USER_AGENT, "Accept-Encoding": "gzip, deflate"}
    async with httpx.AsyncClient(headers=headers, timeout=15.0) as client:
        while True:
            try:
                await sweep(client, processed)
            except (httpx.HTTPError, ET.ParseError, OSError, ProviderError) as e:
                logger.error("Insider sweep failed: %s", e)
                if once:
                    raise
            if once:
                return
            await asyncio.sleep(60)


if __name__ == "__main__":
    asyncio.run(run())
