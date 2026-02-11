import asyncio
import io
import pandas as pd
from datetime import datetime
from .common.config import KAFKA_TOPIC_SQUEEZE
from .common.logger import get_logger
from .common.playwright_context import BrowserContext
from .common.kafka_client import KafkaClient

logger = get_logger("squeeze_hunter")

# The URL filters for "Short Float > 20%" (f=sh_short_o20)
# We add &r={} to handle pagination
BASE_URL = "https://finviz.com/screener.ashx?v=111&f=sh_short_o20&r={}"

async def fetch_squeeze_targets():
    """
    Scrapes Finviz for high short interest stocks using a headless browser.
    Iterates through pages until no more data is found or a limit is reached.
    """
    logger.info("🕵️ Squeeze Hunter waking up...")
    
    all_results = []
    start_index = 1
    max_results = 200  # Safety limit to prevent infinite loops
    
    async with BrowserContext() as context:
        page = await context.new_page()
        
        while len(all_results) < max_results:
            url = BASE_URL.format(start_index)
            logger.info(f"   -> Navigating to Finviz (Start Index: {start_index})...")
            
            try:
                # 'domcontentloaded' is faster than 'networkidle'
                await page.goto(url, wait_until="domcontentloaded")
                
                # Extract the page HTML content
                content = await page.content()
                
                # Check directly if there are results by looking for the "No matches" text or similar
                # Finviz shows "Total: 0" or similar if empty, but checking table existence is robust
                
                # Use Pandas to find the table automatically
                # WRAPPED in StringIO to silence FutureWarning
                dfs = pd.read_html(io.StringIO(content))
                
                target_df = None
                
                # Debugging: Log what we found
                logger.info(f"   -> Found {len(dfs)} tables on page.")
                
                for i, df in enumerate(dfs):
                    logger.debug(f"   Table {i} columns: {df.columns.tolist()}")
                    # Loose matching: Just look for 'Ticker'
                    if 'Ticker' in df.columns:
                        target_df = df
                        break
                
                if target_df is None and dfs:
                    # Fallback: Try the largest table if we found any
                    logger.warning("   -> Exact match not found. Trying largest table.")
                    target_df = max(dfs, key=lambda x: len(x))

                if target_df is None:
                    logger.info("   -> No data tables found. Stopping.")
                    break

                # --- DATA CLEANING ---
                target_df.columns = [str(c).lower().replace(' ', '_') for c in target_df.columns]
                
                # Filter out the header rows that are repeated in the table sometimes
                if 'ticker' in target_df.columns:
                    clean_df = target_df[target_df['ticker'] != 'Ticker'].copy()
                else:
                    clean_df = target_df.copy()
                
                if clean_df.empty:
                    logger.info("   -> Page empty. Stopping.")
                    break

                # Helper function to convert "20.50%" string to 0.205 float
                def clean_percent(x):
                    if isinstance(x, str) and '%' in x:
                        try:
                            return float(x.strip('%')) / 100
                        except ValueError:
                            return 0.0
                    return 0.0

                if 'float_short' in clean_df.columns:
                    clean_df['short_float'] = clean_df['float_short'].apply(clean_percent)
                else:
                    clean_df['short_float'] = 0.0

                clean_df['price'] = pd.to_numeric(clean_df['price'], errors='coerce')
                clean_df['volume'] = pd.to_numeric(clean_df['volume'], errors='coerce')

                # --- FORMATTING OUTPUT ---
                page_results = []
                for _, row in clean_df.iterrows():
                    signal = {
                        "hunter": "squeeze",
                        "ticker": row['ticker'],
                        "price": row['price'],
                        "short_float": row['short_float'],
                        "volume": row['volume'],
                        "timestamp": datetime.now().isoformat()
                    }
                    page_results.append(signal)
                
                all_results.extend(page_results)
                logger.info(f"   -> Scraped {len(page_results)} items from this page.")

                # If we got fewer than 20 results, it's likely the last page
                if len(page_results) < 20:
                    break
                
                # Move to next page
                start_index += 20
                
                # Be nice to the server
                await asyncio.sleep(1)

            except Exception as e:
                logger.error(f"   ❌ Error on index {start_index}: {e}")
                break
    
    logger.info(f"   ✅ Success: Found total {len(all_results)} potential squeeze targets.")
    return all_results

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