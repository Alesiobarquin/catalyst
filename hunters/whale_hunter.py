"""
Whale hunter — unusual stock options activity from Barchart (Playwright scrape).

Emits rows to signal-whale + raw-events with underlying liquidity for Gatekeeper.
"""

from __future__ import annotations

import asyncio
import re
from datetime import datetime, timezone

from .common.config import BARCHART_URL, WHALE_INTERVAL_SECONDS
from .common.kafka_client import KafkaClient
from .common.liquidity_lookup import fetch_liquidity_metrics
from .common.logger import get_logger
from .common.playwright_context import BrowserContext
from .common.topics import KAFKA_TOPIC_WHALE, RAW_EVENTS_TOPIC

logger = get_logger("whale_hunter")

_CALL_PUT = re.compile(r"\b(call|put)\b", re.I)
_TICKER_CLEAN = re.compile(r"^[A-Z]{1,6}$")


def _parse_option_type(text: str) -> str:
    m = _CALL_PUT.search(text or "")
    if not m:
        return "call"
    return "put" if m.group(1).lower() == "put" else "call"


def _first_float(cells: list[str]) -> float | None:
    for c in cells:
        for token in re.split(r"[\s,]+", c):
            try:
                v = float(token.replace(",", "").replace("$", ""))
                if 0.01 < v < 1e6:
                    return v
            except ValueError:
                continue
    return None


async def scrape_whale(page) -> list[dict]:
    """Best-effort parse of Barchart unusual-activity table (layout may change)."""
    found: list[dict] = []
    logger.info("Navigating to %s", BARCHART_URL)
    await page.goto(BARCHART_URL, wait_until="domcontentloaded", timeout=120000)
    await asyncio.sleep(5)
    await page.wait_for_selector("table tbody tr", timeout=90000)
    rows = await page.query_selector_all("table tbody tr")
    seen: set[tuple[str, float, str]] = set()

    for row in rows[:120]:
        cells_el = await row.query_selector_all("td")
        if len(cells_el) < 2:
            continue
        texts = [((await c.inner_text()) or "").strip() for c in cells_el]
        joined = " ".join(texts)

        ticker = ""
        link = await row.query_selector("a[href*='stock'], a[href*='quote'], a[href*='symbol']")
        if link:
            raw = ((await link.inner_text()) or "").strip().upper()
            raw = re.sub(r"[^A-Z]", "", raw)
            if _TICKER_CLEAN.match(raw):
                ticker = raw
        if not ticker:
            first = re.sub(r"[^A-Z]", "", (texts[0] or "").upper())
            if _TICKER_CLEAN.match(first):
                ticker = first
        if not ticker:
            continue

        opt_type = _parse_option_type(joined)
        strike = _first_float(texts[1:]) or 0.0
        vol_hint = _first_float(texts[-3:])  # rough heuristic

        key = (ticker, round(strike, 4), opt_type)
        if key in seen:
            continue
        seen.add(key)

        found.append(
            {
                "ticker": ticker,
                "option_type": opt_type,
                "strike_price": strike,
                "option_volume": int(vol_hint) if vol_hint and vol_hint > 10 else None,
                "source": "barchart_unusual",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "hunter": "whale",
            }
        )

    return found


async def _one_sweep(kafka: KafkaClient) -> int:
    browser_context = BrowserContext()
    async with browser_context as browser:
        page = await browser.new_page()
        rows = await scrape_whale(page)

    if not rows:
        logger.warning("No unusual-activity rows parsed (site layout or blocking).")
        return 0

    pushed = 0
    for entry in rows:
        ticker = entry.get("ticker")
        if not ticker:
            continue
        liq = fetch_liquidity_metrics(ticker)
        if not liq:
            logger.debug("Skipping %s: liquidity lookup failed", ticker)
            continue
        entry["price"] = liq["price"]
        entry["volume"] = liq["volume"]
        entry["relative_volume"] = liq["relative_volume"]
        entry["source_hunter"] = "whale"
        kafka.send_message(KAFKA_TOPIC_WHALE, entry)
        kafka.send_message(RAW_EVENTS_TOPIC, entry)
        pushed += 1
        logger.info("Whale signal %s %s @ %s", ticker, entry.get("option_type"), entry.get("strike_price"))

    return pushed


async def run():
    logger.info("Whale Hunter starting (interval=%ss)...", WHALE_INTERVAL_SECONDS)
    kafka = KafkaClient()
    while True:
        try:
            n = await _one_sweep(kafka)
            logger.info("Whale sweep pushed %s signals.", n)
        except Exception as e:
            logger.error("Whale sweep failed: %s", e, exc_info=True)
            await asyncio.sleep(60)
            continue

        await asyncio.sleep(WHALE_INTERVAL_SECONDS)
