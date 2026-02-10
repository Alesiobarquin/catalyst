import asyncio
import pandas as pd
from datetime import datetime
from .common.config import KAFKA_TOPIC_SQUEEZE
from .common.logger import get_logger
from .common.playwright_context import BrowserContext
from .common.kafka_client import KafkaClient

logger = get_logger("squeeze_hunter")

# The URL filters for "Short Float > 20%" (f=sh_short_o20)
FINVIZ_URL = "https://finviz.com/screener.ashx?v=111&f=sh_short_o20"

async def fetch_squeeze_targets():
    """
    Scrapes Finviz for high short interest stocks using a headless browser.
    """
    logger.info("🕵️ Squeeze Hunter waking up...")
    
    async with BrowserContext() as context:
        page = await context.new_page()

        try:
            logger.info("   -> Navigating to Finviz...")
            # 'domcontentloaded' is faster than 'networkidle'
            await page.goto(FINVIZ_URL, wait_until="domcontentloaded")
            
            # Extract the page HTML content
            content = await page.content()
            
            # Use Pandas to find the table automatically
            # Finviz usually puts the main data in the largest table
            dfs = pd.read_html(content)
            
            target_df = None
            for df in dfs:
                # We identify the correct table by looking for specific columns
                if 'Ticker' in df.columns and 'Float Short' in df.columns:
                    target_df = df
                    break
            
            if target_df is None:
                logger.error("   ❌ Error: Could not find data table on Finviz.")
                return []

            # --- DATA CLEANING ---
            # Rename columns to be code-friendly (lowercase, underscores)
            target_df.columns = [c.lower().replace(' ', '_') for c in target_df.columns]
            
            # Remove the header row if it repeated
            clean_df = target_df[target_df['ticker'] != 'Ticker'].copy()
            
            # Helper function to convert "20.50%" string to 0.205 float
            def clean_percent(x):
                if isinstance(x, str) and '%' in x:
                    try:
                        return float(x.strip('%')) / 100
                    except ValueError:
                        return 0.0
                return 0.0

            # Apply cleaning
            if 'float_short' in clean_df.columns:
                clean_df['short_float'] = clean_df['float_short'].apply(clean_percent)
            else:
                # Fallback if column name is different
                clean_df['short_float'] = 0.0

            clean_df['price'] = pd.to_numeric(clean_df['price'], errors='coerce')
            clean_df['volume'] = pd.to_numeric(clean_df['volume'], errors='coerce')

            # --- FORMATTING OUTPUT ---
            results = []
            for _, row in clean_df.iterrows():
                signal = {
                    "hunter": "squeeze",
                    "ticker": row['ticker'],
                    "price": row['price'],
                    "short_float": row['short_float'],
                    "volume": row['volume'],
                    "timestamp": datetime.now().isoformat()
                }
                results.append(signal)

            logger.info(f"   ✅ Success: Found {len(results)} potential squeeze targets.")
            return results

        except Exception as e:
            logger.error(f"   ❌ Critical Error during scrape: {e}")
            return []

async def run():
    # 1. Scrape
    signals = await fetch_squeeze_targets()
    
    # 2. Push
    if signals:
        for signal in signals:
             KafkaClient.send_message(KAFKA_TOPIC_SQUEEZE, signal)
    else:
        logger.info("No signals to push.")

if __name__ == "__main__":
    asyncio.run(run())