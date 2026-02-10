import asyncio
import json
import pandas as pd
from datetime import datetime
from typing import List, Dict, Any

# Internal imports based on your file structure
from hunters.common.logger import setup_logger
from hunters.common.kafka_client import KafkaProducerWrapper
from hunters.common.config import KAFKA_TOPIC_SQUEEZE, FINVIZ_SQUEEZE_URL
from hunters.common.playwright_context import PlaywrightContext

# Initialize Logger
logger = setup_logger("squeeze_hunter")

class SqueezeHunter:
    def __init__(self):
        self.producer = KafkaProducerWrapper()
        self.url = FINVIZ_SQUEEZE_URL  # https://finviz.com/screener.ashx?v=111&f=sh_short_o20
        self.columns_map = {
            'Ticker': 'ticker',
            'Company': 'company',
            'Sector': 'sector',
            'Industry': 'industry',
            'Country': 'country',
            'Market Cap': 'market_cap',
            'P/E': 'pe_ratio',
            'Price': 'price',
            'Change': 'change_pct',
            'Volume': 'volume',
            'Float Short': 'short_float' # The key metric
        }

    async def fetch_squeeze_targets(self) -> List[Dict[str, Any]]:
        """
        Uses Playwright to render Finviz and extracts the table data using Pandas.
        """
        logger.info(f"Starting hunt on: {self.url}")
        
        async with PlaywrightContext() as page:
            try:
                # Navigate to Finviz with the specific Short Interest filter
                await page.goto(self.url, wait_until="domcontentloaded")
                
                # Finviz creates the table dynamically. Wait for the main table row.
                # The table usually has a class 'table-light' or similar generic identifiers.
                # We wait for a specific ticker link to ensure data is loaded.
                await page.wait_for_selector("table.table-light", timeout=10000)

                # Extract the HTML content
                html_content = await page.content()
                
                # Use Pandas to parse the HTML table efficiently
                # We look for the table containing "Ticker" and "Price"
                dfs = pd.read_html(html_content, match="Ticker")
                
                if not dfs:
                    logger.warning("No tables found on Finviz page.")
                    return []

                # usually the main screener table is the last one or the largest one
                df = dfs[-1] 

                # Clean up the dataframe
                # 1. Rename columns to match our internal schema
                df = df.rename(columns=self.columns_map)
                
                # 2. Filter for only the columns we care about
                target_columns = [c for c in self.columns_map.values() if c in df.columns]
                df = df[target_columns]

                # 3. Data Cleaning (Convert percentages, numbers)
                # Remove '%' from change_pct and short_float if present
                if 'short_float' in df.columns:
                    df['short_float'] = df['short_float'].astype(str).str.rstrip('%').replace('-', '0')
                
                if 'change_pct' in df.columns:
                    df['change_pct'] = df['change_pct'].astype(str).str.rstrip('%').replace('-', '0')

                # Convert to list of dicts
                targets = df.to_dict(orient='records')
                
                logger.info(f"Successfully extracted {len(targets)} potential squeeze targets.")
                return targets

            except Exception as e:
                logger.error(f"Failed to fetch data from Finviz: {e}")
                return []

    async def publish_signals(self, targets: List[Dict[str, Any]]):
        """
        Publishes valid squeeze targets to the 'signal-squeeze' Kafka topic.
        """
        for target in targets:
            # Basic validation: Ensure we actually have a ticker and high short interest
            if not target.get('ticker') or target.get('short_float') == '0':
                continue

            message = {
                "source": "SqueezeHunter",
                "timestamp": datetime.utcnow().isoformat(),
                "event_type": "short_squeeze_candidate",
                "data": target
            }
            
            # Key the message by Ticker to ensure partition ordering
            await self.producer.send(
                topic=KAFKA_TOPIC_SQUEEZE, 
                key=target['ticker'], 
                value=message
            )
            logger.debug(f"Published signal for {target['ticker']}")

    async def run(self):
        """
        Main execution loop.
        """
        logger.info("Squeeze Hunter initialized. Stalking high short interest stocks...")
        
        while True:
            try:
                # 1. Hunt
                targets = await self.fetch_squeeze_targets()
                
                # 2. Publish
                if targets:
                    await self.publish_signals(targets)
                
                # 3. Sleep
                # Finviz data doesn't change second-by-second. 
                # Checking every 15-30 minutes is usually sufficient to catch intraday moves.
                # Adjust based on your API limits/preference.
                sleep_minutes = 15
                logger.info(f"Hunt complete. Sleeping for {sleep_minutes} minutes.")
                await asyncio.sleep(sleep_minutes * 60)

            except Exception as e:
                logger.error(f"Critical error in Squeeze Hunter loop: {e}")
                await asyncio.sleep(60) # Short sleep on error before retrying

if __name__ == "__main__":
    hunter = SqueezeHunter()
    asyncio.run(hunter.run())