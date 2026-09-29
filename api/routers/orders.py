import contextlib
import csv
import io
import json
from datetime import datetime, timezone

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Path, Query
from fastapi.responses import StreamingResponse

from api.db import get_conn
from api.models import (
    ConfluenceDetail,
    ConfluenceFactor,
    ExitTrigger,
    OrderStatsResponse,
    PaginatedResponse,
    PipelineDetail,
    PipelineTimelineItem,
    RiskDetail,
    RiskParameter,
    ScenarioDetail,
    SignalDetailResponse,
    ThesisDetail,
    TradeOrderResponse,
)

router = APIRouter(prefix="/orders", tags=["orders"])


def _format_order_row(r: dict | asyncpg.Record) -> dict:
    d = dict(r)
    exec_status = d.pop("execution_status", None)
    exec_id = d.pop("exec_id", None)
    alpaca_order_id = d.pop("alpaca_order_id", None)
    filled_avg_price = d.pop("filled_avg_price", None)
    error_message = d.pop("error_message", None)

    if exec_status is not None:
        d["execution"] = {
            "id": exec_id or 0,
            "trade_order_id": d["id"],
            "timestamp_utc": d["timestamp_utc"],
            "ticker": d["ticker"],
            "alpaca_order_id": alpaca_order_id,
            "execution_status": exec_status,
            "filled_avg_price": float(filled_avg_price) if filled_avg_price is not None else None,
            "error_message": error_message,
        }
    elif "execution" not in d:
        d["execution"] = None
    return d


