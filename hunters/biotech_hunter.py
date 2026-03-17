import asyncio
from .common.logger import get_logger
from .common.kafka_client import KafkaClient
from .common.playwright_context import BrowserContext
from .common.config import BIOPHARM_URL
from .common.topics import KAFKA_TOPIC_BIOTECH, RAW_EVENTS_TOPIC
import json
from datetime import datetime

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
                    catalysts.append({
                        "ticker": ticker,
                        "drug_name": drug,
                        "catalyst_type": stage,
                        "event_date": catalyst_date,
                        "source": "BioPharmCatalyst",
                        "timestamp": datetime.utcnow().isoformat(),
                        "hunter": "biotech"
                    })
                    
    except Exception as e:
        #await page.screenshot(path="debug_biotech.png")
        logger.error(f"Error during scraping: {str(e)}")
        
    return catalysts

async def run():
    logger.info("Biotech Hunter starting...")
    # Initialize Kafka Client
    kafka = KafkaClient()
    
    # Use the shared Playwright context
    browser_context = BrowserContext()
    
    try:
        async with browser_context as browser:
            page = await browser.new_page()
            
            # 1. Fetch data from BioPharmCatalyst
            found_catalysts = await scrape_biopharm(page)
            
            if not found_catalysts:
                logger.warning("No high-impact biotech catalysts found in this sweep.")
            else:
                # 2. Push valid signals to Kafka
                for entry in found_catalysts:
                    logger.info(f"Found Catalyst: {entry['ticker']} - {entry['catalyst_type']}")
                    
                    kafka.send_message(
                        topic=KAFKA_TOPIC_BIOTECH,
                        value=entry
                    )
                    kafka.send_message(
                        topic=RAW_EVENTS_TOPIC,
                        value=entry
                    )

                logger.info(f"Successfully pushed {len(found_catalysts)} signals to Kafka.")

        # 3. CRITICAL: Prevent rate-limiting/IP ban
        # This keeps the container alive but idle for 15 minutes.
        logger.info("Sweep complete. Sleeping for 15 minutes...")
        await asyncio.sleep(900)

    except Exception as e:
        logger.error(f"Critical failure in Biotech Hunter: {e}")
        # Sleep even on failure to prevent rapid-fire crash loops
        await asyncio.sleep(60)
    finally:
        logger.info("Biotech Hunter loop cycle finished.")
