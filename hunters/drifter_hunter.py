"""
Drifter hunter — earnings beats via Financial Modeling Prep earning calendar.

Emits when reported EPS beats consensus by at least DRIFTER_MIN_SURPRISE_PERCENT
and liquidity passes Gatekeeper filters (price/volume from yfinance).
"""

from __future__ import annotations

import asyncio
from collections import deque
from datetime import datetime, timedelta, timezone

import httpx

from .common.config import (
    DRIFTER_INTERVAL_SECONDS,
    DRIFTER_LOOKBACK_DAYS,
    DRIFTER_MIN_SURPRISE_PERCENT,
    FMP_API_KEY,
)
from .common.kafka_client import KafkaClient
from .common.liquidity_lookup import fetch_liquidity_metrics
from .common.logger import get_logger
from .common.topics import KAFKA_TOPIC_DRIFTER, RAW_EVENTS_TOPIC

logger = get_logger("drifter_hunter")

FMP_CALENDAR_URL = "https://financialmodelingprep.com/api/v3/earning_calendar"

_SEEN: deque[str] = deque(maxlen=2000)
_SEEN_SET: set[str] = set()


def _remember(key: str) -> bool:
    if key in _SEEN_SET:
        return False
    if len(_SEEN) == _SEEN.maxlen:
        old = _SEEN.popleft()
        _SEEN_SET.discard(old)
    _SEEN.append(key)
    _SEEN_SET.add(key)
    return True


def _eps_surprise_pct(eps: float | None, est: float | None) -> float | None:
    if eps is None or est is None:
        return None
    if abs(est) < 1e-9:
        return None
    return ((eps - est) / abs(est)) * 100.0


def _rev_surprise_pct(rev: float | None, est: float | None) -> float | None:
    if rev is None or est is None:
        return None
    if abs(est) < 1e-9:
        return None
    return ((rev - est) / abs(est)) * 100.0


def _num(v) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


async def _fetch_calendar(client: httpx.AsyncClient) -> list[dict]:
    today = datetime.now(timezone.utc).date()
    start = today - timedelta(days=DRIFTER_LOOKBACK_DAYS)
    params = {
        "from": start.isoformat(),
        "to": today.isoformat(),
        "apikey": FMP_API_KEY,
    }
    r = await client.get(FMP_CALENDAR_URL, params=params, timeout=30.0)
    r.raise_for_status()
    data = r.json()
    if not isinstance(data, list):
        logger.warning("Unexpected FMP calendar response shape: %s", type(data))
        return []
    return data


async def _run_sweep(client: httpx.AsyncClient, kafka: KafkaClient) -> int:
    rows = await _fetch_calendar(client)
    pushed = 0

    for row in rows:
        symbol = (row.get("symbol") or "").strip().upper()
        if not symbol:
            continue

        eps = _num(row.get("eps"))
        eps_est = _num(row.get("epsEstimated"))
        rev = _num(row.get("revenue"))
        rev_est = _num(row.get("revenueEstimated"))

        surp = _eps_surprise_pct(eps, eps_est)
        if surp is None or surp < DRIFTER_MIN_SURPRISE_PERCENT:
            continue

        date_str = str(row.get("date") or "")
        dedupe_key = f"{symbol}:{date_str}"
        if not _remember(dedupe_key):
            continue

        liq = fetch_liquidity_metrics(symbol)
        if not liq:
            logger.debug("Skipping %s: liquidity lookup failed", symbol)
            continue

        payload = {
            "hunter": "drifter",
            "ticker": symbol,
            "surprise_percent": round(surp, 4),
            "eps_estimate": eps_est,
            "eps_actual": eps,
            "revenue_estimate": rev_est,
            "revenue_actual": rev,
            "earnings_date": date_str,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "price": liq["price"],
            "volume": liq["volume"],
            "relative_volume": liq["relative_volume"],
        }
        rev_surp = _rev_surprise_pct(rev, rev_est)
        if rev_surp is not None:
            payload["revenue_surprise_percent"] = round(rev_surp, 4)

        kafka.send_message(KAFKA_TOPIC_DRIFTER, payload)
        kafka.send_message(RAW_EVENTS_TOPIC, payload)
        pushed += 1
        logger.info(
            "Drifter beat: %s EPS surprise=%.2f%% (est=%s act=%s)",
            symbol,
            surp,
            eps_est,
            eps,
        )

    return pushed


async def run() -> None:
    if not FMP_API_KEY:
        logger.warning(
            "FMP_API_KEY is empty — drifter hunter idle. Set it in .env and recreate hunter-drifter."
        )
        while True:
            await asyncio.sleep(DRIFTER_INTERVAL_SECONDS)

    kafka = KafkaClient()
    logger.info(
        "Drifter hunter starting (interval=%ss, min_surprise=%.1f%%)",
        DRIFTER_INTERVAL_SECONDS,
        DRIFTER_MIN_SURPRISE_PERCENT,
    )

    async with httpx.AsyncClient() as client:
        while True:
            try:
                n = await _run_sweep(client, kafka)
                if n == 0:
                    logger.info(
                        "No new earnings beats above %.1f%% in lookback window.",
                        DRIFTER_MIN_SURPRISE_PERCENT,
                    )
            except Exception as e:
                logger.error("Drifter sweep failed: %s", e, exc_info=True)
                await asyncio.sleep(60)
                continue

            logger.info(
                "Next drifter sweep in %s seconds (~%.0f min).",
                DRIFTER_INTERVAL_SECONDS,
                DRIFTER_INTERVAL_SECONDS / 60,
            )
            await asyncio.sleep(DRIFTER_INTERVAL_SECONDS)
