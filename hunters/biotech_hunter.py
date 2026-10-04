import asyncio
import os
import re
from datetime import datetime, timezone

from .common.config import BIOPHARM_URL, BIOTECH_INTERVAL_SECONDS
from .common.kafka_client import KafkaClient
from .common.liquidity_lookup import fetch_liquidity_metrics
from .common.logger import get_logger
from .common.playwright_context import BrowserContext
from .common.topics import KAFKA_TOPIC_BIOTECH, RAW_EVENTS_TOPIC

logger = get_logger("biotech_hunter")


KNOWN_EXCHANGES = {"NASDAQ", "NYSE", "AMEX", "OTC", "BATS", "ARCA", "XNAS", "XNYS"}
KNOWN_COUNTRY_SUFFIXES = {"US", "TO", "V", "L", "DE", "PA", "LN", "CA", "AU"}


def _clean_ticker(raw: str | None) -> str | None:
    """
    Sanitize raw ticker string from HTML tables.
    Strips currency symbols ($), leading/trailing whitespace, newlines,
    exchange prefixes/suffixes (e.g. 'NASDAQ:BIIB' -> 'BIIB', 'BIIB:US' -> 'BIIB'),
    and validates standard 1-6 alphanumeric format.
    """
    if not raw or not isinstance(raw, str):
        return None

    # Take first line if multiple lines exist
    text = raw.split("\n")[0].strip().upper()
    # Strip leading $
    text = text.lstrip("$").strip()

    # If exchange prefix or country suffix exists (e.g. NASDAQ:BIIB, BIIB:US)
    if ":" in text:
        parts = [p.strip() for p in text.split(":") if p.strip()]
        if len(parts) == 2:
            if parts[0] in KNOWN_EXCHANGES:
                text = parts[1]
            elif parts[1] in KNOWN_COUNTRY_SUFFIXES:
                text = parts[0]
            elif (
                len(parts[1]) <= 5
                and parts[1].replace("-", "").isalnum()
                and not parts[0].replace("-", "").isalnum()
            ):
                text = parts[1]
            else:
                text = parts[0]

    # If dot suffix exists for foreign or share class (e.g. BIIB.US, BIIB.TO -> BIIB)
    if "." in text:
        suffix = text.split(".")[-1]
        if suffix in KNOWN_COUNTRY_SUFFIXES:
            text = text.split(".")[0]

    # Remove any non-alphanumeric except hyphen (e.g., BRK-B)
    cleaned = re.sub(r"[^A-Z0-9-]", "", text)
    if not cleaned or len(cleaned) > 6 or len(cleaned) < 1:
        return None

    return cleaned


async def scrape_biopharm(page):
    """
    Scrapes the BioPharmCatalyst calendar and extracts ticker data.
    """
    catalysts = []
    try:
        # 1. Navigate with a longer timeout and less strict 'wait_until'
        # 'networkidle' is often blocked or hangs on ad-heavy sites.
        logger.info("Navigating to %s", BIOPHARM_URL)
        response = await page.goto(BIOPHARM_URL, wait_until="domcontentloaded", timeout=60000)
        if response and isinstance(response.status, int) and response.status >= 400:
            raise RuntimeError("Biotech provider returned an HTTP error")

        # 2. Give the JavaScript a few seconds to actually build the table
        await asyncio.sleep(5)

        # 3. Wait up to 60 seconds for the specific table class to appear
        logger.info("Waiting for table selector...")
        await page.wait_for_selector("table", timeout=60000)

        # Extract rows
        rows = await page.query_selector_all("tr")

        for row in rows:
            cells = await row.query_selector_all("td")

            if len(cells) >= 4:
                raw_ticker = await cells[0].inner_text()
                ticker = _clean_ticker(raw_ticker)
                if not ticker:
                    continue
                drug = (await cells[1].inner_text()).strip()
                stage = (await cells[2].inner_text()).strip()
                catalyst_date = (await cells[3].inner_text()).strip()

                # Filter for high-impact phases
                if any(x in stage.upper() for x in ["PHASE 3", "PDUFA", "NDA", "BLA"]):
                    now_iso = datetime.now(timezone.utc).isoformat()
                    catalysts.append(
                        {
                            "ticker": ticker,
                            "drug_name": drug,
                            "catalyst_type": stage,
                            "event_date": catalyst_date,
                            "source": "BioPharmCatalyst",
                            "timestamp": now_iso,
                            "timestamp_utc": now_iso,
                            "hunter": "biotech",
                            "source_hunter": "biotech",
                        }
                    )

    except Exception as e:
        # await page.screenshot(path="debug_biotech.png")
        logger.error("Error during scraping: %s", e)
        if os.getenv("HUNTER_STRICT_DELIVERY") == "true":
            raise

    return catalysts


async def _one_sweep(kafka: KafkaClient) -> None:
    """Single Playwright scrape + Kafka publish."""
    browser_context = BrowserContext()
    async with browser_context as browser:
        page = await browser.new_page()
        found_catalysts = await scrape_biopharm(page)

        if not found_catalysts:
            logger.warning("No high-impact biotech catalysts found in this sweep.")
            return

        pushed = 0
        for entry in found_catalysts:
            ticker = entry.get("ticker")
            if not ticker:
                continue
            liquidity = await asyncio.to_thread(fetch_liquidity_metrics, ticker)
            if not liquidity:
                logger.debug("Skipping %s: liquidity lookup failed", ticker)
                continue
            entry["price"] = liquidity["price"]
            entry["volume"] = liquidity["volume"]
            entry["relative_volume"] = liquidity["relative_volume"]
            entry["source_hunter"] = "biotech"
            logger.info("Found Catalyst: %s - %s", entry["ticker"], entry["catalyst_type"])
            kafka.send_message(KAFKA_TOPIC_BIOTECH, entry)
            kafka.send_message(RAW_EVENTS_TOPIC, entry)
            pushed += 1
        logger.info("Successfully pushed %d signals to Kafka.", pushed)


async def run(once: bool = False):
    logger.info("Biotech Hunter starting (interval=%ss)...", BIOTECH_INTERVAL_SECONDS)
    kafka = KafkaClient()

    while True:
        try:
            await _one_sweep(kafka)
        except Exception as e:
            logger.error("Biotech sweep failed: %s", e, exc_info=True)
            if once:
                raise
            logger.info("Backing off 60s before retry...")
            await asyncio.sleep(60)
            continue

        if once:
            return

        logger.info(
            "Next biotech sweep in %s seconds (~%.0f min).",
            BIOTECH_INTERVAL_SECONDS,
            BIOTECH_INTERVAL_SECONDS / 60,
        )
        await asyncio.sleep(BIOTECH_INTERVAL_SECONDS)