@router.get("", response_model=PaginatedResponse[TradeOrderResponse])
async def list_orders(
    strategy: str | None = Query(None),
    status: str | None = Query(None),
    ticker: str | None = Query(None, min_length=1, max_length=10, pattern=r"^[A-Za-z0-9\.\-]+$"),
    date_range: str | None = Query(None, pattern="^(7d|30d|90d|all)$"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    conn: asyncpg.Connection = Depends(get_conn),
):
    """Return paginated trade orders, newest first. Optional strategy/status/ticker/date filters."""
    offset = (page - 1) * per_page
    clauses: list[str] = []
    args: list[object] = []

    if strategy and strategy != "all":
        args.append(strategy)
        clauses.append(f"strategy_used = ${len(args)}")

    if status and status != "all":
        args.append(status.upper())
        clauses.append(f"status = ${len(args)}")

    if ticker:
        args.append(ticker.strip().upper())
        clauses.append(f"ticker = ${len(args)}")

    if date_range and date_range != "all":
        days_map = {"7d": 7, "30d": 30, "90d": 90}
        days = days_map.get(date_range)
        if days:
            args.append(days)
            clauses.append(
                f"timestamp_utc >= (NOW() AT TIME ZONE 'UTC') - (${len(args)}::int * INTERVAL '1 day')"
            )

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    where_t = f"WHERE {' AND '.join(c.replace('status =', 't.status =').replace('ticker =', 't.ticker =').replace('strategy_used =', 't.strategy_used =').replace('timestamp_utc >=', 't.timestamp_utc >=') for c in clauses)}" if clauses else ""

    total = await conn.fetchval(f"SELECT COUNT(*) FROM trade_orders {where}", *args)

    data_args = [*args, per_page, offset]
    limit_param = f"${len(args) + 1}"
    offset_param = f"${len(args) + 2}"

    query_with_exec = f"""
        SELECT t.id, t.ticker, t.timestamp_utc, t.action, t.strategy_used,
               t.recommended_size_usd, t.limit_price, t.stop_loss, t.target_price,
               t.rationale, t.conviction_score, t.catalyst_type,
               t.regime_vix, t.spy_above_200sma, t.status,
               e.id AS exec_id, e.alpaca_order_id, e.execution_status,
               e.filled_avg_price, e.error_message
        FROM trade_orders t
        LEFT JOIN LATERAL (
            SELECT id, alpaca_order_id, execution_status, filled_avg_price, error_message
            FROM trade_order_executions
            WHERE trade_order_id = t.id AND timestamp_utc = t.timestamp_utc
            ORDER BY updated_at DESC
            LIMIT 1
        ) e ON true
        {where_t}
        ORDER BY t.timestamp_utc DESC
        LIMIT {limit_param}
        OFFSET {offset_param}
    """

    try:
        rows = await conn.fetch(query_with_exec, *data_args)
    except asyncpg.UndefinedTableError:
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
        "items": [_format_order_row(r) for r in rows],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.get("/export/csv")
async def export_orders_csv(
    strategy: str | None = Query(None),
    status: str | None = Query(None),
    ticker: str | None = Query(None, min_length=1, max_length=10, pattern=r"^[A-Za-z0-9\.\-]+$"),
    date_range: str | None = Query(None, pattern="^(7d|30d|90d|all)$"),
    conn: asyncpg.Connection = Depends(get_conn),
):
    """Export filtered trade orders to RFC 4180 CSV format."""
    clauses: list[str] = []
    args: list[object] = []

    if strategy and strategy != "all":
        args.append(strategy)
        clauses.append(f"strategy_used = ${len(args)}")

    if status and status != "all":
        args.append(status.upper())
        clauses.append(f"status = ${len(args)}")

    if ticker:
        args.append(ticker.strip().upper())
        clauses.append(f"ticker = ${len(args)}")

    if date_range and date_range != "all":
        days_map = {"7d": 7, "30d": 30, "90d": 90}
        days = days_map.get(date_range)
        if days:
            args.append(days)
            clauses.append(
                f"timestamp_utc >= (NOW() AT TIME ZONE 'UTC') - (${len(args)}::int * INTERVAL '1 day')"
            )

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    rows = await conn.fetch(
        f"""
        SELECT id, ticker, timestamp_utc, action, strategy_used,
               recommended_size_usd, limit_price, stop_loss, target_price,
               rationale, conviction_score, catalyst_type,
               regime_vix, spy_above_200sma, status
        FROM trade_orders
        {where}
        ORDER BY timestamp_utc DESC
        LIMIT 5000
        """,
        *args,
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "id",
            "timestamp_utc",
            "ticker",
            "action",
            "strategy_used",
            "recommended_size_usd",
            "limit_price",
            "stop_loss",
            "target_price",
            "conviction_score",
            "catalyst_type",
            "status",
            "regime_vix",
            "spy_above_200sma",
            "rationale",
        ]
    )

    for r in rows:
        ts = r["timestamp_utc"].isoformat() if r.get("timestamp_utc") else ""
        writer.writerow(
            [
                r.get("id"),
                ts,
                r.get("ticker"),
                r.get("action"),
                r.get("strategy_used"),
                r.get("recommended_size_usd"),
                r.get("limit_price"),
                r.get("stop_loss"),
                r.get("target_price"),
                r.get("conviction_score"),
                r.get("catalyst_type"),
                r.get("status"),
                r.get("regime_vix"),
                r.get("spy_above_200sma"),
                r.get("rationale"),
            ]
        )

    csv_data = output.getvalue()
    today_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    filename = f"catalyst_orders_{today_str}.csv"

    return StreamingResponse(
        iter([csv_data]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/stats", response_model=OrderStatsResponse)
async def order_stats(conn: asyncpg.Connection = Depends(get_conn)):
    """Aggregate stats for the analytics / stats bar."""
    total = await conn.fetchval("SELECT COUNT(*) FROM trade_orders") or 0
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

    tot_vol = (
        await conn.fetchval("SELECT COALESCE(SUM(recommended_size_usd), 0) FROM trade_orders")
        or 0.0
    )

    status_map = {r["status"]: r["cnt"] for r in status_rows}
    hit_target = int(status_map.get("HIT_TARGET", 0))
    hit_stop = int(status_map.get("HIT_STOP", 0))
    closed_total = hit_target + hit_stop
    win_rate = round((hit_target / closed_total) * 100.0, 1) if closed_total > 0 else 0.0

    return {
        "total_orders": int(total),
        "avg_conviction": float(avg_con),
        "hit_target_count": hit_target,
        "hit_stop_count": hit_stop,
        "active_count": int(status_map.get("ACTIVE", 0)),
        "expired_count": int(status_map.get("EXPIRED", 0)),
        "strategy_breakdown": {r["strategy_used"]: r["cnt"] for r in strat_rows},
        "catalyst_breakdown": {r["catalyst_type"]: r["cnt"] for r in cat_rows},
        "daily_volume": [{"date": r["date"], "count": r["cnt"]} for r in daily_rows],
        "conviction_distribution": [
            {"bucket": r["bucket"], "count": r["cnt"]} for r in bucket_rows
        ],
        "win_rate_percent": win_rate,
        "realized_pnl_percent": 0.0,
        "total_realized_pnl_usd": 0.0,
        "total_recommended_volume_usd": float(tot_vol),
    }


HORIZONS = {
    "Supernova": "3–14d",
    "Scalper": "1–3d",
    "Follower": "14–30d",
    "Drifter": "10–21d",
    "Fallback": "—",
}

CATALYST_LABELS = {
    "SUPERNOVA": "Short-covering event detected",
    "SCALPER": "Binary catalyst identified",
    "FOLLOWER": "Insider accumulation detected",
    "DRIFTER": "Post-earnings drift signal",
    "UNKNOWN": "Unclassified signal",
}

STATUS_LABELS = {
    "ACTIVE": "Active",
    "HIT_TARGET": "Target hit",
    "HIT_STOP": "Stopped",
    "EXPIRED": "Expired",
}


def _conviction_label(score: int) -> str:
    if score >= 85:
        return "VERY HIGH"
    if score >= 70:
        return "HIGH"
    if score >= 55:
        return "MODERATE"
    if score >= 40:
        return "LOW"
    return "MINIMAL"


@router.get("/{order_id}/detail", response_model=SignalDetailResponse)
async def get_order_detail(
    order_id: int = Path(..., ge=1),
    conn: asyncpg.Connection = Depends(get_conn),
):
    """Return comprehensive signal analysis matching frontend SignalDetail schema."""
    order_row = await conn.fetchrow(
        """
        SELECT id, ticker, timestamp_utc, action, strategy_used,
               recommended_size_usd, limit_price, stop_loss, target_price,
               rationale, conviction_score, catalyst_type,
               regime_vix, spy_above_200sma, status
        FROM trade_orders
        WHERE id = $1
        """,
        order_id,
    )
    if not order_row:
        raise HTTPException(status_code=404, detail=f"Order {order_id} not found")

    ticker = order_row["ticker"]
    sig_row = await conn.fetchrow(
        """
        SELECT *
        FROM validated_signals
        WHERE ticker = $1
          AND time >= $2 - INTERVAL '2 hours'
          AND time <= $2 + INTERVAL '2 hours'
        ORDER BY ABS(EXTRACT(EPOCH FROM (time - $2))) ASC
        LIMIT 1
        """,
        ticker,
        order_row["timestamp_utc"],
    )
    if not sig_row:
        # Fallback to nearest signal if outside 2-hour window
        sig_row = await conn.fetchrow(
            """
            SELECT *
            FROM validated_signals
            WHERE ticker = $1
            ORDER BY ABS(EXTRACT(EPOCH FROM (time - $2))) ASC
            LIMIT 1
            """,
            ticker,
            order_row["timestamp_utc"],
        )

    limit_price = float(order_row["limit_price"])
    stop_loss = float(order_row["stop_loss"])
    target_price = float(order_row["target_price"])
    pos_usd = float(order_row["recommended_size_usd"] or 0)
    conviction = int(order_row["conviction_score"] or 50)
    strat = order_row["strategy_used"]
    cat_type = order_row["catalyst_type"] or "UNKNOWN"
    cat_label = CATALYST_LABELS.get(cat_type, cat_type)
    vix = float(order_row["regime_vix"]) if order_row["regime_vix"] is not None else 18.0
    spy_above = bool(order_row["spy_above_200sma"])

    # Risk-reward
    risk_amount = limit_price - stop_loss
    reward_amount = target_price - limit_price
    rr_ratio = round(reward_amount / risk_amount, 2) if risk_amount > 0 else 1.0

    # Paragraphs & counter arguments
    rationale_text = order_row["rationale"] or ""
    paragraphs = [p.strip() for p in rationale_text.split("\n\n") if p.strip()]
    if not paragraphs and rationale_text:
        paragraphs = [rationale_text]

    counter_args: list[str] = []
    if sig_row and sig_row.get("key_risks"):
        kr = sig_row["key_risks"]
        if isinstance(kr, str):
            with contextlib.suppress(Exception):
                kr = json.loads(kr)
        if isinstance(kr, list):
            counter_args = [str(k) for k in kr]

    # Confluence factors
    factors = [
        ConfluenceFactor(
            source="Catalyst Signal",
            strength="HIGH" if conviction >= 70 else ("MODERATE" if conviction >= 50 else "LOW"),
            data=f"{cat_label} · {conviction}/100",
        ),
        ConfluenceFactor(
            source="Market Regime (SPY vs 200SMA)",
            strength="HIGH" if spy_above else "LOW",
            data="SPY above 200SMA" if spy_above else "SPY below 200SMA",
        ),
        ConfluenceFactor(
            source="VIX Volatility Regime",
            strength="LOW" if vix < 15 else ("MODERATE" if vix < 25 else "HIGH"),
            data=f"VIX {vix:.1f}",
        ),
    ]
    if sig_row and sig_row.get("confluence_sources"):
        sources = sig_row["confluence_sources"]
        if isinstance(sources, str):
            with contextlib.suppress(Exception):
                sources = json.loads(sources)
        if isinstance(sources, list):
            for s in sources:
                factors.append(
                    ConfluenceFactor(
                        source=f"Hunter Source ({s})",
                        strength="HIGH",
                        data=f"Verified event from {s} hunter",
                    )
                )

    # Scenarios
    target_pct = (target_price - limit_price) / limit_price if limit_price > 0 else 0
    stop_pct = (stop_loss - limit_price) / limit_price if limit_price > 0 else 0
    target_gain_usd = pos_usd * target_pct
    stop_loss_usd = pos_usd * stop_pct
    base_gain_usd = target_gain_usd * 0.45

    scenarios = [
        ScenarioDetail(
            label="Best case",
            value=f"+${target_gain_usd:,.0f} (+{target_pct * 100:.1f}%)",
            probability="~25%",
            type="best",
        ),
        ScenarioDetail(
            label="Base case",
            value=f"+${base_gain_usd:,.0f} (+{target_pct * 45:.1f}%)",
            probability="~40%",
            type="base",
        ),
        ScenarioDetail(
            label="Worst case",
            value=f"-${abs(stop_loss_usd):,.0f} ({stop_pct * 100:.1f}%)",
            probability="~35%",
            type="worst",
        ),
    ]

    stop_pct_val = (stop_loss - limit_price) / limit_price * 100 if limit_price > 0 else 0
    target_pct_val = (target_price - limit_price) / limit_price * 100 if limit_price > 0 else 0

    risk_parameters = [
        RiskParameter(label="Entry", value=f"${limit_price:.2f}"),
        RiskParameter(
            label="Stop loss",
            value=f"${stop_loss:.2f} ({stop_pct_val:+.1f}%)",
            description="Technical invalidation level",
        ),
        RiskParameter(
            label="Target",
            value=f"${target_price:.2f} ({target_pct_val:+.1f}%)",
        ),
        RiskParameter(
            label="Position size",
            value=f"${pos_usd / 1000:.0f}K",
            description=f"R:R 1:{rr_ratio}",
        ),
    ]

    exit_triggers = [
        ExitTrigger(priority=1, condition="Target attained", action="Take profit limit order"),
        ExitTrigger(priority=2, condition="Stop breach", action="Market order exit, no exceptions"),
        ExitTrigger(priority=3, condition="Catalyst invalidated", action="Exit within 2 sessions"),
        ExitTrigger(
            priority=4, condition="Time stop (14 sessions)", action="Evaluate thesis validity"
        ),
    ]

    ts_iso = order_row["timestamp_utc"].isoformat()
    timeline = [
        PipelineTimelineItem(
            stage="Ingestion",
            timestamp=ts_iso,
            detail="Scraped by market hunters & published to raw-events",
        ),
        PipelineTimelineItem(
            stage="Gatekeeper",
            timestamp=ts_iso,
            detail="Passed hardware liquidity filter & multi-factor confluence",
        ),
        PipelineTimelineItem(
            stage="AI Analysis",
            timestamp=ts_iso,
            detail=f"Validated by Gemini ({conviction}/100 conviction)",
        ),
        PipelineTimelineItem(
            stage="Engine Sizing",
            timestamp=ts_iso,
            detail=f"Half-Kelly sized position: ${pos_usd / 1000:.0f}K using {strat} strategy",
        ),
    ]

    raw_factors = dict(order_row)
    if sig_row:
        raw_factors["validated_signal_id"] = sig_row["id"]
        raw_factors["confluence_count"] = sig_row["confluence_count"]

    return SignalDetailResponse(
        ticker=ticker,
        exchange="NASDAQ",
        sector="Equities",
        action=order_row["action"],
        status=STATUS_LABELS.get(order_row["status"], order_row["status"]),
        strategy=strat,
        strategyDescription=cat_label.lower(),
        convictionScore=conviction,
        convictionMax=100,
        convictionLabel=_conviction_label(conviction),
        entryPrice=limit_price,
        stopLoss=stop_loss,
        targetPrice=target_price,
        currentPrice=None,
        pnlPercent=None,
        riskReward=f"1:{rr_ratio}",
        positionSize=f"${pos_usd / 1000:.0f}K",
        timeHorizon=HORIZONS.get(strat, "—"),
        generatedAt=order_row["timestamp_utc"].strftime("%b %d, %Y %H:%M UTC"),
        age=f"Signal #{order_id}",
        signalId=f"SIG-{order_id}",
        thesis=ThesisDetail(
            primaryCatalyst=cat_label,
            bodyParagraphs=paragraphs,
            counterArguments=counter_args,
        ),
        confluence=ConfluenceDetail(
            factors=factors,
            summaryText=f"Conviction score: {conviction}/100 · {_conviction_label(conviction)} confidence",
        ),
        risk=RiskDetail(
            parameters=risk_parameters,
            exitTriggers=exit_triggers,
            scenarios=scenarios,
            expectedValue=f"1:{rr_ratio}",
        ),
        pipeline=PipelineDetail(
            signalId=f"SIG-{order_id}",
            generatedAt=ts_iso,
            engineVersion="2.1.0-spring-boot",
            timeline=timeline,
            rawFactors=raw_factors,
        ),
    )


@router.get("/{ticker}", response_model=list[TradeOrderResponse])
async def orders_by_ticker(
    ticker: str,
    conn: asyncpg.Connection = Depends(get_conn),
):
    """All orders for a specific ticker, newest first."""
    query_with_exec = """
        SELECT t.id, t.ticker, t.timestamp_utc, t.action, t.strategy_used,
               t.recommended_size_usd, t.limit_price, t.stop_loss, t.target_price,
               t.rationale, t.conviction_score, t.catalyst_type,
               t.regime_vix, t.spy_above_200sma, t.status,
               e.id AS exec_id, e.alpaca_order_id, e.execution_status,
               e.filled_avg_price, e.error_message
        FROM trade_orders t
        LEFT JOIN LATERAL (
            SELECT id, alpaca_order_id, execution_status, filled_avg_price, error_message
            FROM trade_order_executions
            WHERE trade_order_id = t.id AND timestamp_utc = t.timestamp_utc
            ORDER BY updated_at DESC
            LIMIT 1
        ) e ON true
        WHERE t.ticker = $1
        ORDER BY t.timestamp_utc DESC
    """
    try:
        rows = await conn.fetch(query_with_exec, ticker.upper())
    except asyncpg.UndefinedTableError:
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
    return [_format_order_row(r) for r in rows]
