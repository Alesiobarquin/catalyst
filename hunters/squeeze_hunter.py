import asyncio
import io
import pandas as pd
from datetime import datetime
from .common.config import KAFKA_TOPIC_SQUEEZE
from .common.logger import get_logger
from .common.playwright_context import BrowserContext
from .common.kafka_client import KafkaClient

logger = get_logger("squeeze_hunter")


# The URL filters for "Short Float > 20%" (f=sh_short_o20) and uses the "Financial" view (v=131)
# We add &r={} to handle pagination
BASE_URL = "https://finviz.com/screener.ashx?v=131&f=sh_short_o20&r={}"

async def fetch_squeeze_targets():
    """
    Scrapes Finviz for high short interest stocks using a headless browser.
    Iterates through pages until no more data is found or a limit is reached.
    Uses 'Financial' view (v=131) to ensure 'Short Float' data is present.
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
                
                # Use Pandas to find the table automatically
                # WRAPPED in StringIO to silence FutureWarning
                dfs = pd.read_html(io.StringIO(content))
                
                target_df = None
                
                # Debugging: Log what we found
                logger.info(f"   -> Found {len(dfs)} tables on page.")
                
                # Intelligent Table Selection
                best_len = 0
                for i, df in enumerate(dfs):
                    cols = [str(c).lower() for c in df.columns]
                    # Score based on essential columns
                    score = 0
                    if any('ticker' in c for c in cols): score += 3
                    if any('price' in c for c in cols): score += 2
                    if any('volume' in c for c in cols): score += 2
                    if any('float' in c for c in cols) or any('short' in c for c in cols): score += 2
                    
                    # Log candidate tables
                    if score >= 5:
                         logger.debug(f"   Candidate Table {i}: Score {score}, Shape {df.shape}")
                         if len(df) > best_len:
                             target_df = df
                             best_len = len(df)

                if target_df is None:
                    logger.info("   -> No valid data tables found. Stopping.")
                    break

                # --- DATA CLEANING ---
                # Normalize columns
                target_df.columns = [str(c).lower().strip().replace(' ', '_') for c in target_df.columns]
                
                # Filter out garbage rows
                if 'ticker' in target_df.columns:
                    # 1. Drop rows where ticker is NaN/None
                    clean_df = target_df.dropna(subset=['ticker']).copy()
                    
                    # 2. Drop rows where ticker equals the header 'Ticker' or contains 'Ticker'
                    clean_df = clean_df[clean_df['ticker'].astype(str).str.lower() != 'ticker']
                    
                    # 3. Drop rows with "Reset Filters" or other UI text (length > 10 usually junk for a ticker)
                    clean_df = clean_df[clean_df['ticker'].astype(str).str.len() < 10]
                else:
                    logger.warning("   -> 'ticker' column not found in selected table. Skipping page.")
                    break
                
                if clean_df.empty:
                    logger.info("   -> Page empty (after cleaning). Stopping.")
                    break

                # Helper function to convert "20.50%" string to 0.205 float
                def clean_percent(x):
                    if isinstance(x, str) and '%' in x:
                        try:
                            # Handle cases like "23.40%" -> 0.234
                            return float(x.strip('%')) / 100
                        except ValueError:
                            return 0.0
                    return 0.0
                
                # Helper function to clean numeric strings with commas/suffixes
                def clean_number(x):
                    if pd.isna(x): return None
                    x = str(x).replace(',', '').strip()
                    if x == '-': return None
                    try:
                        return float(x)
                    except:
                        return None

                # Find correct columns (fuzzy match if needed, but view 131 is usually stable)
                # View 131 columns: Ticker, Market Cap, Outstanding, Float, Insider Own, Insider Trans, Inst Own, Inst Trans, Short Float, Short Ratio, Avg Volume, Price, Change, Volume
                
                # Map 'short_float'
                if 'short_float' in clean_df.columns:
                     clean_df['short_float_val'] = clean_df['short_float'].apply(clean_percent)
                else:
                     clean_df['short_float_val'] = 0.0

                # Clean Price and Volume
                # Ensure we are using the correct columns
                if 'price' in clean_df.columns:
                    clean_df['price_val'] = clean_df['price'].apply(clean_number)
                else:
                     clean_df['price_val'] = None

                if 'volume' in clean_df.columns:
                    clean_df['volume_val'] = clean_df['volume'].apply(clean_number)
                else:
                     clean_df['volume_val'] = None

                # --- FORMATTING OUTPUT ---
                page_results = []
                for _, row in clean_df.iterrows():
                    # Validations
                    if pd.isna(row['ticker']) or not row['ticker']: continue
                    
                    # Filter out invalid numeric data if strictness is required
                    # For now, we allow nulls but prefer valid data
                    
                    signal = {
                        "hunter": "squeeze",
                        "ticker": str(row['ticker']),
                        "price": row['price_val'],
                        "short_float": row['short_float_val'],
                        "volume": int(row['volume_val']) if row['volume_val'] is not None and not pd.isna(row['volume_val']) else None,
                        "timestamp": datetime.now().isoformat()
                    }
                    

                    # Final sanity check to avoid sending "Header-like" rows that slipped through
                    # "export" is a link at the bottom of the table sometimes picked up
                    if signal['ticker'] and len(signal['ticker']) <= 6 and signal['ticker'].lower() != 'export': 
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
                import traceback
                logger.error(traceback.format_exc())
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