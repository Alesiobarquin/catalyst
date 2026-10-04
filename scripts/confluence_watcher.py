#!/usr/bin/env python3
"""Confluence Watcher: Monitor Redis for multi-hunter signal confluence in real time.

Scans Redis for keys matching 'gk:sources:*' and alerts whenever a ticker
accumulates signals from two or more distinct hunter sources (SCARD >= 2).
Useful for observing organic confluence during live market hours.

Usage:
    python scripts/confluence_watcher.py [--host localhost] [--port 6379] [--interval 2.0] [--once]
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from typing import Any

from redis import Redis

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s [confluence-watcher] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("confluence-watcher")


def inspect_confluence(
    r: Redis[Any],
    min_sources: int = 2,
    window_seconds: int = 300,
) -> list[dict[str, Any]]:
    """Scan Redis for gk:sources_zset:* or gk:sources:* keys meeting or exceeding the source threshold."""
    found_by_ticker: dict[str, dict[str, Any]] = {}

    # 1. Scan sorted sets (ZSET with millisecond sliding window)
    now_ts = time.time()
    cutoff_ts = now_ts - window_seconds
    cursor = 0
    while True:
        cursor, keys = r.scan(cursor=cursor, match="gk:sources_zset:*", count=100)
        for key in keys:
            key_str = key.decode("utf-8") if isinstance(key, bytes) else str(key)
            ticker = key_str.replace("gk:sources_zset:", "")
            try:
                r.zremrangebyscore(key, "-inf", cutoff_ts)
                zset_sources = r.zrange(key, 0, -1)
                decoded_sources = {
                    s.decode("utf-8") if isinstance(s, bytes) else str(s) for s in zset_sources
                }
                if len(decoded_sources) >= min_sources:
                    ttl = r.ttl(key)
                    found_by_ticker[ticker] = {
                        "ticker": ticker,
                        "sources": sorted(decoded_sources),
                        "count": len(decoded_sources),
                        "ttl_seconds": ttl,
                    }
            except Exception:
                pass
        if cursor == 0:
            break

    # 2. Scan standard sets (fallback / backward compatibility)
    cursor = 0
    pattern = "gk:sources:*"
    while True:
        cursor, keys = r.scan(cursor=cursor, match=pattern, count=100)
        for key in keys:
            key_str = key.decode("utf-8") if isinstance(key, bytes) else str(key)
            if "zset" in key_str:
                continue
            ticker = key_str.replace("gk:sources:", "")
            if ticker in found_by_ticker:
                continue
            try:
                sources = r.smembers(key)
                decoded_sources = {
                    s.decode("utf-8") if isinstance(s, bytes) else str(s) for s in sources
                }
                if len(decoded_sources) >= min_sources:
                    ttl = r.ttl(key)
                    found_by_ticker[ticker] = {
                        "ticker": ticker,
                        "sources": sorted(decoded_sources),
                        "count": len(decoded_sources),
                        "ttl_seconds": ttl,
                    }
            except Exception:
                pass
        if cursor == 0:
            break

    return sorted(found_by_ticker.values(), key=lambda x: str(x["ticker"]))


def run_watcher(
    host: str = "localhost",
    port: int = 6379,
    interval_sec: float = 2.0,
    min_sources: int = 2,
    run_once: bool = False,
) -> None:
    """Connect to Redis and continuously monitor for confluence."""
    logger.info("Connecting to Redis at %s:%s...", host, port)
    try:
        r: Redis[Any] = Redis(host=host, port=port, decode_responses=True)
        r.ping()
        logger.info("Connected to Redis successfully.")
    except Exception as exc:
        logger.error("Failed to connect to Redis at %s:%s: %s", host, port, exc)
        sys.exit(1)

    seen_confluences: set[tuple[str, tuple[str, ...]]] = set()

    logger.info(
        "Monitoring gk:sources:* for confluence >= %d (polling every %.1fs)...",
        min_sources,
        interval_sec,
    )

    try:
        while True:
            confluences = inspect_confluence(r, min_sources=min_sources)
            for item in confluences:
                key_tuple = (item["ticker"], tuple(item["sources"]))
                if key_tuple not in seen_confluences:
                    seen_confluences.add(key_tuple)
                    logger.info(
                        "CONFLUENCE DETECTED! Ticker: %s | Sources (%d): %s | TTL: %ss",
                        item["ticker"],
                        item["count"],
                        ", ".join(item["sources"]),
                        item["ttl_seconds"],
                    )

            if run_once:
                if not confluences:
                    logger.info("No active confluence keys found with SCARD >= %d.", min_sources)
                break

            time.sleep(interval_sec)
    except KeyboardInterrupt:
        logger.info("Confluence watcher stopped by user.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Monitor Redis for multi-hunter signal confluence."
    )
    parser.add_argument(
        "--host",
        default=os.getenv("REDIS_HOST", "localhost"),
        help="Redis host (default: localhost or REDIS_HOST env)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.getenv("REDIS_PORT", "6379")),
        help="Redis port (default: 6379 or REDIS_PORT env)",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=2.0,
        help="Polling interval in seconds (default: 2.0)",
    )
    parser.add_argument(
        "--threshold",
        type=int,
        default=2,
        help="Minimum distinct hunter sources (default: 2)",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run a single scan and exit",
    )
    args = parser.parse_args()

    run_watcher(
        host=args.host,
        port=args.port,
        interval_sec=args.interval,
        min_sources=args.threshold,
        run_once=args.once,
    )


if __name__ == "__main__":
    main()
