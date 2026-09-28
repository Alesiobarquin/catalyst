"""Validated signals router — reads from the validated_signals hypertable (Python persistence)."""

import json

import asyncpg
from fastapi import APIRouter, Depends, Query

from api.db import get_conn
from api.models import PaginatedResponse, ValidatedSignalResponse

router = APIRouter(prefix="/signals", tags=["signals"])


def _format_signal_row(row: asyncpg.Record | dict) -> dict:
    d = dict(row)
    for field in ("confluence_sources", "key_risks"):
        v = d.get(field)
        if isinstance(v, str):
            try:
                d[field] = json.loads(v)
            except (json.JSONDecodeError, TypeError):
                d[field] = [v] if v.strip() else []
        elif v is None:
            d[field] = []
    return d


@router.get("", response_model=PaginatedResponse[ValidatedSignalResponse])
async def list_signals(
    catalyst_type: str | None = Query(None),
    min_conviction: int | None = Query(None, ge=0, le=100),
    is_trap: bool | None = Query(None),
    ticker: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    conn: asyncpg.Connection = Depends(get_conn),
):
    """Return paginated Gemini-validated signals, newest first. Optional catalyst/conviction/trap/ticker filters."""
    offset = (page - 1) * per_page
    clauses: list[str] = []
    args: list[object] = []

    if catalyst_type and catalyst_type != "all":
        args.append(catalyst_type.upper())
        clauses.append(f"catalyst_type = ${len(args)}")

    if min_conviction is not None:
        args.append(min_conviction)
        clauses.append(f"conviction_score >= ${len(args)}")

    if is_trap is not None:
        args.append(is_trap)
        clauses.append(f"is_trap = ${len(args)}")

    if ticker:
        args.append(ticker.strip().upper())
        clauses.append(f"ticker = ${len(args)}")

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    total = await conn.fetchval(f"SELECT COUNT(*) FROM validated_signals {where}", *args)
    data_args = [*args, per_page, offset]
    limit_param = f"${len(args) + 1}"
    offset_param = f"${len(args) + 2}"
    rows = await conn.fetch(
        f"""
        SELECT ROW_NUMBER() OVER (ORDER BY time DESC) AS id,
               ticker, time AS timestamp_utc, conviction_score,
               catalyst_type, rationale, is_trap,
               confluence_sources, key_risks
        FROM validated_signals
        {where}
        ORDER BY time DESC
        LIMIT {limit_param} OFFSET {offset_param}
        """,
        *data_args,
    )

    items = [_format_signal_row(r) for r in rows]
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
    return [_format_signal_row(r) for r in rows]
