#!/usr/bin/env python3
"""Synthetic Signal Injector: Inject test market catalyst events into Kafka raw-events.

Allows deterministic testing of the Gatekeeper, AI Layer, and Strategy Engine
without waiting for live web scrapers.

Scenarios:
    --scenario single:     Injects a single Squeeze event (confluence=1, buffered in Redis)
    --scenario confluence: Injects a Squeeze event followed by an Insider event (confluence=2, triggers Gatekeeper)
    --scenario drop:       Injects an event with volume below 50,000 (dropped by Gatekeeper)
    --scenario custom:     Injects custom parameters passed via CLI

Usage:
    python scripts/inject_synthetic_signals.py --scenario confluence --ticker NVDA
    python scripts/inject_synthetic_signals.py --scenario single --ticker TEST1
    python scripts/inject_synthetic_signals.py --scenario drop --ticker JUNK
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from typing import Any

from kafka import KafkaProducer

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s [signal-injector] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("signal-injector")


def get_kafka_producer(bootstrap_servers: str) -> KafkaProducer:
    """Initialize KafkaProducer with JSON serialization and retry logic."""
    try:
        return KafkaProducer(
            bootstrap_servers=bootstrap_servers,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            request_timeout_ms=10000,
        )
    except Exception as exc:
        logger.error("Failed to connect to Kafka at %s: %s", bootstrap_servers, exc)
        sys.exit(1)


def create_squeeze_event(
    ticker: str,
    price: float = 125.50,
    volume: float = 850_000.0,
    relative_volume: float = 3.2,
    short_float: float = 28.5,
) -> dict[str, Any]:
    return {
        "hunter": "squeeze",
        "source_hunter": "squeeze",
        "ticker": ticker.upper(),
        "price": price,
        "volume": volume,
        "relative_volume": relative_volume,
        "short_float": short_float,
        "days_to_cover": 4.5,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
    }


def create_insider_event(
    ticker: str,
    price: float = 125.50,
    volume: float = 850_000.0,
    relative_volume: float = 3.2,
    amount_usd: float = 500_000.0,
) -> dict[str, Any]:
    return {
        "hunter": "insider",
        "ticker": ticker.upper(),
        "transaction_code": "P",
        "transaction_amount_usd": amount_usd,
        "price": price,
        "volume": volume,
        "relative_volume": relative_volume,
        "source": "edgar_api_json",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
    }


def create_whale_event(
    ticker: str,
    price: float = 125.50,
    volume: float = 850_000.0,
    relative_volume: float = 3.2,
    option_type: str = "call",
    strike_price: float = 130.0,
    option_volume: int = 15000,
) -> dict[str, Any]:
    return {
        "hunter": "whale",
        "source_hunter": "whale",
        "ticker": ticker.upper(),
        "option_type": option_type,
        "strike_price": strike_price,
        "option_volume": option_volume,
        "price": price,
        "volume": volume,
        "relative_volume": relative_volume,
        "source": "barchart_unusual",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
    }


def create_biotech_event(
    ticker: str,
    price: float = 45.00,
    volume: float = 650_000.0,
    relative_volume: float = 2.8,
    catalyst_type: str = "PDUFA",
    stage: str = "Phase 3",
    drug_name: str = "CAT-101",
) -> dict[str, Any]:
    return {
        "hunter": "biotech",
        "source_hunter": "biotech",
        "ticker": ticker.upper(),
        "catalyst_type": catalyst_type,
        "stage": stage,
        "drug_name": drug_name,
        "event_date": "2026-06-30",
        "price": price,
        "volume": volume,
        "relative_volume": relative_volume,
        "source": "biopharm_catalyst",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
    }


def create_drifter_event(
    ticker: str,
    price: float = 180.00,
    volume: float = 1_200_000.0,
    relative_volume: float = 2.5,
    surprise_percent: float = 15.5,
) -> dict[str, Any]:
    return {
        "hunter": "drifter",
        "source_hunter": "drifter",
        "ticker": ticker.upper(),
        "surprise_percent": surprise_percent,
        "eps_actual": 2.10,
        "eps_estimate": 1.82,
        "price": price,
        "volume": volume,
        "relative_volume": relative_volume,
        "source": "fmp_earnings",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
    }


def inject_events(
    producer: KafkaProducer,
    topic: str,
    events: list[dict[str, Any]],
    delay_sec: float = 0.5,
) -> None:
    for idx, event in enumerate(events, start=1):
        future = producer.send(topic, value=event)
        record_metadata = future.get(timeout=10)
        logger.info(
            "[%d/%d] Injected %s event for %s -> topic: %s, partition: %d, offset: %d",
            idx,
            len(events),
            event.get("hunter") or event.get("source_hunter", "unknown"),
            event.get("ticker"),
            record_metadata.topic,
            record_metadata.partition,
            record_metadata.offset,
        )
        if idx < len(events) and delay_sec > 0:
            time.sleep(delay_sec)
    producer.flush()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Inject synthetic market catalyst events into Kafka raw-events."
    )
    parser.add_argument(
        "--scenario",
        choices=["single", "confluence", "triple", "biotech", "whale", "drifter", "drop", "custom"],
        default="confluence",
        help="Injection scenario (default: confluence)",
    )
    parser.add_argument(
        "--ticker",
        default="NVDA",
        help="Stock ticker symbol (default: NVDA - use real tickers to test Java engine pricing)",
    )
    parser.add_argument(
        "--price",
        type=float,
        default=125.50,
        help="Share price (default: 125.50)",
    )
    parser.add_argument(
        "--volume",
        type=float,
        default=850_000.0,
        help="Trading volume (default: 850,000)",
    )
    parser.add_argument(
        "--rvol",
        type=float,
        default=3.2,
        help="Relative volume (default: 3.2)",
    )
    parser.add_argument(
        "--topic",
        default=os.getenv("RAW_EVENTS_TOPIC", "raw-events"),
        help="Kafka destination topic (default: raw-events)",
    )
    parser.add_argument(
        "--bootstrap-servers",
        default=os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092"),
        help="Kafka bootstrap servers (default: localhost:9092)",
    )
    args = parser.parse_args()

    producer = get_kafka_producer(args.bootstrap_servers)

    events: list[dict[str, Any]] = []

    if args.scenario == "single":
        events.append(
            create_squeeze_event(
                ticker=args.ticker,
                price=args.price,
                volume=args.volume,
                relative_volume=args.rvol,
            )
        )
        logger.info(
            "Scenario 'single': Expect Gatekeeper to buffer %s without triggering triage forward.",
            args.ticker,
        )
    elif args.scenario == "confluence":
        events.append(
            create_squeeze_event(
                ticker=args.ticker,
                price=args.price,
                volume=args.volume,
                relative_volume=args.rvol,
            )
        )
        events.append(
            create_insider_event(
                ticker=args.ticker,
                price=args.price,
                volume=args.volume,
                relative_volume=args.rvol,
            )
        )
        logger.info(
            "Scenario 'confluence': Expect Gatekeeper to forward %s to triage-priority (confluence=2).",
            args.ticker,
        )
    elif args.scenario == "triple":
        events.append(
            create_squeeze_event(
                ticker=args.ticker,
                price=args.price,
                volume=args.volume,
                relative_volume=args.rvol,
            )
        )
        events.append(
            create_insider_event(
                ticker=args.ticker,
                price=args.price,
                volume=args.volume,
                relative_volume=args.rvol,
            )
        )
        events.append(
            create_whale_event(
                ticker=args.ticker,
                price=args.price,
                volume=args.volume,
                relative_volume=args.rvol,
            )
        )
        logger.info(
            "Scenario 'triple': Expect Gatekeeper to forward %s with confluence=3.",
            args.ticker,
        )
    elif args.scenario == "biotech":
        events.append(
            create_biotech_event(
                ticker=args.ticker,
                price=args.price,
                volume=args.volume,
                relative_volume=args.rvol,
            )
        )
        logger.info("Scenario 'biotech': Injected clinical catalyst for %s.", args.ticker)
    elif args.scenario == "whale":
        events.append(
            create_whale_event(
                ticker=args.ticker,
                price=args.price,
                volume=args.volume,
                relative_volume=args.rvol,
            )
        )
        logger.info("Scenario 'whale': Injected unusual options sweep for %s.", args.ticker)
    elif args.scenario == "drifter":
        events.append(
            create_drifter_event(
                ticker=args.ticker,
                price=args.price,
                volume=args.volume,
                relative_volume=args.rvol,
            )
        )
        logger.info("Scenario 'drifter': Injected post-earnings surprise beat for %s.", args.ticker)
    elif args.scenario == "drop":
        # Low volume (< 50,000 threshold)
        events.append(
            create_squeeze_event(
                ticker=args.ticker,
                price=args.price,
                volume=10_000.0,
                relative_volume=1.0,
            )
        )
        logger.info(
            "Scenario 'drop': Expect Gatekeeper to drop %s due to low volume (10000 < 50000).",
            args.ticker,
        )
    elif args.scenario == "custom":
        events.append(
            create_squeeze_event(
                ticker=args.ticker,
                price=args.price,
                volume=args.volume,
                relative_volume=args.rvol,
            )
        )

    inject_events(producer, args.topic, events)
    logger.info("Injection complete.")


if __name__ == "__main__":
    main()
