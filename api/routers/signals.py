"""Validated signals router — reads from the validated_signals hypertable (Python persistence)."""

import asyncio
import csv
import io
import json
import logging
from datetime import datetime, timezone

import asyncpg
from fastapi import APIRouter, Depends, Path, Query, Request
from fastapi.responses import StreamingResponse

from api.db import get_conn
from api.models import PaginatedResponse, SignalStatsResponse, ValidatedSignalResponse

logger = logging.getLogger("api.signals")

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

    if d.get("confluence_count") is None:
        sources = d.get("confluence_sources")
        d["confluence_count"] = len(sources) if isinstance(sources, list) else 0

    return d


@router.get("", response_model=PaginatedResponse[ValidatedSignalResponse])
async def list_signals(
    catalyst_type: str | None = Query(None),
    min_conviction: int | None = Query(None, ge=0, le=100),
    is_trap: bool | None = Query(None),
    ticker: str | None = Query(None, min_length=1, max_length=10, pattern=r"^[A-Za-z0-9\.\-]+$"),
    date_range: str | None = Query(None, pattern="^(7d|30d|90d|all)$"),
    min_confluence: int | None = Query(None, ge=1),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    conn: asyncpg.Connection = Depends(get_conn),
):
    """Return paginated Gemini-validated signals, newest first. Optional catalyst/conviction/trap/ticker/date/confluence filters."""
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

    if min_confluence is not None:
        args.append(min_confluence)
        clauses.append(f"confluence_count >= ${len(args)}")

    if date_range and date_range != "all":
        days_map = {"7d": 7, "30d": 30, "90d": 90}
        days = days_map.get(date_range)
        if days:
            args.append(days)
            clauses.append(
                f"time >= (NOW() AT TIME ZONE 'UTC') - (${len(args)}::int * INTERVAL '1 day')"
            )

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
               confluence_sources, confluence_count, key_risks,
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


@router.get("/stats", response_model=SignalStatsResponse)
async def get_signal_stats(conn: asyncpg.Connection = Depends(get_conn)):
    """Return aggregate statistics across all Gemini-validated signals."""
    row = await conn.fetchrow(
        """
        SELECT COUNT(*) AS total,
               COALESCE(AVG(conviction_score), 0) AS avg_conviction,
               COUNT(*) FILTER (WHERE is_trap = TRUE) AS trap_count,
               COUNT(*) FILTER (WHERE is_trap = FALSE OR is_trap IS NULL) AS clean_count,
               COUNT(*) FILTER (WHERE conviction_score >= 80) AS high_conviction_count
        FROM validated_signals
        """
    )
    catalyst_rows = await conn.fetch(
        """
        SELECT catalyst_type, COUNT(*) AS count
        FROM validated_signals
        WHERE catalyst_type IS NOT NULL
        GROUP BY catalyst_type
        ORDER BY count DESC
        """
    )
    total = row["total"] or 0
    avg_conv = float(round(float(row["avg_conviction"] or 0.0), 1))
    trap_count = int(row["trap_count"] or 0)
    clean_count = int(row["clean_count"] or 0)
    high_conv = int(row["high_conviction_count"] or 0)
    trap_rate = round((trap_count / total * 100), 1) if total > 0 else 0.0

    breakdown = {str(r["catalyst_type"]): int(r["count"]) for r in catalyst_rows}

    return SignalStatsResponse(
        total_signals=total,
        avg_conviction=avg_conv,
        trap_count=trap_count,
        clean_count=clean_count,
        trap_rate_percent=trap_rate,
        high_conviction_count=high_conv,
        catalyst_breakdown=breakdown,
    )


@router.get("/export/csv")
async def export_signals_csv(
    catalyst_type: str | None = Query(None),
    min_conviction: int | None = Query(None, ge=0, le=100),
    is_trap: bool | None = Query(None),
    ticker: str | None = Query(None, min_length=1, max_length=10, pattern=r"^[A-Za-z0-9\.\-]+$"),
    date_range: str | None = Query(None, pattern="^(7d|30d|90d|all)$"),
    min_confluence: int | None = Query(None, ge=1),
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

    if min_confluence is not None:
        args.append(min_confluence)
        clauses.append(f"confluence_count >= ${len(args)}")

    if date_range and date_range != "all":
        days_map = {"7d": 7, "30d": 30, "90d": 90}
        days = days_map.get(date_range)
        if days:
            args.append(days)
            clauses.append(
                f"time >= (NOW() AT TIME ZONE 'UTC') - (${len(args)}::int * INTERVAL '1 day')"
            )

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


def _get_conn_provider(request: Request):
    """Return database connection provider, respecting test dependency overrides."""
    override = request.app.dependency_overrides.get(get_conn)
    return override if override is not None else get_conn


@router.get("/stream")
async def stream_signals(
    request: Request,
    min_conviction: int = Query(70, ge=0, le=100),
    max_events: int | None = Query(None, description="Optional cap on streamed events"),
    poll_interval: float = Query(2.0, ge=0.01, le=60.0),
    conn_provider=Depends(_get_conn_provider),
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
                gen = conn_provider()
                rows = []
                if hasattr(gen, "__aiter__"):
                    async for conn in gen:
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
                        break
                elif hasattr(gen, "__iter__"):
                    for conn in gen:
                        rows = await conn.fetch(
                            """
                            SELECT ROW_NUMBER() OVER (ORDER BY time DESC) AS id,
                                   ticker, time AS timestamp_utc, conviction_score,
                                   catalyst_type, rationale, is_trap,
                                   confluence_sources, confluence_count, key_risks,
                                   suggested_entry_zone, suggested_stop
                            FROM validated_signals
                            WHERE time > $1 AND conviction_score >= $2
                            ORDER BY time ASC
                            LIMIT 20
                            """,
                            last_time,
                            min_conviction,
                        )
                        break

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

            except (asyncpg.PostgresError, ConnectionError, OSError) as db_err:
                logger.warning("Transient error during signal stream poll: %s", db_err)
            except Exception as exc:
                logger.debug("Unexpected error during signal stream poll: %s", exc)

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


@router.get("/ticker/{ticker}", response_model=list[ValidatedSignalResponse])
@router.get("/{ticker}", response_model=list[ValidatedSignalResponse])
async def signals_by_ticker(
    ticker: str = Path(..., min_length=1, max_length=10, pattern=r"^[A-Za-z0-9\.\-]+$"),
    conn: asyncpg.Connection = Depends(get_conn),
):
    rows = await conn.fetch(
        """
        SELECT ROW_NUMBER() OVER (ORDER BY time DESC) AS id,
               ticker, time AS timestamp_utc, conviction_score,
               catalyst_type, rationale, is_trap,
               confluence_sources, confluence_count, key_risks,
               suggested_entry_zone, suggested_stop
        FROM validated_signals
        WHERE ticker = $1
        ORDER BY time DESC
        """,
        ticker.upper(),
    )
    return [_format_signal_row(r) for r in rows]
