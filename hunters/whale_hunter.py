"""
Whale hunter — unusual stock options activity from Barchart (Playwright scrape).

Emits rows to signal-whale + raw-events with underlying liquidity for Gatekeeper.
"""

from __future__ import annotations

import asyncio
import re
from datetime import datetime, timezone

from playwright.async_api import TimeoutError as PlaywrightTimeoutError

from .common.config import BARCHART_URL, WHALE_INTERVAL_SECONDS
from .common.kafka_client import KafkaClient
from .common.liquidity_lookup import fetch_liquidity_metrics
from .common.logger import get_logger
from .common.playwright_context import BrowserContext
from .common.provider_errors import ProviderError, check_browser_response
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
        for token in c.strip().split():
            try:
                v = float(token.replace(",", "").replace("$", ""))
                if 0.01 < v < 1e6:
                    return v
            except ValueError:
                continue
    return None


def _option_columns(headers: list[str]) -> dict[str, int] | None:
    """Read named contract fields; the underlying price is not the strike price."""
    aliases = {
        "symbol": "ticker",
        "ticker": "ticker",
        "type": "option_type",
        "optiontype": "option_type",
        "optionstype": "option_type",
        "strike": "strike_price",
        "strikeprice": "strike_price",
        "volume": "option_volume",
        "optionvolume": "option_volume",
        "expdate": "expiration_date",
        "expiration": "expiration_date",
        "expirationdate": "expiration_date",
    }
    columns = {}
    for index, text in enumerate(headers):
        name = re.sub(r"[^a-z]", "", text.lower())
        if name in aliases:
            columns[aliases[name]] = index
    required = {"ticker", "option_type", "strike_price", "option_volume"}
    return columns if required <= columns.keys() else None


async def _rendered_text(element, binding: str | None = None) -> str:
    """Barchart renders quote values inside the shadow root of text-binding."""
    text = await element.evaluate(
        """(element, field) => {
            const bindings = [...element.querySelectorAll('text-binding')];
            const fields = field === 'expirationDate' ? ['expirationDate', 'expiration'] : [field];
            const preferred = bindings.find(item => {
                const tokens = (item.getAttribute('binding') || '').split(/[^a-zA-Z0-9_.]+/);
                return fields.some(name => tokens.includes(`this.${name}`));
            });
            if (field && !preferred) return '';
            const values = (preferred ? [preferred] : bindings)
                .map(item => (item.shadowRoot?.textContent || item.textContent || '').trim())
                .filter(Boolean);
            return values[0] || '';
        }""",
        binding,
    )
    if isinstance(text, str) and text.strip():
        return text.strip()
    text = ((await element.inner_text()) or "").strip()
    return "" if text in {"()", "( )"} else text


async def scrape_whale(page) -> list[dict]:
    """Parse named Barchart option columns and disclose unavailable source data."""
    found: list[dict] = []
    logger.info("Navigating to %s", BARCHART_URL)
    try:
        response = await page.goto(BARCHART_URL, wait_until="domcontentloaded", timeout=45000)
    except PlaywrightTimeoutError as exc:
        raise ProviderError("barchart", "navigation_timeout") from exc
    check_browser_response("barchart", response)
    check_browser_response("barchart", response, await page.inner_text("body"))
    try:
        await page.wait_for_selector(
            "[role='grid'] [role='row'] [role='cell'], "
            "[role='grid'] [role='row'] [role='gridcell'], table tbody tr",
            timeout=45000,
        )
        strike_binding = await page.query_selector(
            "[role='grid'] [role='row'] .strikePrice text-binding"
        )
        if strike_binding is not None:
            await page.wait_for_function(
                "(element) => (element.shadowRoot?.textContent || element.textContent || '').trim()",
                arg=strike_binding,
                timeout=30000,
            )
    except PlaywrightTimeoutError as exc:
        check_browser_response("barchart", response, await page.inner_text("body"))
        raise ProviderError("barchart", "table_timeout") from exc

    columns = None
    rows = []
    cell_selector = "td"
    layouts = (
        (
            "[role='grid']",
            "[role='columnheader']",
            "[role='row']",
            "[role='cell'], [role='gridcell']",
        ),
        ("table", "th", "tbody tr", "td"),
    )
    for root_selector, heading_selector, row_selector, candidate_cells in layouts:
        for table in await page.query_selector_all(root_selector):
            headings = await table.query_selector_all(heading_selector)
            headers = [((await heading.inner_text()) or "").strip() for heading in headings]
            columns = _option_columns(headers)
            if columns is not None:
                rows = await table.query_selector_all(row_selector)
                cell_selector = candidate_cells
                break
        if columns is not None:
            break
    if columns is None:
        raise ProviderError("barchart", "table_schema")
    seen: set[tuple[str, float, str, str | None]] = set()
    eligible_rows = 0
    bindings = {
        "ticker": "baseSymbol",
        "option_type": "symbolType",
        "strike_price": "strikePrice",
        "option_volume": "volume",
        "expiration_date": "expirationDate",
    }

    for row in rows[:120]:
        cells_el = await row.query_selector_all(cell_selector)
        if len(cells_el) <= max(columns.values()):
            continue
        eligible_rows += 1
        texts = {}
        for name, index in columns.items():
            texts[name] = await _rendered_text(cells_el[index], bindings.get(name))

        ticker = ""
        raw = re.sub(r"[^A-Z]", "", texts["ticker"].upper())
        if _TICKER_CLEAN.match(raw):
            ticker = raw
        if not ticker:
            continue

        type_text = texts["option_type"]
        if not _CALL_PUT.search(type_text):
            continue
        opt_type = _parse_option_type(type_text)
        strike = _first_float([texts["strike_price"]])
        vol_hint = _first_float([texts["option_volume"]])
        if strike is None or vol_hint is None:
            continue
        expiration = texts.get("expiration_date")

        key = (ticker, round(strike, 4), opt_type, expiration)
        if key in seen:
            continue
        seen.add(key)

        now_iso = datetime.now(timezone.utc).isoformat()
        found.append(
            {
                "ticker": ticker,
                "option_type": opt_type,
                "strike_price": strike,
                "option_volume": int(vol_hint),
                "expiration_date": expiration,
                "source": "barchart_unusual",
                "timestamp": now_iso,
                "timestamp_utc": now_iso,
                "hunter": "whale",
                "source_hunter": "whale",
            }
        )

    if eligible_rows and not found:
        raise ProviderError("barchart", "response_schema")
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
    liquidity_by_ticker = {}
    for entry in rows:
        ticker = entry.get("ticker")
        if not ticker:
            continue
        if ticker not in liquidity_by_ticker:
            liquidity_by_ticker[ticker] = await asyncio.to_thread(fetch_liquidity_metrics, ticker)
        liq = liquidity_by_ticker[ticker]
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
        logger.info(
            "Whale signal %s %s @ %s", ticker, entry.get("option_type"), entry.get("strike_price")
        )

    return pushed


async def run(once: bool = False):
    logger.info("Whale Hunter starting (interval=%ss)...", WHALE_INTERVAL_SECONDS)
    kafka = KafkaClient()
    while True:
        try:
            n = await _one_sweep(kafka)
            logger.info("Whale sweep pushed %s signals.", n)
        except Exception as e:
            logger.error("Whale sweep failed: %s", e, exc_info=True)
            if once:
                raise
            await asyncio.sleep(60)
            continue

        if once:
            return
        await asyncio.sleep(WHALE_INTERVAL_SECONDS)
