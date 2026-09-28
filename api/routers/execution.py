"""Alpaca paper execution status (trade_order_executions)."""

from typing import Any

import asyncpg
from fastapi import APIRouter, Depends, Query

from api.auth import require_clerk_user
from api.db import get_conn
from api.models import ExecutionSummaryResponse, TradeExecutionResponse

router = APIRouter(prefix="/executions", tags=["executions"])

# Backward compatibility alias
TradeExecutionOut = TradeExecutionResponse


@router.get("/me", response_model=list[TradeExecutionResponse])
async def list_my_executions(
    status: str | None = Query(
        None, description="Filter by execution status (e.g. filled, pending, rejected)"
    ),
    ticker: str | None = Query(None, description="Filter by stock ticker symbol"),
    limit: int = Query(500, ge=1, le=1000, description="Max execution records to return"),
    _user: dict = Depends(require_clerk_user),
    conn: asyncpg.Connection = Depends(get_conn),
):
    """List executions for the authenticated user with optional status and ticker filtering."""
    uid = _user["sub"]
    clauses = ["e.clerk_user_id = $1"]
    args: list[Any] = [uid]

    if status:
        args.append(status.strip().lower())
        clauses.append(f"LOWER(e.execution_status) = ${len(args)}")

    if ticker:
        args.append(ticker.strip().upper())
        clauses.append(f"t.ticker = ${len(args)}")

    args.append(limit)
    limit_param = f"${len(args)}"

    query = f"""
        SELECT e.id, e.trade_order_id, e.timestamp_utc, e.alpaca_order_id,
               e.execution_status, e.filled_avg_price, e.error_message, t.ticker
        FROM trade_order_executions e
        INNER JOIN trade_orders t
            ON t.id = e.trade_order_id AND t.timestamp_utc = e.timestamp_utc
        WHERE {" AND ".join(clauses)}
        ORDER BY e.updated_at DESC
        LIMIT {limit_param}
    """
    rows = await conn.fetch(query, *args)
    return [
        TradeExecutionResponse(
            id=r["id"],
            trade_order_id=r["trade_order_id"],
            timestamp_utc=r["timestamp_utc"],
            ticker=r["ticker"],
            alpaca_order_id=r["alpaca_order_id"],
            execution_status=r["execution_status"],
            filled_avg_price=float(r["filled_avg_price"])
            if r["filled_avg_price"] is not None
            else None,
            error_message=r["error_message"],
        )
        for r in rows
    ]


@router.get("/summary", response_model=ExecutionSummaryResponse)
async def get_execution_summary(
    _user: dict = Depends(require_clerk_user),
    conn: asyncpg.Connection = Depends(get_conn),
):
    """Aggregate execution statistics for the authenticated user."""
    uid = _user["sub"]
    row = await conn.fetchrow(
        """
        SELECT
            COUNT(*)::int AS total_executions,
            COUNT(*) FILTER (WHERE LOWER(e.execution_status) = 'filled')::int AS filled_count,
            COUNT(*) FILTER (WHERE LOWER(e.execution_status) IN ('failed', 'rejected', 'canceled'))::int AS failed_count,
            COUNT(*) FILTER (WHERE LOWER(e.execution_status) IN ('pending', 'submitted', 'new', 'accepted'))::int AS pending_count,
            COALESCE(SUM(t.recommended_size_usd) FILTER (WHERE LOWER(e.execution_status) = 'filled'), 0)::float AS total_volume_usd
        FROM trade_order_executions e
        INNER JOIN trade_orders t
            ON t.id = e.trade_order_id AND t.timestamp_utc = e.timestamp_utc
        WHERE e.clerk_user_id = $1
        """,
        uid,
    )
    total = row["total_executions"] if row else 0
    filled = row["filled_count"] if row else 0
    failed = row["failed_count"] if row else 0
    pending = row["pending_count"] if row else 0
    vol = float(row["total_volume_usd"]) if row and row["total_volume_usd"] is not None else 0.0
    fill_rate = round((filled / total) * 100.0, 2) if total > 0 else 0.0

    return ExecutionSummaryResponse(
        total_executions=total,
        filled_count=filled,
        failed_count=failed,
        pending_count=pending,
        fill_rate_percent=fill_rate,
        total_volume_usd=vol,
    )
