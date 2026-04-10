"""Alpaca paper execution status (trade_order_executions)."""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends
import asyncpg
from pydantic import BaseModel

from api.auth import require_clerk_user
from api.db import get_conn

router = APIRouter(prefix="/executions", tags=["executions"])


class TradeExecutionOut(BaseModel):
    id: int
    trade_order_id: int
    timestamp_utc: datetime
    ticker: str
    alpaca_order_id: Optional[str] = None
    execution_status: str
    filled_avg_price: Optional[float] = None
    error_message: Optional[str] = None


@router.get("/me", response_model=list[TradeExecutionOut])
async def list_my_executions(
    _user: dict = Depends(require_clerk_user),
    conn: asyncpg.Connection = Depends(get_conn),
):
    uid = _user["sub"]
    rows = await conn.fetch(
        """
        SELECT e.id, e.trade_order_id, e.timestamp_utc, e.alpaca_order_id,
               e.execution_status, e.filled_avg_price, e.error_message, t.ticker
        FROM trade_order_executions e
        INNER JOIN trade_orders t
            ON t.id = e.trade_order_id AND t.timestamp_utc = e.timestamp_utc
        WHERE e.clerk_user_id = $1
        ORDER BY e.updated_at DESC
        LIMIT 500
        """,
        uid,
    )
    return [
        TradeExecutionOut(
            id=r["id"],
            trade_order_id=r["trade_order_id"],
            timestamp_utc=r["timestamp_utc"],
            ticker=r["ticker"],
            alpaca_order_id=r["alpaca_order_id"],
            execution_status=r["execution_status"],
            filled_avg_price=float(r["filled_avg_price"]) if r["filled_avg_price"] is not None else None,
            error_message=r["error_message"],
        )
        for r in rows
    ]
