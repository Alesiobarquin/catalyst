"""Validated signals router — reads from the validated_signals hypertable (Python persistence)."""

import asyncio
import csv
import io
import json
from datetime import datetime, timezone

import asyncpg
from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse

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
               confluence_sources, key_risks,
               suggested_entry_zone, suggested_stop
        FROM validated_signals
        {where}
        ORDER BY time DESC
        LIMIT {limit_param} OFFSET {offset_param}
        """,
        *data_args,
    )

    items = [_format_signal_row(r) for r in rows]
    return {"items": items, "total": total or 0, "page": page, "per_page": per_page}


@router.get("/export/csv")
async def export_signals_csv(
    catalyst_type: str | None = Query(None),
    min_conviction: int | None = Query(None, ge=0, le=100),
    is_trap: bool | None = Query(None),
    ticker: str | None = Query(None),
    conn: asyncpg.Connection = Depends(get_conn),
):
    """Export filtered signals to RFC 4180 CSV format."""
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

    rows = await conn.fetch(
        f"""
        SELECT time, ticker, conviction_score, catalyst_type, is_trap,
               trap_reason, rationale, confluence_count,
               suggested_entry_zone, suggested_stop, risk_level, suggested_timeframe
        FROM validated_signals
        {where}
        ORDER BY time DESC
        LIMIT 5000
        """,
        *args,
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "time",
            "ticker",
            "conviction_score",
            "catalyst_type",
            "is_trap",
            "trap_reason",
            "suggested_entry_zone",
            "suggested_stop",
            "risk_level",
            "suggested_timeframe",
            "confluence_count",
            "rationale",
        ]
    )

    for r in rows:
        ts = r["time"].isoformat() if r.get("time") else ""
        writer.writerow(
            [
                ts,
                r.get("ticker"),
                r.get("conviction_score"),
                r.get("catalyst_type"),
                r.get("is_trap"),
                r.get("trap_reason") or "",
                r.get("suggested_entry_zone") or "",
                r.get("suggested_stop") or "",
                r.get("risk_level") or "",
                r.get("suggested_timeframe") or "",
                r.get("confluence_count"),
                r.get("rationale") or "",
            ]
        )

    csv_data = output.getvalue()
    today_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    filename = f"catalyst_signals_{today_str}.csv"

    return StreamingResponse(
        iter([csv_data]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/stream")
async def stream_signals(
    request: Request,
    min_conviction: int = Query(70, ge=0, le=100),
    max_events: int | None = Query(None, description="Optional cap on streamed events"),
    poll_interval: float = Query(2.0, ge=0.01, le=60.0),
    conn: asyncpg.Connection = Depends(get_conn),
):
    """
    Server-Sent Events (SSE) endpoint streaming real-time validated signals.
    Provides live push updates for trading terminals and notification feeds.
    """

    async def event_generator():
        last_time = datetime.now(timezone.utc)
        yield f"event: connected\ndata: {json.dumps({'status': 'stream_active', 'timestamp': last_time.isoformat()})}\n\n"
        events_sent = 0

        while True:
            if max_events is not None and events_sent >= max_events:
                break
            if await request.is_disconnected():
                break

            try:
                rows = await conn.fetch(
                    """
                    SELECT ROW_NUMBER() OVER (ORDER BY time DESC) AS id,
                           ticker, time AS timestamp_utc, conviction_score,
                           catalyst_type, rationale, is_trap,
                           confluence_sources, key_risks,
                           suggested_entry_zone, suggested_stop
                    FROM validated_signals
                    WHERE time > $1 AND conviction_score >= $2
                    ORDER BY time ASC
                    LIMIT 20
                    """,
                    last_time,
                    min_conviction,
                )

                for r in rows:
                    formatted = _format_signal_row(r)
                    if formatted.get("timestamp_utc"):
                        last_time = formatted["timestamp_utc"]
                        formatted["timestamp_utc"] = formatted["timestamp_utc"].isoformat()
                    payload = json.dumps(formatted)
                    yield f"event: signal\ndata: {payload}\n\n"
                    events_sent += 1
                    if max_events is not None and events_sent >= max_events:
                        return

            except Exception:
                pass

            yield ": ping\n\n"
            if max_events is not None and events_sent >= max_events:
                break
            await asyncio.sleep(poll_interval)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


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
               confluence_sources, key_risks,
               suggested_entry_zone, suggested_stop
        FROM validated_signals
        WHERE ticker = $1
        ORDER BY time DESC
        """,
        ticker.upper(),
    )
    return [_format_signal_row(r) for r in rows]
