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
import math
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


def _entry_time(value: datetime | str) -> datetime:
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if not isinstance(value, datetime):
        raise ValueError("Invalid entry timestamp")
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


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
        self._last_order: tuple[datetime, int] | None = None
        self._sweep_until: datetime | None = None

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
        """Read the next bounded batch, wrapping so unresolved orders are revisited."""
        with conn.cursor() as cur:
            for _ in range(2):
                if self._last_order is None:
                    self._sweep_until = datetime.now(timezone.utc)
                after = "AND (timestamp_utc, id) > (%s, %s)" if self._last_order else ""
                params = (
                    (self._sweep_until, *self._last_order, self.batch_size)
                    if self._last_order
                    else (self._sweep_until, self.batch_size)
                )
                cur.execute(
                    f"""
                SELECT id, ticker, timestamp_utc, action, strategy_used,
                       recommended_size_usd, limit_price, stop_loss, target_price,
                       conviction_score, catalyst_type, status
                FROM trade_orders
                WHERE status = 'ACTIVE'
                AND timestamp_utc <= %s
                {after}
                ORDER BY timestamp_utc ASC, id ASC
                LIMIT %s
                """,
                    params,
                )
                orders = list(cur.fetchall())
                if orders or self._last_order is None:
                    return orders
                self._last_order = None
        return []

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
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)
        try:
            limit_price = float(order["limit_price"])
            stop = float(order["stop_loss"])
            target = float(order["target_price"])
            recommended_size = float(order["recommended_size_usd"])
            entered_at = _entry_time(order["timestamp_utc"])
        except (KeyError, TypeError, ValueError, OverflowError):
            return None
        if not all(math.isfinite(value) for value in (limit_price, stop, target, recommended_size)):
            return None
        if limit_price <= 0 or recommended_size <= 0 or stop < 0 or target < 0:
            return None
        action = str(order.get("action") or "").upper()

        outcome = resolve_from_bars(
            action,
            stop,
            target,
            bars,
            entered_at,
            now,
            self.max_holding_days,
        )
        if outcome is None:
            return None

        pnl_pct = pnl_percent(action, limit_price, outcome.price)
        pnl_usd = recommended_size * (pnl_pct / 100.0)
        if not math.isfinite(pnl_pct) or not math.isfinite(pnl_usd):
            return None
        return {
            "id": order["id"],
            "timestamp_utc": order["timestamp_utc"],
            "ticker": order["ticker"],
            "action": action,
            "status": outcome.status,
            "limit_price": limit_price,
            "resolved_price": round(outcome.price, 4),
            "pnl_percent": round(pnl_pct, 4),
            "realized_pnl_usd": round(pnl_usd, 2),
            "resolved_session": outcome.session.isoformat(),
            "resolved_at": now.isoformat(),
        }

    def process_cycle(self, conn: Connection) -> list[dict[str, Any]]:
        """Resolve one bounded batch; subsequent cycles continue and wrap."""
        active_orders = self.fetch_active_orders(conn)
        if not active_orders:
            logger.debug("No active orders found to resolve.")
            return []

        now = datetime.now(timezone.utc)
        first_entry: dict[str, date] = {}
        valid_orders = []
        for order in active_orders:
            try:
                ticker = order["ticker"].strip().upper()
                day = _entry_time(order["timestamp_utc"]).astimezone(MARKET_TZ).date()
                if not ticker:
                    raise ValueError("Empty ticker")
            except (KeyError, AttributeError, TypeError, ValueError):
                logger.warning("Skipping malformed order %s", order.get("id"))
                continue
            first_entry[ticker] = min(day, first_entry.get(ticker, day))
            valid_orders.append(order)
        bars = {ticker: self.fetch_daily_bars(ticker, day) for ticker, day in first_entry.items()}

        resolved_records: list[dict[str, Any]] = []
        for order in valid_orders:
            resolution = self.evaluate_order(order, bars[order["ticker"].strip().upper()], now)
            if resolution is not None:
                resolved_records.append(resolution)

        if not resolved_records:
            self._last_order = (active_orders[-1]["timestamp_utc"], active_orders[-1]["id"])
            return []

        # Batch update database
        committed_records = []
        try:
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
                    WHERE id = %s AND timestamp_utc = %s AND status = 'ACTIVE'
                    RETURNING id
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
                    if cur.fetchone() is not None:
                        committed_records.append(r)
            conn.commit()
        except Exception:
            conn.rollback()
            raise

        self._last_order = (active_orders[-1]["timestamp_utc"], active_orders[-1]["id"])
        logger.info("Resolved %d trade orders in this cycle.", len(committed_records))
        if not committed_records:
            return []

        # Emit events to Kafka
        producer = self.get_kafka_producer()
        if producer is not None:
            for r in committed_records:
                try:
                    producer.send(TRADE_RESOLUTIONS_TOPIC, r)
                except Exception as exc:
                    logger.warning("Failed to emit resolution event for %s: %s", r["ticker"], exc)
            with contextlib.suppress(Exception):
                producer.flush(timeout=3)

        return committed_records

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
