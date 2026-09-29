import asyncio
import logging
import time
from datetime import datetime

import asyncpg
import yfinance as yf
from fastapi import APIRouter, Depends, HTTPException, Path, Query

from api.db import get_conn
from api.models import MarketQuoteResponse, PriceBar

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/market", tags=["market"])

_QUOTE_CACHE: dict[str, tuple[dict, float]] = {}
_QUOTE_CACHE_TTL_SECONDS: float = 15.0


def clear_quote_cache() -> None:
    """Clear the in-memory market quote cache."""
    _QUOTE_CACHE.clear()


def _fetch_quote(symbol: str) -> dict:
    sym = symbol.strip().upper()
    now = time.time()

    # Check cache first
    if sym in _QUOTE_CACHE:
        cached_data, cached_ts = _QUOTE_CACHE[sym]
        if (now - cached_ts) < _QUOTE_CACHE_TTL_SECONDS:
            return cached_data

    t = yf.Ticker(sym)
    fast_info = getattr(t, "fast_info", None)

    last_price = getattr(fast_info, "last_price", None) if fast_info else None
    prev_close = getattr(fast_info, "previous_close", None) if fast_info else None
    day_high = getattr(fast_info, "day_high", None) if fast_info else None
    day_low = getattr(fast_info, "day_low", None) if fast_info else None
    volume = getattr(fast_info, "last_volume", None) if fast_info else None
    year_high = getattr(fast_info, "year_high", None) if fast_info else None
    year_low = getattr(fast_info, "year_low", None) if fast_info else None
    market_cap = getattr(fast_info, "market_cap", None) if fast_info else None

    # Fallback to history(period="2d") if last_price is missing from fast_info
    if last_price is None:
        try:
            hist = t.history(period="2d")
            if not hist.empty:
                last_price = float(hist["Close"].iloc[-1])
                if day_high is None and "High" in hist:
                    day_high = float(hist["High"].iloc[-1])
                if day_low is None and "Low" in hist:
                    day_low = float(hist["Low"].iloc[-1])
                if volume is None and "Volume" in hist:
                    volume = int(hist["Volume"].iloc[-1])
                if prev_close is None and len(hist) > 1:
                    prev_close = float(hist["Close"].iloc[-2])
        except Exception as h_err:
            logger.debug("History fallback failed for %s: %s", symbol, h_err)

    change = (
        round(last_price - prev_close, 4)
        if (last_price is not None and prev_close is not None)
        else None
    )
    pct_change = (
        round((change / prev_close) * 100, 2)
        if (change is not None and prev_close is not None and prev_close != 0)
        else None
    )

    quote_data = {
        "ticker": sym,
        "price": round(float(last_price), 4) if last_price is not None else None,
        "change": change,
        "change_percent": pct_change,
        "day_high": round(float(day_high), 4) if day_high is not None else None,
        "day_low": round(float(day_low), 4) if day_low is not None else None,
        "volume": int(volume) if volume is not None else None,
        "fifty_two_week_high": round(float(year_high), 4) if year_high is not None else None,
        "fifty_two_week_low": round(float(year_low), 4) if year_low is not None else None,
        "market_cap": int(market_cap) if market_cap is not None else None,
    }

    if quote_data.get("price") is not None:
        _QUOTE_CACHE[sym] = (quote_data, now)

    return quote_data


@router.get("/search")
async def search_tickers(
    q: str = Query(..., min_length=1, max_length=10),
    conn: asyncpg.Connection = Depends(get_conn),
):
    """Search tracked tickers across active orders and validated signals matching prefix/query."""
    pattern = f"{q.strip().upper()}%"
    rows = await conn.fetch(
        """
        SELECT DISTINCT ticker FROM (
            SELECT ticker FROM trade_orders WHERE ticker ILIKE $1
            UNION
            SELECT ticker FROM validated_signals WHERE ticker ILIKE $1
        ) sub
        ORDER BY ticker ASC
        LIMIT 15
        """,
        pattern,
    )
    return [{"ticker": r["ticker"]} for r in rows]


@router.get("/overview", response_model=list[MarketQuoteResponse])
async def market_overview(
    symbols: str = Query("SPY,QQQ,DIA,IWM", description="Comma-separated ticker list")
):
    """Return quote metrics for benchmark indices or custom symbols concurrently."""
    tickers = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not tickers:
        return []

    tasks = [asyncio.to_thread(_fetch_quote, t) for t in tickers]
    quotes = await asyncio.gather(*tasks, return_exceptions=True)

    results: list[dict] = []
    for t, q in zip(tickers, quotes, strict=False):
        if isinstance(q, Exception):
            logger.warning("Failed to fetch overview quote for %s: %s", t, q)
            cached = _QUOTE_CACHE.get(t)
            if cached and cached[0].get("price") is not None:
                results.append(cached[0])
            else:
                results.append({"ticker": t})
        else:
            results.append(q)
    return results


@router.get("/{ticker}/quote", response_model=MarketQuoteResponse)
@router.get("/quote/{ticker}", response_model=MarketQuoteResponse)
async def ticker_quote(
    ticker: str = Path(..., min_length=1, max_length=10, pattern=r"^[A-Za-z0-9\.\-\=\^]+$")
):
    """Return latest quote metrics (price, day range, volume, 52w range) via yfinance fast_info."""
    try:
        quote = await asyncio.to_thread(_fetch_quote, ticker)
        return MarketQuoteResponse(**quote)
    except Exception as exc:
        logger.error("Failed to fetch quote for %s: %s", ticker, exc)
        raise HTTPException(status_code=502, detail=f"Failed to fetch quote: {exc}")


def _fetch_history(symbol: str, start_date_str: str):
    ticker_obj = yf.Ticker(symbol.upper())
    return ticker_obj.history(
        start=start_date_str,
        interval="1d",
        auto_adjust=True,
    )


@router.get("/{ticker}/history", response_model=list[PriceBar])
@router.get("/history/{ticker}", response_model=list[PriceBar])
async def price_history(
    ticker: str = Path(..., min_length=1, max_length=10, pattern=r"^[A-Za-z0-9\.\-\=\^]+$"),
    from_ts: str = Query(..., alias="from", description="ISO 8601 timestamp — start of range"),
):
    """Return daily OHLC from `from` timestamp to today for the price chart overlay.

    Why yfinance?
      Free, no API key required, sufficient for historic daily bars. It's synchronous
      (not asyncio-native) so we run it in a worker thread via `asyncio.to_thread`
      to avoid blocking the main event loop.
    """
    try:
        start_dt = datetime.fromisoformat(from_ts.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid `from` timestamp. Use ISO 8601.")

    try:
        df = await asyncio.to_thread(_fetch_history, ticker, start_dt.strftime("%Y-%m-%d"))
    except Exception as exc:
        logger.error("yfinance fetch failed for %s: %s", ticker, exc)
        raise HTTPException(status_code=502, detail=f"Failed to fetch price data: {exc}")

    if df.empty:
        raise HTTPException(status_code=404, detail=f"No price data found for {ticker}")

    bars: list[PriceBar] = []
    for ts, row in df.iterrows():
        # yfinance returns tz-aware DatetimeIndex
        unix_time = int(ts.timestamp())  # type: ignore[union-attr]
        bars.append(
            PriceBar(
                time=unix_time,
                open=round(float(row["Open"]), 4),
                high=round(float(row["High"]), 4),
                low=round(float(row["Low"]), 4),
                close=round(float(row["Close"]), 4),
            )
        )

    return bars

