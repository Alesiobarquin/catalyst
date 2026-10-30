"""Trade Resolution Service.

Monitors ACTIVE trade orders in TimescaleDB, walks the daily bars since
entry (see resolver/outcome.py), and transitions order status to:
  - HIT_TARGET: A bar after entry reached the target price.
  - HIT_STOP:   A bar after entry reached the stop (checked first on each bar).
  - EXPIRED:    Neither within MAX_HOLDING_DAYS; resolved at the last close.

Emits trade resolution events to the `trade-resolutions` Kafka topic
for downstream analytics and notification dispatches.
"""

from __future__ import annotations

import contextlib
import json
import logging
import time
from datetime import date, datetime, timezone
from typing import Any

from psycopg import Connection, connect
from psycopg.rows import dict_row

from resolver.config import (
    KAFKA_BOOTSTRAP_SERVERS,
    MAX_BATCH_SIZE,
    MAX_HOLDING_DAYS,
    RESOLVER_POLL_INTERVAL_SECONDS,
    TIMESCALE_DB,
    TIMESCALE_HOST,
    TIMESCALE_PASSWORD,
    TIMESCALE_PORT,
    TIMESCALE_USER,
    TRADE_RESOLUTIONS_TOPIC,
)
from resolver.outcome import MARKET_TZ, pnl_percent, resolve_from_bars

logger = logging.getLogger("trade_resolver")


def serialize_resolution(value: dict[str, Any]) -> bytes:
    """Resolution records carry datetime and Decimal columns straight from the database."""
    return json.dumps(value, default=str).encode("utf-8")


def get_db_connection() -> Connection:
    """Establish a connection to TimescaleDB with dictionary row mapping."""
    return connect(
        host=TIMESCALE_HOST,
        port=TIMESCALE_PORT,
        user=TIMESCALE_USER,
        password=TIMESCALE_PASSWORD,
        dbname=TIMESCALE_DB,
        row_factory=dict_row,
    )


