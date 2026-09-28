"""
Performance endpoint — derives live P&L for a trade order by walking
daily OHLC bars from yfinance.

Logic:
  1. Fetch daily bars from timestamp_utc to today via yfinance.
  2. Walk bars in chronological order:
       low  <= stop_loss   → HIT_STOP
       high >= target_price → HIT_TARGET
  3. If neither triggered → ACTIVE (or EXPIRED after 90 days).
  4. current_price is the last close from yfinance.

Route order matters: /batch must be declared before /{order_id} so
FastAPI does not try to coerce the literal string "batch" as an integer.
"""

import asyncio
import logging
from datetime import datetime, timezone

import asyncpg
import yfinance as yf
from fastapi import APIRouter, Depends, HTTPException, Query

from api.db import get_conn

router = APIRouter(prefix="/performance", tags=["performance"])
logger = logging.getLogger("api.performance")


def _compute_ticker_performance(
    order_id: int,
    ticker: str,
    signal_dt: datetime,
    entry_price: float,
    stop_loss: float,
    target_price: float,
    db_status: str,
    now: datetime,
) -> dict:
    days_held = max(0, (now - signal_dt).days)
    current_price: float | None = None
    computed_status = db_status

    try:
        start_str = signal_dt.strftime("%Y-%m-%d")
        hist = yf.Ticker(ticker).history(start=start_str, interval="1d", auto_adjust=True)
        if not hist.empty:
            current_price = round(float(hist["Close"].iloc[-1]), 4)
            if db_status == "ACTIVE":
                for _, bar in hist.iterrows():
                    if float(bar["Low"]) <= stop_loss:
                        computed_status = "HIT_STOP"
                        break
                    if float(bar["High"]) >= target_price:
                        computed_status = "HIT_TARGET"
                        break
                if computed_status == "ACTIVE" and days_held > 90:
                    computed_status = "EXPIRED"
        else:
            try:
                t = yf.Ticker(ticker)
                last_p = getattr(t.fast_info, "last_price", None)
                if last_p is not None and not (isinstance(last_p, float) and (last_p != last_p)):
                    current_price = round(float(last_p), 4)
            except Exception as fast_exc:
                logger.debug("Fast info fallback failed for %s: %s", ticker, fast_exc)
    except Exception as exc:
        logger.warning("Performance lookup failed for %s: %s", ticker, exc)


    pnl_pct = None
    if current_price is not None and entry_price > 0:
        pnl_pct = round(((current_price - entry_price) / entry_price) * 100, 2)

    return {
        "order_id": order_id,
        "ticker": ticker,
        "current_price": current_price,
        "pnl_pct": pnl_pct,
        "status": computed_status,
        "days_held": days_held,
    }


# ── Batch endpoint (must come first) ──────────────────────────────────────────


@router.get("/batch")
async def get_batch_performance(
    ids: str = Query(..., description="Comma-separated order IDs, e.g. 1,2,3"),
    conn: asyncpg.Connection = Depends(get_conn),
):
    """
    Fetch performance for up to 20 orders in one call.
    Uses asyncio.gather to fetch ticker histories concurrently in parallel worker threads.
    """
    try:
        id_list = [int(x.strip()) for x in ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(status_code=422, detail="ids must be comma-separated integers")

    if not id_list:
        return []
    if len(id_list) > 20:
        raise HTTPException(status_code=422, detail="Maximum 20 IDs per batch request")

    rows = await conn.fetch(
        "SELECT id, ticker, timestamp_utc, limit_price, stop_loss, target_price, status "
        "FROM trade_orders WHERE id = ANY($1::bigint[])",
        id_list,
    )

    now = datetime.now(timezone.utc)
    tasks = [
        asyncio.to_thread(
            _compute_ticker_performance,
            row["id"],
            row["ticker"],
            row["timestamp_utc"],
            float(row["limit_price"]),
            float(row["stop_loss"]),
            float(row["target_price"]),
            row["status"],
            now,
        )
        for row in rows
    ]

    return await asyncio.gather(*tasks)


# ── Single-order endpoint ──────────────────────────────────────────────────────


@router.get("/{order_id}")
async def get_order_performance(
    order_id: int,
    conn: asyncpg.Connection = Depends(get_conn),
):
    """
    Returns live performance data for a single trade order.
    """
    row = await conn.fetchrow(
        "SELECT id, ticker, timestamp_utc, limit_price, stop_loss, target_price, status "
        "FROM trade_orders WHERE id = $1",
        order_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail=f"Order {order_id} not found")

    ticker = row["ticker"]
    entry_price = float(row["limit_price"])
    stop_loss = float(row["stop_loss"])
    target_price = float(row["target_price"])
    signal_dt = row["timestamp_utc"]
    db_status = row["status"]
    now = datetime.now(timezone.utc)
    resolved_in_db = db_status in ("HIT_TARGET", "HIT_STOP", "EXPIRED")

    perf = await asyncio.to_thread(
        _compute_ticker_performance,
        order_id,
        ticker,
        signal_dt,
        entry_price,
        stop_loss,
        target_price,
        db_status,
        now,
    )

    return {
        "order_id": order_id,
        "ticker": ticker,
        "entry_price": entry_price,
        "stop_loss": stop_loss,
        "target_price": target_price,
        "current_price": perf["current_price"],
        "pnl_pct": perf["pnl_pct"],
        "status": perf["status"],
        "status_source": "db" if resolved_in_db else "live",
        "days_held": perf["days_held"],
        "signal_date": signal_dt.strftime("%Y-%m-%d"),
    }
