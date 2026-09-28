import asyncio
import logging
from datetime import datetime

import yfinance as yf
from fastapi import APIRouter, HTTPException, Query

from api.models import MarketQuoteResponse, PriceBar

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/market", tags=["market"])


def _fetch_quote(symbol: str) -> dict:
    t = yf.Ticker(symbol.upper())
    fast_info = getattr(t, "fast_info", None)
    if fast_info:
        last_price = getattr(fast_info, "last_price", None)
        prev_close = getattr(fast_info, "previous_close", None)
        day_high = getattr(fast_info, "day_high", None)
        day_low = getattr(fast_info, "day_low", None)
        volume = getattr(fast_info, "last_volume", None)
        year_high = getattr(fast_info, "year_high", None)
        year_low = getattr(fast_info, "year_low", None)
        market_cap = getattr(fast_info, "market_cap", None)

        change = round(last_price - prev_close, 4) if last_price and prev_close else None
        pct_change = round((change / prev_close) * 100, 2) if change and prev_close else None

        return {
            "ticker": symbol.upper(),
            "price": round(float(last_price), 4) if last_price else None,
            "change": change,
            "change_percent": pct_change,
            "day_high": round(float(day_high), 4) if day_high else None,
            "day_low": round(float(day_low), 4) if day_low else None,
            "volume": int(volume) if volume else None,
            "fifty_two_week_high": round(float(year_high), 4) if year_high else None,
            "fifty_two_week_low": round(float(year_low), 4) if year_low else None,
            "market_cap": int(market_cap) if market_cap else None,
        }
    return {"ticker": symbol.upper()}


@router.get("/{ticker}/quote", response_model=MarketQuoteResponse)
async def ticker_quote(ticker: str):
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
async def price_history(
    ticker: str,
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
