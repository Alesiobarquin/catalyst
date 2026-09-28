import asyncio
import logging
from datetime import datetime

import yfinance as yf
from fastapi import APIRouter, HTTPException, Query

from api.models import PriceBar

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/market", tags=["market"])


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
