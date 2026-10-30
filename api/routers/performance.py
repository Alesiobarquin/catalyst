"""
Performance endpoint — derives live P&L for a trade order by walking
daily OHLC bars from yfinance.

Logic:
  1. Fetch unadjusted daily bars from the entry session to today via yfinance.
  2. Apply the resolver's outcome rule (resolver/outcome.py): sessions after
     entry, stop before target on each bar, expiry after MAX_HOLDING_DAYS.
  3. P&L uses the outcome's fill price when resolved, otherwise the last close.
  4. current_price is the last close from yfinance.

Route order matters: /batch must be declared before /{order_id} so
FastAPI does not try to coerce the literal string "batch" as an integer.
"""

import asyncio
import logging
import math
from datetime import datetime, timezone

import asyncpg
import yfinance as yf
from fastapi import APIRouter, Depends, HTTPException, Query

from api.db import get_conn
from resolver.config import MAX_HOLDING_DAYS
from resolver.outcome import MARKET_TZ, resolve_from_bars
from resolver.outcome import pnl_percent as outcome_pnl_percent

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
    resolved_price: float | None = None,
    pnl_percent: float | None = None,
    action: str = "BUY",
) -> dict:
    days_held = max(0, (now - signal_dt).days)
    is_sell = str(action or "BUY").upper() == "SELL"

    # Terminal resolved state fast-path: if order is closed and resolved in DB,
    # return the recorded resolution metrics without making redundant external market queries.
    if (
        db_status in ("HIT_TARGET", "HIT_STOP", "EXPIRED", "RESOLVED_WIN", "RESOLVED_LOSS")
        and resolved_price is not None
    ):
        pnl_val = pnl_percent
        if pnl_val is None and entry_price > 0:
            if is_sell:
                pnl_val = round(((entry_price - resolved_price) / entry_price) * 100, 2)
            else:
                pnl_val = round(((resolved_price - entry_price) / entry_price) * 100, 2)
        return {
            "order_id": order_id,
            "ticker": ticker,
            "current_price": resolved_price,
            "pnl_pct": pnl_val,
            "status": db_status,
            "days_held": days_held,
        }

    current_price: float | None = None
    computed_status = db_status

    try:
        start_str = signal_dt.astimezone(MARKET_TZ).strftime("%Y-%m-%d")
        hist = yf.Ticker(ticker).history(start=start_str, interval="1d", auto_adjust=False)
        columns = [name for name in ("Open", "High", "Low", "Close") if name in hist.columns]
        hist = hist.replace([math.inf, -math.inf], math.nan).dropna(subset=columns or None)
        if not hist.empty:
            close = float(hist["Close"].iloc[-1])
            current_price = round(close, 4) if math.isfinite(close) else None
            if db_status == "ACTIVE":
                outcome = resolve_from_bars(
                    action, stop_loss, target_price, hist, signal_dt, now, MAX_HOLDING_DAYS
                )
                if outcome is not None:
                    computed_status = outcome.status
                    if pnl_percent is None and entry_price > 0:
                        pnl_percent = round(
                            outcome_pnl_percent(action, entry_price, outcome.price), 2
                        )
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

    pnl_pct = pnl_percent
    if pnl_pct is None and current_price is not None and entry_price > 0:
        if is_sell:
            pnl_pct = round(((entry_price - current_price) / entry_price) * 100, 2)
        else:
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

    try:
        rows = await conn.fetch(
            "SELECT id, ticker, timestamp_utc, action, limit_price, stop_loss, target_price, status, "
            "resolved_price, pnl_percent "
            "FROM trade_orders WHERE id = ANY($1::bigint[])",
            id_list,
        )
    except (asyncpg.UndefinedColumnError, asyncpg.UndefinedTableError):
        rows = await conn.fetch(
            "SELECT id, ticker, timestamp_utc, limit_price, stop_loss, target_price, status "
            "FROM trade_orders WHERE id = ANY($1::bigint[])",
            id_list,
        )

    now = datetime.now(timezone.utc)
    tasks = []
    for row in rows:
        row_dict = dict(row)
        res_price = (
            float(row_dict["resolved_price"])
            if row_dict.get("resolved_price") is not None
            else None
        )
        pnl_val = (
            float(row_dict["pnl_percent"]) if row_dict.get("pnl_percent") is not None else None
        )
        tasks.append(
            asyncio.to_thread(
                _compute_ticker_performance,
                row_dict["id"],
                row_dict["ticker"],
                row_dict["timestamp_utc"],
                float(row_dict["limit_price"]),
                float(row_dict["stop_loss"]),
                float(row_dict["target_price"]),
                row_dict["status"],
                now,
                res_price,
                pnl_val,
                row_dict.get("action", "BUY"),
            )
        )

    results = await asyncio.gather(*tasks, return_exceptions=True)
    output = []
    for row, result in zip(rows, results, strict=False):
        if isinstance(result, Exception):
            logger.warning("Performance lookup failed for order %s: %s", row["id"], result)
            output.append(
                {
                    "order_id": row["id"],
                    "ticker": row["ticker"],
                    "current_price": None,
                    "pnl_pct": None,
                    "status": row["status"],
                    "days_held": None,
                }
            )
            continue
        output.append(result)
    return output


# ── Single-order endpoint ──────────────────────────────────────────────────────


@router.get("/{order_id}")
async def get_order_performance(
    order_id: int,
    conn: asyncpg.Connection = Depends(get_conn),
):
    """
    Returns live performance data for a single trade order.
    """
    try:
        row = await conn.fetchrow(
            "SELECT id, ticker, timestamp_utc, action, limit_price, stop_loss, target_price, status, "
            "resolved_price, pnl_percent "
            "FROM trade_orders WHERE id = $1",
            order_id,
        )
    except (asyncpg.UndefinedColumnError, asyncpg.UndefinedTableError):
        row = await conn.fetchrow(
            "SELECT id, ticker, timestamp_utc, limit_price, stop_loss, target_price, status "
            "FROM trade_orders WHERE id = $1",
            order_id,
        )

    if row is None:
        raise HTTPException(status_code=404, detail=f"Order {order_id} not found")

    row_dict = dict(row)
    ticker = row_dict["ticker"]
    entry_price = float(row_dict["limit_price"])
    stop_loss = float(row_dict["stop_loss"])
    target_price = float(row_dict["target_price"])
    signal_dt = row_dict["timestamp_utc"]
    db_status = row_dict["status"]
    resolved_price = (
        float(row_dict["resolved_price"]) if row_dict.get("resolved_price") is not None else None
    )
    pnl_percent = (
        float(row_dict["pnl_percent"]) if row_dict.get("pnl_percent") is not None else None
    )

    now = datetime.now(timezone.utc)
    resolved_in_db = db_status in (
        "HIT_TARGET",
        "HIT_STOP",
        "EXPIRED",
        "RESOLVED_WIN",
        "RESOLVED_LOSS",
    )

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
        resolved_price,
        pnl_percent,
        row_dict.get("action", "BUY"),
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
