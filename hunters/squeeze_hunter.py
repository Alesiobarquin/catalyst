import asyncio
import io
from datetime import datetime

import pandas as pd
from redis import Redis

from .common.config import REDIS_HOST, REDIS_PORT
from .common.kafka_client import KafkaClient
from .common.logger import get_logger
from .common.playwright_context import BrowserContext
from .common.topics import KAFKA_TOPIC_SQUEEZE, RAW_EVENTS_TOPIC

logger = get_logger("squeeze_hunter")


# The URL filters for "Short Float > 20%" (f=sh_short_o20) and uses the "Financial" view (v=131)
# We add &r={} to handle pagination
BASE_URL = "https://finviz.com/screener.ashx?v=131&f=sh_short_o20&r={}"
EMA_ALPHA = 0.2


def get_redis_client():
    try:
        client = Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
        client.ping()
        return client
    except Exception as exc:
        logger.warning("Redis unavailable for squeeze volume baselines: %s", exc)
        return None


def clean_percent(value):
    if isinstance(value, str) and "%" in value:
        try:
            # Finviz returns short interest as percentage strings like "23.40%".
            # Keep the numeric value in percentage units so downstream logic sees 23.40, not 0.234.
            return float(value.strip("%"))
        except ValueError:
            return 0.0
    return 0.0


def clean_number(value):
    if pd.isna(value):
        return None

    text = str(value).replace(",", "").strip().upper()
    if text in {"", "-"}:
        return None

    multiplier = 1.0
    if text.endswith("K"):
        multiplier = 1_000.0
        text = text[:-1]
    elif text.endswith("M"):
        multiplier = 1_000_000.0
        text = text[:-1]
    elif text.endswith("B"):
        multiplier = 1_000_000_000.0
        text = text[:-1]

    try:
        return float(text) * multiplier
    except ValueError:
        return None


