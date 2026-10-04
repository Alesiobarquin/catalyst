"""Bounded public snapshot, built from private FastAPI responses and broker evidence."""

import argparse
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx
import psycopg

from kafka import KafkaConsumer, TopicPartition

GROUPS = {
    "gatekeeper-service": "raw-events",
    "ai-analysis-service": "triage-priority",
    "persistence-service": "validated-signals",
    "catalyst-engine": "validated-signals",
}


def pipeline_counts(timeout: int = 600) -> dict[str, int]:
    deadline = time.monotonic() + timeout
    stable = 0
    while time.monotonic() < deadline:
        counts = {}
        drained = True
        for group, topic in GROUPS.items():
            consumer = KafkaConsumer(
                bootstrap_servers=os.environ["KAFKA_BOOTSTRAP_SERVERS"],
                group_id=group,
                enable_auto_commit=False,
            )
            try:
                partitions = [
                    TopicPartition(topic, p) for p in consumer.partitions_for_topic(topic) or []
                ]
                ends = consumer.end_offsets(partitions)
                counts[topic] = sum(ends.values())
                for partition, end in ends.items():
                    committed = consumer.committed(partition) or 0
                    if end > committed:
                        drained = False
            finally:
                consumer.close()
        stable = stable + 1 if drained else 0
        if stable >= 3:
            return counts
        time.sleep(5)
    raise RuntimeError("Pipeline failed to drain before publication deadline")


def empty_snapshot(run_id: str, as_of: str) -> dict:
    return {
        "schema_version": 1,
        "run_id": run_id,
        "as_of": as_of,
        "status": "awaiting_first_run",
        "commit": os.getenv("RELEASE_COMMIT", ""),
        "hunters": [],
        "event_counts": {},
        "orders": [],
        "signals": [],
        "order_stats": {
            "total_orders": 0,
            "avg_conviction": 0,
            "hit_target_count": 0,
            "hit_stop_count": 0,
            "active_count": 0,
            "strategy_breakdown": {},
            "catalyst_breakdown": {},
            "daily_volume": [],
            "conviction_distribution": [],
        },
        "signal_stats": {
            "total_signals": 0,
            "avg_conviction": 0,
            "trap_count": 0,
            "clean_count": 0,
            "trap_rate_percent": 0,
            "high_conviction_count": 0,
            "catalyst_breakdown": {},
        },
        "benchmarks": [],
        "quotes": {},
        "history": {},
        "performance": [],
        "details": {},
        "regime": {"fresh": False},
    }


def validate_snapshot(data: dict) -> None:
    if data["schema_version"] != 1 or len(data["orders"]) > 200 or len(data["signals"]) > 200:
        raise ValueError("Snapshot violates bounded contract")
    if any(s.get("analysis_method") != "gemini" for s in data["signals"]):
        raise ValueError("Ungrounded provenance in public dataset")
    serialized = json.dumps(data, allow_nan=False)
    for name in ("GEMINI_API_KEY", "FMP_API_KEY", "TIMESCALE_PASSWORD"):
        secret = os.getenv(name, "")
        if len(secret) >= 8 and secret in serialized:
            raise ValueError("Secret detected in public snapshot")
    if any(o.get("execution") for o in data["orders"]):
        raise ValueError("Broker data must not be public")


def export(output: Path) -> dict:
    counts = pipeline_counts()
    baseline = json.loads(Path("/reports/baseline.json").read_text())
    counts = {topic: max(0, count - baseline.get(topic, 0)) for topic, count in counts.items()}
    now = datetime.now(timezone.utc)
    run_id = now.strftime("%Y%m%dT%H%M%SZ")
    data = empty_snapshot(run_id, now.isoformat())
    hunters = json.loads(Path("/reports/hunters.json").read_text())
    data.update(
        status="completed" if all(h["success"] for h in hunters) else "partial",
        hunters=hunters,
        event_counts=counts,
    )
    with psycopg.connect(
        host=os.environ["TIMESCALE_HOST"],
        user=os.environ["TIMESCALE_USER"],
        password=os.environ["TIMESCALE_PASSWORD"],
        dbname=os.environ["TIMESCALE_DB"],
    ) as conn:
        hypertables = {
            r[0]
            for r in conn.execute("SELECT hypertable_name FROM timescaledb_information.hypertables")
        }
        if not {"trade_orders", "validated_signals"} <= hypertables:
            raise RuntimeError("Both expected TimescaleDB hypertables must exist")
    with httpx.Client(
        base_url=os.getenv("API_INTERNAL_URL", "http://api:8000"), timeout=45
    ) as client:

        def get(path: str):
            response = client.get(path)
            response.raise_for_status()
            return response.json()

        def optional(path: str, default):
            try:
                return get(path)
            except (httpx.HTTPError, ValueError):
                return default

        for kind in ("orders", "signals"):
            data[kind] = []
            for page in (1, 2):
                data[kind].extend(get(f"/{kind}?per_page=100&page={page}")["items"])
        # This database is private and uses grounded-only processing; exclude any legacy analysis explicitly.
        data["signals"] = [s for s in data["signals"] if s.get("analysis_method") == "gemini"]
        for order in data["orders"]:
            order.pop("execution", None)
        data["order_stats"] = get("/orders/stats")
        data["signal_stats"] = get("/signals/stats")
        data["benchmarks"] = optional("/market/overview?symbols=SPY,QQQ,DIA,IWM", [])
        try:
            state = httpx.get("http://engine:8081/market-state", timeout=15)
            state.raise_for_status()
            data["regime"] = state.json()
        except (httpx.HTTPError, ValueError):
            data["regime"] = {"fresh": False}
        if not data["regime"].get("fresh"):
            data["status"] = "partial"
        tickers = list(dict.fromkeys(o["ticker"] for o in data["orders"]))[:12]
        for ticker in tickers:
            data["quotes"][ticker] = optional(f"/market/quote/{ticker}", {"ticker": ticker})
            data["history"][ticker] = optional(f"/market/history/{ticker}", [])
        ids = [str(o["id"]) for o in data["orders"][:20]]
        if ids:
            data["performance"] = optional(f"/performance/batch?ids={','.join(ids)}", [])
        for order in data["orders"][:30]:
            detail = optional(f"/orders/{order['id']}/detail", None)
            if detail:
                detail["pipeline"]["rawFactors"] = {}
                data["details"][str(order["id"])] = detail
    validate_snapshot(data)
    output.mkdir(parents=True, exist_ok=True)
    (output / "snapshot.json").write_text(json.dumps(data, allow_nan=False))
    (output / "manifest.json").write_text(
        json.dumps(
            {
                "schema_version": 1,
                "run_id": run_id,
                "as_of": data["as_of"],
                "data_path": f"/data/runs/{run_id}/snapshot.json",
            }
        )
    )
    return data


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", action="store_true")
    args = parser.parse_args()
    if args.baseline:
        Path("/reports/baseline.json").write_text(json.dumps(pipeline_counts()))
        raise SystemExit(0)
    result = export(Path("/exports"))
    print(
        json.dumps(
            {
                "run_id": result["run_id"],
                "status": result["status"],
                "signals": len(result["signals"]),
                "orders": len(result["orders"]),
            }
        )
    )
