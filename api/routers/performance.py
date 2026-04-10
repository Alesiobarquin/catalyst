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

from datetime import datetime, timezone
from typing import Optional

import yfinance as yf
from fastapi import APIRouter, Depends, HTTPException, Query
import asyncpg

from api.db import get_conn

router = APIRouter(prefix="/performance", tags=["performance"])


# ── Batch endpoint (must come first) ──────────────────────────────────────────

@router.get("/batch")
async def get_batch_performance(
    ids: str = Query(..., description="Comma-separated order IDs, e.g. 1,2,3"),
    conn: asyncpg.Connection = Depends(get_conn),
):
    """
    Fetch performance for up to 20 orders in one call.
    Used by the dashboard to enrich all visible trade cards with live P&L.

    Response items:
    {
        "order_id": int,
        "ticker": str,
        "current_price": float | null,
        "pnl_pct": float | null,
        "status": "ACTIVE" | "HIT_TARGET" | "HIT_STOP" | "EXPIRED",
        "days_held": int,
    }
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
    results = []

    for row in rows:
        entry_price  = float(row["limit_price"])
        stop_loss    = float(row["stop_loss"])
        target_price = float(row["target_price"])
        signal_dt    = row["timestamp_utc"]
        db_status    = row["status"]
        days_held    = max(0, (now - signal_dt).days)

        current_price: Optional[float] = None
        computed_status = db_status

        try:
            start_str  = signal_dt.strftime("%Y-%m-%d")
            hist = yf.Ticker(row["ticker"]).history(
                start=start_str, interval="1d", auto_adjust=True
            )
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
        except Exception:
            pass

        pnl_pct = None
        if current_price is not None and entry_price > 0:
            pnl_pct = round(((current_price - entry_price) / entry_price) * 100, 2)

        results.append({
            "order_id":      row["id"],
            "ticker":        row["ticker"],
            "current_price": current_price,
            "pnl_pct":       pnl_pct,
            "status":        computed_status,
            "days_held":     days_held,
        })

    return results


# ── Single-order endpoint ──────────────────────────────────────────────────────

@router.get("/{order_id}")
async def get_order_performance(
    order_id: int,
    conn: asyncpg.Connection = Depends(get_conn),
):
    """
    Returns live performance data for a single trade order.

    Response:
    {
        "order_id": int,
        "ticker": str,
        "entry_price": float,
        "stop_loss": float,
        "target_price": float,
        "current_price": float | null,
        "pnl_pct": float | null,
        "status": "ACTIVE" | "HIT_TARGET" | "HIT_STOP" | "EXPIRED",
        "status_source": "db" | "live",
        "days_held": int,
        "signal_date": str,
    }
    """
    row = await conn.fetchrow(
        "SELECT id, ticker, timestamp_utc, limit_price, stop_loss, target_price, status "
        "FROM trade_orders WHERE id = $1",
        order_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail=f"Order {order_id} not found")

    ticker       = row["ticker"]
    entry_price  = float(row["limit_price"])
    stop_loss    = float(row["stop_loss"])
    target_price = float(row["target_price"])
    signal_dt    = row["timestamp_utc"]
    db_status    = row["status"]

    now           = datetime.now(timezone.utc)
    days_held     = max(0, (now - signal_dt).days)
    resolved_in_db = db_status in ("HIT_TARGET", "HIT_STOP", "EXPIRED")

    current_price: Optional[float] = None
    computed_status = db_status
    status_source   = "db"

    try:
        start_str  = signal_dt.strftime("%Y-%m-%d")
        hist = yf.Ticker(ticker).history(start=start_str, interval="1d", auto_adjust=True)

        if not hist.empty:
            current_price = round(float(hist["Close"].iloc[-1]), 4)
            if not resolved_in_db:
                status_source = "live"
                for _, bar in hist.iterrows():
                    if float(bar["Low"]) <= stop_loss:
                        computed_status = "HIT_STOP"
                        break
                    if float(bar["High"]) >= target_price:
                        computed_status = "HIT_TARGET"
                        break
                if computed_status == "ACTIVE" and days_held > 90:
                    computed_status = "EXPIRED"
    except Exception:
        pass

    pnl_pct: Optional[float] = None
    if current_price is not None and entry_price > 0:
        pnl_pct = round(((current_price - entry_price) / entry_price) * 100, 2)

    return {
        "order_id":      order_id,
        "ticker":        ticker,
        "entry_price":   entry_price,
        "stop_loss":     stop_loss,
        "target_price":  target_price,
        "current_price": current_price,
        "pnl_pct":       pnl_pct,
        "status":        computed_status,
        "status_source": status_source,
        "days_held":     days_held,
        "signal_date":   signal_dt.strftime("%Y-%m-%d"),
    }
