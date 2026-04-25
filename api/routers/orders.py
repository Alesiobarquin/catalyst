"""Trade orders router — reads from the trade_orders hypertable written by the Java engine."""

from fastapi import APIRouter, Depends, Query
import asyncpg

from api.db import get_conn
from api.models import TradeOrderResponse, OrderStatsResponse, PaginatedResponse

router = APIRouter(prefix="/orders", tags=["orders"])


@router.get("", response_model=PaginatedResponse[TradeOrderResponse])
async def list_orders(
    strategy: str | None = Query(None),
    date_range: str | None = Query(None, pattern="^(7d|30d|90d|all)$"),
    page:     int        = Query(1, ge=1),
    per_page: int        = Query(20, ge=1, le=100),
    conn: asyncpg.Connection = Depends(get_conn),
):
    """Return paginated trade orders, newest first. Optional strategy/date filters."""
    offset = (page - 1) * per_page
    clauses: list[str] = []
    args: list[object] = []

    if strategy and strategy != "all":
        args.append(strategy)
        clauses.append(f"strategy_used = ${len(args)}")

    if date_range and date_range != "all":
        days_map = {"7d": 7, "30d": 30, "90d": 90}
        days = days_map.get(date_range)
        if days:
            args.append(days)
            clauses.append(
                f"timestamp_utc >= (NOW() AT TIME ZONE 'UTC') - (${len(args)}::int * INTERVAL '1 day')"
            )

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    total = await conn.fetchval(
        f"SELECT COUNT(*) FROM trade_orders {where}", *args
    )

    data_args = [*args, per_page, offset]
    limit_param = f"${len(args) + 1}"
    offset_param = f"${len(args) + 2}"
    rows = await conn.fetch(
        f"""
        SELECT id, ticker, timestamp_utc, action, strategy_used,
               recommended_size_usd, limit_price, stop_loss, target_price,
               rationale, conviction_score, catalyst_type,
               regime_vix, spy_above_200sma, status
        FROM trade_orders
        {where}
        ORDER BY timestamp_utc DESC
        LIMIT {limit_param}
        OFFSET {offset_param}
        """,
        *data_args,
    )

    return {
        "items":    [dict(r) for r in rows],
        "total":    total,
        "page":     page,
        "per_page": per_page,
    }


@router.get("/stats", response_model=OrderStatsResponse)
async def order_stats(conn: asyncpg.Connection = Depends(get_conn)):
    """Aggregate stats for the analytics / stats bar."""
    total   = await conn.fetchval("SELECT COUNT(*) FROM trade_orders") or 0
    avg_con = await conn.fetchval("SELECT AVG(conviction_score) FROM trade_orders") or 0

    strat_rows = await conn.fetch(
        "SELECT strategy_used, COUNT(*) AS cnt FROM trade_orders GROUP BY strategy_used"
    )
    cat_rows = await conn.fetch(
        "SELECT catalyst_type, COUNT(*) AS cnt FROM trade_orders GROUP BY catalyst_type"
    )
    status_rows = await conn.fetch(
        "SELECT status, COUNT(*) AS cnt FROM trade_orders GROUP BY status"
    )
    daily_rows = await conn.fetch(
        """
        SELECT TO_CHAR(timestamp_utc AT TIME ZONE 'UTC', 'Mon DD') AS date,
               COUNT(*) AS cnt
        FROM trade_orders
        GROUP BY date
        ORDER BY MIN(timestamp_utc)
        """
    )

    # Conviction buckets: 0–49, 50–59, 60–69, 70–79, 80–89, 90–100
    bucket_rows = await conn.fetch(
        """
        SELECT
            CASE
                WHEN conviction_score < 50 THEN '0–49'
                WHEN conviction_score < 60 THEN '50–59'
                WHEN conviction_score < 70 THEN '60–69'
                WHEN conviction_score < 80 THEN '70–79'
                WHEN conviction_score < 90 THEN '80–89'
                ELSE '90–100'
            END AS bucket,
            COUNT(*) AS cnt
        FROM trade_orders
        WHERE conviction_score IS NOT NULL
        GROUP BY bucket
        ORDER BY MIN(conviction_score)
        """
    )

    status_map = {r["status"]: r["cnt"] for r in status_rows}

    return {
        "total_orders":           int(total),
        "avg_conviction":         float(avg_con),
        "hit_target_count":       int(status_map.get("HIT_TARGET", 0)),
        "hit_stop_count":         int(status_map.get("HIT_STOP", 0)),
        "active_count":           int(status_map.get("ACTIVE", 0)),
        "strategy_breakdown":     {r["strategy_used"]: r["cnt"] for r in strat_rows},
        "catalyst_breakdown":     {r["catalyst_type"]: r["cnt"] for r in cat_rows},
        "daily_volume":           [{"date": r["date"], "count": r["cnt"]} for r in daily_rows],
        "conviction_distribution":[{"bucket": r["bucket"], "count": r["cnt"]} for r in bucket_rows],
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
               regime_vix, spy_above_200sma, status
        FROM trade_orders
        WHERE ticker = $1
        ORDER BY timestamp_utc DESC
        """,
        ticker.upper(),
    )
    return [dict(r) for r in rows]