class TradeResolver:
    """Evaluates and resolves active trade recommendations."""

    def __init__(
        self,
        poll_interval: int = RESOLVER_POLL_INTERVAL_SECONDS,
        max_holding_days: int = MAX_HOLDING_DAYS,
        batch_size: int = MAX_BATCH_SIZE,
    ) -> None:
        self.poll_interval = poll_interval
        self.max_holding_days = max_holding_days
        self.batch_size = batch_size
        self._running = False
        self._producer = None

    def get_kafka_producer(self) -> Any | None:
        """Lazily initialize Kafka producer for emitting resolution events."""
        if self._producer is not None:
            return self._producer
        try:
            from kafka import KafkaProducer

            self._producer = KafkaProducer(
                bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
                value_serializer=serialize_resolution,
                request_timeout_ms=5000,
            )
            return self._producer
        except Exception as exc:
            logger.warning("Kafka producer unavailable for resolutions: %s", exc)
            return None

    def fetch_active_orders(self, conn: Connection) -> list[dict[str, Any]]:
        """Query open active orders ordered by creation time."""
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, ticker, timestamp_utc, action, strategy_used,
                       recommended_size_usd, limit_price, stop_loss, target_price,
                       conviction_score, catalyst_type, status
                FROM trade_orders
                WHERE status = 'ACTIVE'
                ORDER BY timestamp_utc ASC
                LIMIT %s
                """,
                (self.batch_size,),
            )
            return list(cur.fetchall())

    def fetch_daily_bars(self, ticker: str, start: date):
        """Unadjusted daily bars, so stops and targets compare with the prices quoted at entry."""
        try:
            import yfinance as yf

            bars = yf.Ticker(ticker).history(
                start=start.isoformat(), interval="1d", auto_adjust=False
            )
        except Exception as exc:
            logger.warning("Failed to fetch daily bars for %s: %s", ticker, exc)
            return None
        if bars is None or bars.empty:
            logger.warning("No daily bars returned for %s", ticker)
            return None
        return bars

    def evaluate_order(
        self,
        order: dict[str, Any],
        bars,
        now: datetime | None = None,
    ) -> dict[str, Any] | None:
        """
        Evaluate if an active order has resolved.
        Returns resolution dictionary or None if still active.
        """
        if bars is None:
            return None
        now = now or datetime.now(timezone.utc)
        limit_price = float(order.get("limit_price") or 0.0)
        if limit_price <= 0:
            return None
        action = str(order.get("action") or "BUY").upper()
        entered_at = order["timestamp_utc"]
        if isinstance(entered_at, str):
            entered_at = datetime.fromisoformat(entered_at.replace("Z", "+00:00"))

        outcome = resolve_from_bars(
            action,
            float(order.get("stop_loss") or 0.0),
            float(order.get("target_price") or 0.0),
            bars,
            entered_at,
            now,
            self.max_holding_days,
        )
        if outcome is None:
            return None

        pnl_pct = pnl_percent(action, limit_price, outcome.price)
        recommended_size = float(order.get("recommended_size_usd") or 0.0)
        return {
            "id": order["id"],
            "timestamp_utc": order["timestamp_utc"],
            "ticker": order["ticker"],
            "action": action,
            "status": outcome.status,
            "limit_price": limit_price,
            "resolved_price": round(outcome.price, 4),
            "pnl_percent": round(pnl_pct, 4),
            "realized_pnl_usd": round(recommended_size * pnl_pct / 100.0, 2),
            "resolved_session": outcome.session.isoformat(),
            "resolved_at": now.isoformat(),
        }

    def process_cycle(self, conn: Connection) -> list[dict[str, Any]]:
        """Run a single resolution sweep across all active orders."""
        active_orders = self.fetch_active_orders(conn)
        if not active_orders:
            logger.debug("No active orders found to resolve.")
            return []

        now = datetime.now(timezone.utc)
        first_entry: dict[str, date] = {}
        for order in active_orders:
            ticker = order["ticker"].strip().upper()
            entered = order["timestamp_utc"]
            if isinstance(entered, str):
                entered = datetime.fromisoformat(entered.replace("Z", "+00:00"))
            day = entered.astimezone(MARKET_TZ).date() if entered.tzinfo else entered.date()
            first_entry[ticker] = min(day, first_entry.get(ticker, day))
        bars = {ticker: self.fetch_daily_bars(ticker, day) for ticker, day in first_entry.items()}

        resolved_records: list[dict[str, Any]] = []
        for order in active_orders:
            resolution = self.evaluate_order(order, bars[order["ticker"].strip().upper()], now)
            if resolution is not None:
                resolved_records.append(resolution)

        if not resolved_records:
            return []

        # Batch update database
        with conn.cursor() as cur:
            for r in resolved_records:
                cur.execute(
                    """
                    UPDATE trade_orders
                    SET status = %s,
                        resolved_at = %s,
                        resolved_price = %s,
                        pnl_percent = %s,
                        realized_pnl_usd = %s
                    WHERE id = %s AND timestamp_utc = %s
                    """,
                    (
                        r["status"],
                        r["resolved_at"],
                        r["resolved_price"],
                        r["pnl_percent"],
                        r["realized_pnl_usd"],
                        r["id"],
                        r["timestamp_utc"],
                    ),
                )
            conn.commit()

        logger.info("Resolved %d trade orders in this cycle.", len(resolved_records))

        # Emit events to Kafka
        producer = self.get_kafka_producer()
        if producer is not None:
            for r in resolved_records:
                try:
                    producer.send(TRADE_RESOLUTIONS_TOPIC, r)
                except Exception as exc:
                    logger.warning("Failed to emit resolution event for %s: %s", r["ticker"], exc)
            with contextlib.suppress(Exception):
                producer.flush(timeout=3)

        return resolved_records

    def run(self) -> None:
        """Main service loop."""
        self._running = True
        logger.info("Starting Trade Resolution Daemon (poll interval: %ss)...", self.poll_interval)

        while self._running:
            try:
                with get_db_connection() as conn:
                    self.process_cycle(conn)
            except Exception as exc:
                logger.error("Error during trade resolution cycle: %s", exc, exc_info=True)

            time.sleep(self.poll_interval)

    def stop(self) -> None:
        """Signal daemon to gracefully shut down."""
        self._running = False
        if self._producer is not None:
            with contextlib.suppress(Exception):
                self._producer.close(timeout=2)
            self._producer = None
