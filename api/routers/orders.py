"""Trade orders router — reads from the trade_orders hypertable written by the Java engine."""

from fastapi import APIRouter, Depends, Query
import asyncpg

from api.db import get_conn
from api.models import TradeOrderResponse, OrderStatsResponse, PaginatedResponse

router = APIRouter(prefix="/orders", tags=["orders"])


@router.get("", response_model=PaginatedResponse[TradeOrderResponse])
async def list_orders(
    strategy: str | None = Query(None),
    page:     int        = Query(1, ge=1),
    per_page: int        = Query(20, ge=1, le=100),
    conn: asyncpg.Connection = Depends(get_conn),
):
    """Return paginated trade orders, newest first. Optionally filter by strategy_used."""
    offset = (page - 1) * per_page

    where  = "WHERE strategy_used = $1" if strategy else ""
    params_count = [strategy] if strategy else []

    total = await conn.fetchval(
        f"SELECT COUNT(*) FROM trade_orders {where}", *params_count
    )

    p = [strategy, per_page, offset] if strategy else [per_page, offset]
    rows = await conn.fetch(
        f"""
        SELECT id, ticker, timestamp_utc, action, strategy_used,
               recommended_size_usd, limit_price, stop_loss, target_price,
               rationale, conviction_score, catalyst_type,
               regime_vix, spy_above_200sma
        FROM trade_orders
        {where}
        ORDER BY timestamp_utc DESC
        LIMIT ${'$2' if strategy else '$1'}
        OFFSET ${'$3' if strategy else '$2'}
        """,
        *p,
    )

    return {
        "items":    [dict(r) for r in rows],
        "total":    total,
        "page":     page,
        "per_page": per_page,
    }


@router.get("/stats", response_model=OrderStatsResponse)
async def order_stats(conn: asyncpg.Connection = Depends(get_conn)):
    """Aggregate stats for the analytics page."""
    total   = await conn.fetchval("SELECT COUNT(*) FROM trade_orders")
    avg_con = await conn.fetchval("SELECT AVG(conviction_score) FROM trade_orders") or 0

    strat_rows = await conn.fetch(
        "SELECT strategy_used, COUNT(*) AS cnt FROM trade_orders GROUP BY strategy_used"
    )
    cat_rows = await conn.fetch(
        "SELECT catalyst_type, COUNT(*) AS cnt FROM trade_orders GROUP BY catalyst_type"
    )

    return {
        "total_orders":       total or 0,
        "avg_conviction":     float(avg_con),
        "hit_target_count":   0,   # Requires current price — computed client-side or separate job
        "hit_stop_count":     0,
        "active_count":       total or 0,
        "strategy_breakdown": {r["strategy_used"]: r["cnt"] for r in strat_rows},
        "catalyst_breakdown": {r["catalyst_type"]: r["cnt"] for r in cat_rows},
    }


@router.get("/{ticker}", response_model=list[TradeOrderResponse])
async def orders_by_ticker(
    ticker: str,
    conn: asyncpg.Connection = Depends(get_conn),
):
    """All orders for a specific ticker, newest first."""
    rows = await conn.fetch(
        """
        SELECT id, ticker, timestamp_utc, action, strategy_used,
               recommended_size_usd, limit_price, stop_loss, target_price,
               rationale, conviction_score, catalyst_type,
               regime_vix, spy_above_200sma
        FROM trade_orders
        WHERE ticker = $1
        ORDER BY timestamp_utc DESC
        """,
        ticker.upper(),
    )
    return [dict(r) for r in rows]
