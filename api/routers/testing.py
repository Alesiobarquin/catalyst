"""Testing & Diagnostics router for developer synthetic event injection."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from api.config import settings

logger = logging.getLogger("testing-router")

router = APIRouter(prefix="/testing", tags=["testing"])


class SyntheticInjectRequest(BaseModel):
    scenario: Literal["single", "confluence", "drop", "custom"] = "confluence"
    ticker: str = Field(default="NVDA", min_length=1, max_length=10)
    price: float = Field(default=125.50, gt=0)
    volume: float = Field(default=850000.0, gt=0)
    relative_volume: float = Field(default=3.2, gt=0)
    short_float: float = Field(default=28.5, ge=0)
    dry_run: bool = False


class SyntheticInjectResponse(BaseModel):
    success: bool
    scenario: str
    ticker: str
    events_injected: int
    message: str


def _create_synthetic_events(req: SyntheticInjectRequest) -> list[dict[str, Any]]:
    ticker = req.ticker.strip().upper()
    now_iso = datetime.now(timezone.utc).isoformat()
    events: list[dict[str, Any]] = []

    if req.scenario == "single":
        events.append(
            {
                "hunter": "squeeze",
                "ticker": ticker,
                "price": req.price,
                "volume": req.volume,
                "relative_volume": req.relative_volume,
                "short_float": req.short_float,
                "days_to_cover": 4.5,
                "timestamp": now_iso,
            }
        )
    elif req.scenario == "confluence":
        events.append(
            {
                "hunter": "squeeze",
                "ticker": ticker,
                "price": req.price,
                "volume": req.volume,
                "relative_volume": req.relative_volume,
                "short_float": req.short_float,
                "days_to_cover": 4.5,
                "timestamp": now_iso,
            }
        )
        events.append(
            {
                "hunter": "insider",
                "ticker": ticker,
                "transaction_code": "P",
                "transaction_amount_usd": 500000.0,
                "price": req.price,
                "volume": req.volume,
                "relative_volume": req.relative_volume,
                "source": "edgar_api_json",
                "timestamp": now_iso,
            }
        )
    elif req.scenario == "drop":
        # Volume below Gatekeeper threshold (< 50,000)
        events.append(
            {
                "hunter": "squeeze",
                "ticker": ticker,
                "price": req.price,
                "volume": 10000.0,
                "relative_volume": 1.0,
                "short_float": req.short_float,
                "days_to_cover": 1.0,
                "timestamp": now_iso,
            }
        )
    elif req.scenario == "custom":
        events.append(
            {
                "hunter": "squeeze",
                "ticker": ticker,
                "price": req.price,
                "volume": req.volume,
                "relative_volume": req.relative_volume,
                "short_float": req.short_float,
                "timestamp": now_iso,
            }
        )

    return events


@router.post("/inject", response_model=SyntheticInjectResponse)
async def inject_synthetic_signal(req: SyntheticInjectRequest):
    """Inject synthetic market catalyst events into Kafka raw-events for pipeline testing.

    Disabled in production environments for safety.
    """
    if settings.environment == "production":
        raise HTTPException(
            status_code=403,
            detail="Synthetic signal injection is disabled in production environments.",
        )

    events = _create_synthetic_events(req)

    if req.dry_run:
        return SyntheticInjectResponse(
            success=True,
            scenario=req.scenario,
            ticker=req.ticker.upper(),
            events_injected=len(events),
            message=f"Dry run: Generated {len(events)} synthetic event(s) for {req.ticker.upper()} (no Kafka publish).",
        )

    # Attempt publishing to Kafka
    kafka_servers = getattr(settings, "kafka_bootstrap_servers", "localhost:9092")
    raw_topic = getattr(settings, "raw_events_topic", "raw-events")

    try:
        from kafka.errors import KafkaError

        from kafka import KafkaProducer

        producer = KafkaProducer(
            bootstrap_servers=kafka_servers,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            request_timeout_ms=3000,
        )
        for ev in events:
            producer.send(raw_topic, value=ev)
        producer.flush(timeout=3)
        producer.close(timeout=1)
        return SyntheticInjectResponse(
            success=True,
            scenario=req.scenario,
            ticker=req.ticker.upper(),
            events_injected=len(events),
            message=f"Successfully injected {len(events)} event(s) for {req.ticker.upper()} into {raw_topic}.",
        )
    except (KafkaError, OSError, TimeoutError) as exc:
        logger.warning("Kafka injection failed or offline (%s): %s", kafka_servers, exc)
        raise HTTPException(
            status_code=503,
            detail=f"Kafka broker offline or unavailable ({kafka_servers}): {exc}",
        )
    except Exception as exc:
        logger.error("Unexpected error injecting events: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error injecting events: {exc}",
        )