def compute_relative_volume(redis_client, ticker, current_volume, avg_volume):
    baseline_key = f"vol_baseline:{ticker}"
    # Establish a sane, non-zero baseline.
    baseline_volume = avg_volume if avg_volume and avg_volume > 0 else None

    if redis_client is not None:
        stored_baseline = redis_client.get(baseline_key)
        if stored_baseline is not None:
            try:
                baseline_volume = float(stored_baseline)
            except ValueError:
                baseline_volume = baseline_volume

    relative_volume = 0.0
    if baseline_volume and baseline_volume > 0 and current_volume and current_volume > 0:
        relative_volume = float(current_volume) / float(baseline_volume)

    if redis_client is not None and current_volume and current_volume > 0:
        # If we still do not have a baseline, seed it from the current volume.
        if not baseline_volume or baseline_volume <= 0:
            next_baseline = float(current_volume)
        else:
            next_baseline = (EMA_ALPHA * float(current_volume)) + (
                (1 - EMA_ALPHA) * float(baseline_volume)
            )
        if next_baseline > 0:
            redis_client.set(baseline_key, next_baseline)

    return round(relative_volume, 4)


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
    redis_client = get_redis_client()

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
                    if any("ticker" in c for c in cols):
                        score += 3
                    if any("price" in c for c in cols):
                        score += 2
                    if any("volume" in c for c in cols):
                        score += 2
                    if any("float" in c for c in cols) or any("short" in c for c in cols):
                        score += 2

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
                target_df.columns = [
                    str(c).lower().strip().replace(" ", "_") for c in target_df.columns
                ]

                # Filter out garbage rows
                if "ticker" in target_df.columns:
                    # 1. Drop rows where ticker is NaN/None
                    clean_df = target_df.dropna(subset=["ticker"]).copy()

                    # 2. Drop rows where ticker equals the header 'Ticker' or contains 'Ticker'
                    clean_df = clean_df[clean_df["ticker"].astype(str).str.lower() != "ticker"]

                    # 3. Drop rows with "Reset Filters" or other UI text (length > 10 usually junk for a ticker)
                    clean_df = clean_df[clean_df["ticker"].astype(str).str.len() < 10]
                else:
                    logger.warning(
                        "   -> 'ticker' column not found in selected table. Skipping page."
                    )
                    break

                if clean_df.empty:
                    logger.info("   -> Page empty (after cleaning). Stopping.")
                    break

                # Find correct columns (fuzzy match if needed, but view 131 is usually stable)
                # View 131 columns: Ticker, Market Cap, Outstanding, Float, Insider Own, Insider Trans, Inst Own, Inst Trans, Short Float, Short Ratio, Avg Volume, Price, Change, Volume

                # Map 'short_float'
                if "short_float" in clean_df.columns:
                    clean_df["short_float_val"] = clean_df["short_float"].apply(clean_percent)
                else:
                    clean_df["short_float_val"] = 0.0

                # Clean Price and Volume
                # Ensure we are using the correct columns
                if "price" in clean_df.columns:
                    clean_df["price_val"] = clean_df["price"].apply(clean_number)
                else:
                    clean_df["price_val"] = None

                if "volume" in clean_df.columns:
                    clean_df["volume_val"] = clean_df["volume"].apply(clean_number)
                else:
                    clean_df["volume_val"] = None

                if "avg_volume" in clean_df.columns:
                    clean_df["avg_volume_val"] = clean_df["avg_volume"].apply(clean_number)
                else:
                    clean_df["avg_volume_val"] = None

                # short_ratio is Finviz's days-to-cover (short shares / avg daily volume)
                if "short_ratio" in clean_df.columns:
                    clean_df["short_ratio_val"] = clean_df["short_ratio"].apply(clean_number)
                else:
                    clean_df["short_ratio_val"] = None

                # --- FORMATTING OUTPUT ---
                page_results = []
                for _, row in clean_df.iterrows():
                    # Validations
                    if pd.isna(row["ticker"]) or not row["ticker"]:
                        continue
                    if row["volume_val"] is None or pd.isna(row["volume_val"]):
                        continue

                    # Filter out invalid numeric data if strictness is required
                    # For now, we allow nulls but prefer valid data
                    ticker = str(row["ticker"]).strip().upper()
                    current_volume = float(row["volume_val"])
                    avg_volume = (
                        float(row["avg_volume_val"])
                        if row["avg_volume_val"] is not None and not pd.isna(row["avg_volume_val"])
                        else None
                    )
                    relative_volume = compute_relative_volume(
                        redis_client=redis_client,
                        ticker=ticker,
                        current_volume=current_volume,
                        avg_volume=avg_volume,
                    )

                    days_to_cover = (
                        float(row["short_ratio_val"])
                        if row["short_ratio_val"] is not None
                        and not pd.isna(row["short_ratio_val"])
                        else None
                    )

                    signal = {
                        "hunter": "squeeze",
                        "ticker": ticker,
                        "price": row["price_val"],
                        "short_float": row["short_float_val"],
                        "volume": int(current_volume),
                        "relative_volume": relative_volume,
                        "days_to_cover": days_to_cover,
                        "timestamp": datetime.now().isoformat(),
                    }

                    # --- PRE-EMISSION FILTERS ---
                    price = signal["price"]
                    if price is None or not (2.00 <= price <= 60.00):
                        logger.debug(
                            "SKIP %s: price %.2f out of range [2.00, 60.00]", ticker, price or 0
                        )
                        continue

                    if current_volume < 200_000:
                        logger.debug(
                            "SKIP %s: volume %d below 200,000", ticker, int(current_volume)
                        )
                        continue

                    if relative_volume < 2.0:
                        logger.debug(
                            "SKIP %s: relative_volume %.2f below 2.0", ticker, relative_volume
                        )
                        continue

                    if signal["short_float"] < 25.0:
                        logger.debug(
                            "SKIP %s: short_float %.2f%% below 25%%", ticker, signal["short_float"]
                        )
                        continue

                    if days_to_cover is not None and days_to_cover < 3.0:
                        logger.debug("SKIP %s: days_to_cover %.2f below 3.0", ticker, days_to_cover)
                        continue

                    # Final sanity check to avoid sending "Header-like" rows that slipped through
                    # "export" is a link at the bottom of the table sometimes picked up
                    if (
                        signal["ticker"]
                        and len(signal["ticker"]) <= 6
                        and signal["ticker"].lower() != "export"
                    ):
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
            KafkaClient.send_message(RAW_EVENTS_TOPIC, signal)
    else:
        logger.info("No signals to push.")


if __name__ == "__main__":
    asyncio.run(run())
