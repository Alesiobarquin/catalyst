import asyncio
from datetime import datetime

from .common.config import BIOPHARM_URL, BIOTECH_INTERVAL_SECONDS
from .common.kafka_client import KafkaClient
from .common.liquidity_lookup import fetch_liquidity_metrics
from .common.logger import get_logger
from .common.playwright_context import BrowserContext
from .common.topics import KAFKA_TOPIC_BIOTECH, RAW_EVENTS_TOPIC

logger = get_logger("biotech_hunter")


async def scrape_biopharm(page):
    """
    Scrapes the BioPharmCatalyst calendar and extracts ticker data.
    """
    catalysts = []
    try:
        # 1. Navigate with a longer timeout and less strict 'wait_until'
        # 'networkidle' is often blocked or hangs on ad-heavy sites.
        logger.info(f"Navigating to {BIOPHARM_URL}")
        await page.goto(BIOPHARM_URL, wait_until="domcontentloaded", timeout=60000)

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
                ticker = (await cells[0].inner_text()).strip().upper()
                drug = (await cells[1].inner_text()).strip()
                stage = (await cells[2].inner_text()).strip()
                catalyst_date = (await cells[3].inner_text()).strip()

                # Filter for high-impact phases
                if any(x in stage.upper() for x in ["PHASE 3", "PDUFA", "NDA", "BLA"]):
                    catalysts.append(
                        {
                            "ticker": ticker,
                            "drug_name": drug,
                            "catalyst_type": stage,
                            "event_date": catalyst_date,
                            "source": "BioPharmCatalyst",
                            "timestamp": datetime.utcnow().isoformat(),
                            "hunter": "biotech",
                        }
                    )

    except Exception as e:
        # await page.screenshot(path="debug_biotech.png")
        logger.error(f"Error during scraping: {str(e)}")

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
            liquidity = fetch_liquidity_metrics(ticker)
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


async def run():
    logger.info("Biotech Hunter starting (interval=%ss)...", BIOTECH_INTERVAL_SECONDS)
    kafka = KafkaClient()

    while True:
        try:
            await _one_sweep(kafka)
        except Exception as e:
            logger.error("Biotech sweep failed: %s", e, exc_info=True)
            logger.info("Backing off 60s before retry...")
            await asyncio.sleep(60)
            continue

        logger.info(
            "Next biotech sweep in %s seconds (~%.0f min).",
            BIOTECH_INTERVAL_SECONDS,
            BIOTECH_INTERVAL_SECONDS / 60,
        )
        await asyncio.sleep(BIOTECH_INTERVAL_SECONDS)
