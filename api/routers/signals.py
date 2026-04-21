"""Validated signals router — reads from the validated_signals hypertable (Python persistence)."""

import json
from fastapi import APIRouter, Depends, Query
import asyncpg

from api.db import get_conn
from api.models import ValidatedSignalResponse, PaginatedResponse

router = APIRouter(prefix="/signals", tags=["signals"])


@router.get("", response_model=PaginatedResponse[ValidatedSignalResponse])
async def list_signals(
    page:     int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    conn: asyncpg.Connection = Depends(get_conn),
):
    """Return paginated Gemini-validated signals, newest first."""
    offset = (page - 1) * per_page
    total  = await conn.fetchval("SELECT COUNT(*) FROM validated_signals")
    rows   = await conn.fetch(
        """
        SELECT ROW_NUMBER() OVER (ORDER BY time DESC) AS id,
               ticker, time AS timestamp_utc, conviction_score,
               catalyst_type, rationale, is_trap,
               confluence_sources, key_risks
        FROM validated_signals
        ORDER BY time DESC
        LIMIT $1 OFFSET $2
        """,
        per_page,
        offset,
    )

    items = []
    for r in rows:
        d = dict(r)
        for field in ("confluence_sources", "key_risks"):
            v = d.get(field)
            if isinstance(v, str):
                d[field] = json.loads(v)
            elif v is None:
                d[field] = []
        items.append(d)

    return {"items": items, "total": total or 0, "page": page, "per_page": per_page}


@router.get("/{ticker}", response_model=list[ValidatedSignalResponse])
async def signals_by_ticker(
    ticker: str,
    conn: asyncpg.Connection = Depends(get_conn),
):
    rows = await conn.fetch(
        """
        SELECT ROW_NUMBER() OVER (ORDER BY time DESC) AS id,
               ticker, time AS timestamp_utc, conviction_score,
               catalyst_type, rationale, is_trap,
               confluence_sources, key_risks
        FROM validated_signals
        WHERE ticker = $1
        ORDER BY time DESC
        """,
        ticker.upper(),
    )
    return [dict(r) for r in rows]
