"""Trade Resolution Service.

Continuously monitors ACTIVE trade orders in TimescaleDB, compares
them against live market prices, and transitions order status to:
  - HIT_TARGET: Price reached or exceeded target price.
  - HIT_STOP:   Price fell to or below stop loss.
  - EXPIRED:    Holding duration exceeded MAX_HOLDING_DAYS.

Emits trade resolution events to the `trade-resolutions` Kafka topic
for downstream analytics and notification dispatches.
"""

from __future__ import annotations

import contextlib
import json
import logging
import time
from datetime import datetime, timezone
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

logger = logging.getLogger("trade_resolver")


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
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
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

    def fetch_current_prices(self, tickers: list[str]) -> dict[str, float]:
        """Fetch current prices for unique tickers using yfinance with defensive fallbacks."""
        if not tickers:
            return {}

        prices: dict[str, float] = {}
        unique_tickers = sorted({t.strip().upper() for t in tickers if t and t.strip()})

        for ticker in unique_tickers:
            try:
                import yfinance as yf

                t = yf.Ticker(ticker)
                # fast_info provides fast, cached lookups
                last_price = getattr(t.fast_info, "last_price", None)
                if last_price is not None and float(last_price) > 0:
                    prices[ticker] = round(float(last_price), 4)
                    continue

                # Fallback to history
                hist = t.history(period="1d")
                if not hist.empty and "Close" in hist:
                    close = hist["Close"].iloc[-1]
                    if close and float(close) > 0:
                        prices[ticker] = round(float(close), 4)
            except Exception as exc:
                logger.debug("Failed to fetch price for %s: %s", ticker, exc)

        return prices

    def evaluate_order(
        self,
        order: dict[str, Any],
        current_price: float | None,
        now: datetime | None = None,
    ) -> dict[str, Any] | None:
        """
        Evaluate if an active order has resolved.
        Returns resolution dictionary or None if still active.
        """
        if current_price is None or current_price <= 0:
            return None

        if now is None:
            now = datetime.now(timezone.utc)

        limit_price = float(order.get("limit_price") or 0.0)
        target_price = float(order.get("target_price") or 0.0)
        stop_loss = float(order.get("stop_loss") or 0.0)
        action = str(order.get("action") or "BUY").upper()

        if limit_price <= 0:
            return None

        status: str | None = None

        if action == "BUY":
            if target_price > 0 and current_price >= target_price:
                status = "HIT_TARGET"
            elif stop_loss > 0 and current_price <= stop_loss:
                status = "HIT_STOP"
        elif action == "SELL":
            # For short/sell positions
            if target_price > 0 and current_price <= target_price:
                status = "HIT_TARGET"
            elif stop_loss > 0 and current_price >= stop_loss:
                status = "HIT_STOP"

        order_ts = order.get("timestamp_utc")
        if status is None and order_ts is not None:
            if isinstance(order_ts, str):
                order_dt = datetime.fromisoformat(order_ts.replace("Z", "+00:00"))
            else:
                order_dt = order_ts

            if order_dt.tzinfo is None:
                order_dt = order_dt.replace(tzinfo=timezone.utc)

            holding_days = (now - order_dt).total_seconds() / 86400.0
            if holding_days >= self.max_holding_days:
                status = "EXPIRED"

        if status is None:
            return None

        # Calculate realized PnL percentage and dollar amount
        recommended_size = float(order.get("recommended_size_usd") or 0.0)
        if action == "SELL":
            pnl_pct = ((limit_price - current_price) / limit_price) * 100.0
        else:
            pnl_pct = ((current_price - limit_price) / limit_price) * 100.0

        realized_pnl_usd = (
            round(recommended_size * (pnl_pct / 100.0), 2) if recommended_size > 0 else 0.0
        )

        return {
            "id": order["id"],
            "timestamp_utc": order["timestamp_utc"],
            "ticker": order["ticker"],
            "action": action,
            "status": status,
            "limit_price": limit_price,
            "resolved_price": round(current_price, 4),
            "pnl_percent": round(pnl_pct, 4),
            "realized_pnl_usd": realized_pnl_usd,
            "resolved_at": now.isoformat(),
        }

    def process_cycle(self, conn: Connection) -> list[dict[str, Any]]:
        """Run a single resolution sweep across all active orders."""
        active_orders = self.fetch_active_orders(conn)
        if not active_orders:
            logger.debug("No active orders found to resolve.")
            return []

        tickers = [o["ticker"] for o in active_orders]
        prices = self.fetch_current_prices(tickers)
        if not prices:
            logger.debug("No market prices returned for active tickers.")
            return []

        resolved_records: list[dict[str, Any]] = []
        now = datetime.now(timezone.utc)

        for order in active_orders:
            ticker = order["ticker"]
            current_price = prices.get(ticker)
            resolution = self.evaluate_order(order, current_price, now)
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
