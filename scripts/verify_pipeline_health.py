#!/usr/bin/env python3
"""Pipeline health and telemetry verification script.

Probes the end-to-end Catalyst infrastructure:
- FastAPI (/health, /health/pipeline, /metrics)
- TimescaleDB (via API pool / direct ping)
- Redis (gk:* namespaces and cache connectivity)
- Java Strategy Engine (/actuator/health)

Usage:
    python scripts/verify_pipeline_health.py
    python scripts/verify_pipeline_health.py --json
    python scripts/verify_pipeline_health.py --api-url http://localhost:8000 --engine-url http://localhost:8081/actuator/health
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen

logger = logging.getLogger("verify_pipeline_health")


def fetch_url(url: str, timeout: float = 3.0) -> tuple[int | None, str]:
    """Fetch URL contents with a timeout."""
    req = Request(url, headers={"User-Agent": "CatalystHealthProbe/1.0"})
    try:
        with urlopen(req, timeout=timeout) as response:
            return response.status, response.read().decode("utf-8")
    except URLError as err:
        return None, str(err)
    except Exception as exc:
        return None, str(exc)


def check_api(base_url: str = "http://localhost:8000", timeout: float = 3.0) -> dict[str, Any]:
    """Probe FastAPI health and pipeline aggregate endpoints."""
    res: dict[str, Any] = {
        "status": "DOWN",
        "uptime_seconds": 0.0,
        "database": "unknown",
        "redis": "unknown",
        "engine_reported": "unknown",
        "pipeline_ready": False,
        "pool_size": 0,
    }

    # 1. Base /health
    status_code, body = fetch_url(f"{base_url}/health", timeout=timeout)
    if status_code == 200:
        try:
            data = json.loads(body)
            res["status"] = data.get("status", "ok").upper()
            res["uptime_seconds"] = data.get("uptime_seconds", 0.0)
            res["pool_size"] = data.get("pool", {}).get("size", 0)
        except Exception:
            res["status"] = "INVALID_JSON"

    # 2. Pipeline aggregate /health/pipeline
    status_code, body = fetch_url(f"{base_url}/health/pipeline", timeout=timeout)
    if status_code == 200:
        try:
            data = json.loads(body)
            res["database"] = data.get("database", "unknown")
            res["redis"] = data.get("redis", "unknown")
            res["engine_reported"] = data.get("engine", "unknown")
            res["pipeline_ready"] = bool(data.get("ready", False))
        except Exception:
            pass

    return res


def check_engine(
    actuator_url: str = "http://localhost:8081/actuator/health", timeout: float = 3.0
) -> dict[str, Any]:
    """Probe Java Spring Boot Actuator health endpoint."""
    res: dict[str, Any] = {"status": "DOWN", "details": None}
    status_code, body = fetch_url(actuator_url, timeout=timeout)
    if status_code == 200:
        try:
            data = json.loads(body)
            res["status"] = data.get("status", "UP")
            res["details"] = data
        except Exception:
            res["status"] = "UP"
    return res


def check_redis(
    host: str = "localhost", port: int = 6379, db: int = 0, timeout: float = 2.0
) -> dict[str, Any]:
    """Probe Redis directly for latency, key counts, and confluence state."""
    res: dict[str, Any] = {
        "status": "DOWN",
        "latency_ms": 0.0,
        "active_confluence_keys": 0,
        "error": None,
    }
    try:
        import redis

        t0 = time.perf_counter()
        r = redis.Redis(host=host, port=port, db=db, socket_timeout=timeout)
        if r.ping():
            latency = round((time.perf_counter() - t0) * 1000, 2)
            res["status"] = "UP"
            res["latency_ms"] = latency
            _cursor, keys = r.scan(cursor=0, match="gk:sources:*", count=100)
            res["active_confluence_keys"] = len(keys)
    except Exception as exc:
        res["error"] = str(exc)
    return res


def evaluate_overall_health(results: dict[str, Any], require_engine: bool = True) -> bool:
    """Evaluate whether the pipeline satisfies minimum operational criteria."""
    api_ok = results.get("api", {}).get("status") in ("OK", "UP")
    db_ok = results.get("api", {}).get("database") == "ok"
    redis_ok = (
        results.get("redis", {}).get("status") == "UP"
        or results.get("api", {}).get("redis") == "ok"
    )

    engine_ok = True
    if require_engine:
        engine_ok = results.get("engine", {}).get("status") == "UP" or results.get("api", {}).get(
            "engine_reported"
        ) in ("UP", "OK", "ok")

    return bool(api_ok and db_ok and redis_ok and engine_ok)


def format_report(results: dict[str, Any], overall_ok: bool) -> str:
    """Format human-readable CLI report."""
    api = results.get("api", {})
    redis_info = results.get("redis", {})
    engine = results.get("engine", {})

    status_badge = "ALL SYSTEMS OPERATIONAL" if overall_ok else "PIPELINE DEGRADED / UNHEALTHY"

    lines = [
        "============================================================",
        "        CATALYST PIPELINE HEALTH DIAGNOSTICS",
        "============================================================",
        f"Overall Status: {status_badge}",
        "",
        "Component Statuses:",
        f"  • FastAPI Service:      {api.get('status', 'DOWN')} (Uptime: {api.get('uptime_seconds', 0):.1f}s)",
        f"  • Database (asyncpg):   {api.get('database', 'DOWN').upper()} (Pool size: {api.get('pool_size', 0)})",
        f"  • Redis Confluence/GK:  {redis_info.get('status', 'DOWN')} ({redis_info.get('latency_ms', 0):.1f}ms latency, {redis_info.get('active_confluence_keys', 0)} active keys)",
        f"  • Java Strategy Engine: {engine.get('status', 'DOWN')} (Reported to API: {api.get('engine_reported', 'unknown')})",
        f"  • Pipeline Ready Flag:  {'YES' if api.get('pipeline_ready') else 'NO'}",
        "============================================================",
    ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Catalyst Pipeline Health & Diagnostics Probe")
    parser.add_argument(
        "--api-url",
        default="http://localhost:8000",
        help="FastAPI base URL (default: http://localhost:8000)",
    )
    parser.add_argument(
        "--engine-url",
        default="http://localhost:8081/actuator/health",
        help="Java Engine Actuator health URL",
    )
    parser.add_argument("--redis-host", default="localhost", help="Redis host (default: localhost)")
    parser.add_argument("--redis-port", type=int, default=6379, help="Redis port (default: 6379)")
    parser.add_argument(
        "--timeout", type=float, default=3.0, help="HTTP and socket timeout in seconds"
    )
    parser.add_argument(
        "--ignore-engine",
        action="store_true",
        help="Don't fail if Java engine is down (API-only mode)",
    )
    parser.add_argument("--json", action="store_true", help="Output machine-readable JSON")

    args = parser.parse_args()

    results: dict[str, Any] = {
        "timestamp_epoch": time.time(),
        "api": check_api(base_url=args.api_url, timeout=args.timeout),
        "engine": check_engine(actuator_url=args.engine_url, timeout=args.timeout),
        "redis": check_redis(host=args.redis_host, port=args.redis_port, timeout=args.timeout),
    }

    overall_ok = evaluate_overall_health(results, require_engine=not args.ignore_engine)
    results["overall_healthy"] = overall_ok

    if args.json:
        print(json.dumps(results, indent=2))
    else:
        print(format_report(results, overall_ok))

    return 0 if overall_ok else 1


if __name__ == "__main__":
    sys.exit(main())
