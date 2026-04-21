"""
Consume trade-orders from Kafka and place Alpaca paper trades for each user in user_alpaca_keys.
Matches persisted rows in trade_orders by ticker + timestamp_utc (with short retry for DB commit lag).
"""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone
from typing import Any

import httpx
from kafka import KafkaConsumer
from psycopg import Connection, connect

try:
    from executor.config import (
        ALPACA_PAPER_BASE,
        EXECUTOR_CONSUMER_GROUP,
        KAFKA_AUTO_OFFSET_RESET,
        KAFKA_BOOTSTRAP_SERVERS,
        TIMESCALE_DB,
        TIMESCALE_HOST,
        TIMESCALE_PASSWORD,
        TIMESCALE_PORT,
        TIMESCALE_USER,
        TRADE_ORDERS_TOPIC,
    )
except ImportError:
    from config import (
        ALPACA_PAPER_BASE,
        EXECUTOR_CONSUMER_GROUP,
        KAFKA_AUTO_OFFSET_RESET,
        KAFKA_BOOTSTRAP_SERVERS,
        TIMESCALE_DB,
        TIMESCALE_HOST,
        TIMESCALE_PASSWORD,
        TIMESCALE_PORT,
        TIMESCALE_USER,
        TRADE_ORDERS_TOPIC,
    )

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s [executor] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("executor")


def get_db() -> Connection:
    return connect(
        host=TIMESCALE_HOST,
        port=TIMESCALE_PORT,
        user=TIMESCALE_USER,
        password=TIMESCALE_PASSWORD,
        dbname=TIMESCALE_DB,
    )


def parse_ts(ts_str: str | None) -> datetime | None:
    if not ts_str:
        return None
    try:
        s = str(ts_str).replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None


def resolve_trade_order_row(conn: Connection, ticker: str, ts: datetime) -> tuple[int, datetime] | None:
    for _ in range(15):
        cur = conn.execute(
            """
            SELECT id, timestamp_utc FROM trade_orders
            WHERE ticker = %s AND timestamp_utc = %s
            ORDER BY id DESC LIMIT 1
            """,
            (ticker.upper(), ts),
        )
        row = cur.fetchone()
        if row:
            return (row[0], row[1])
        time.sleep(0.2)
    return None


def fetch_users(conn: Connection) -> list[tuple[str, str, str]]:
    cur = conn.execute(
        "SELECT clerk_user_id, api_key, secret_key FROM user_alpaca_keys"
    )
    rows = cur.fetchall()
    return [(r[0], r[1], r[2]) for r in rows]


def place_alpaca_order(
    api_key: str, secret_key: str, payload: dict[str, Any]
) -> tuple[bool, str | None, str | None, float | None, str | None]:
    """Returns (ok, order_id, status, filled_avg_price, error_message)."""
    ticker = payload.get("ticker") or ""
    action = (payload.get("action") or "BUY").upper()
    limit_price = float(payload.get("limit_price") or 0)
    size_usd = float(payload.get("recommended_size_usd") or 0)
    if not ticker or limit_price <= 0 or size_usd <= 0:
        return False, None, "skipped_invalid_payload", None, "invalid payload"

    qty = max(0.0001, round(size_usd / limit_price, 4))
    side = "buy" if action == "BUY" else "sell"
    body = {
        "symbol": ticker.upper(),
        "qty": str(qty),
        "side": side,
        "type": "limit",
        "limit_price": str(round(limit_price, 4)),
        "time_in_force": "day",
    }
    headers = {
        "APCA-API-KEY-ID": api_key,
        "APCA-API-SECRET-KEY": secret_key,
        "Content-Type": "application/json",
    }
    url = f"{ALPACA_PAPER_BASE.rstrip('/')}/v2/orders"
    try:
        with httpx.Client(timeout=30.0) as client:
            r = client.post(url, headers=headers, json=body)
            data = r.json() if r.content else {}
            if r.status_code not in (200, 201):
                err = data.get("message") or r.text or str(r.status_code)
                logger.warning("Alpaca error %s: %s", r.status_code, err)
                return False, None, "rejected", None, str(err)
            oid = data.get("id")
            st = data.get("status") or "pending"
            filled = data.get("filled_avg_price")
            fp = float(filled) if filled is not None else None
            return True, str(oid) if oid else None, st, fp, None
    except Exception as e:
        logger.exception("Alpaca request failed: %s", e)
        return False, None, "error", None, str(e)


def process_message(conn: Connection, value: dict[str, Any]) -> None:
    ticker = (value.get("ticker") or "").strip().upper()
    ts = parse_ts(value.get("timestamp_utc"))
    if not ticker or not ts:
        logger.warning("Skipping message without ticker/timestamp: %s", value)
        return

    users = fetch_users(conn)
    if not users:
        logger.debug("No user_alpaca_keys rows — skipping execution for %s", ticker)
        return

    resolved = resolve_trade_order_row(conn, ticker, ts)
    if not resolved:
        logger.warning("Could not resolve trade_orders row for %s @ %s", ticker, ts)
        return
    trade_order_id, ts_utc = resolved

    for clerk_user_id, api_key, secret_key in users:
        cur = conn.execute(
            """
            INSERT INTO trade_order_executions (
                trade_order_id, timestamp_utc, clerk_user_id,
                execution_status, updated_at
            )
            VALUES (%s, %s, %s, 'pending', NOW())
            ON CONFLICT (trade_order_id, timestamp_utc, clerk_user_id) DO NOTHING
            RETURNING id
            """,
            (trade_order_id, ts_utc, clerk_user_id),
        )
        if cur.fetchone() is None:
            logger.info(
                "Duplicate execution skipped for user %s order %s",
                clerk_user_id,
                trade_order_id,
            )
            continue

        ok, oid, st, fill, err_msg = place_alpaca_order(api_key, secret_key, value)
        if ok and st in ("filled", "partially_filled"):
            status = "filled"
        elif ok:
            status = "pending"
        else:
            status = "rejected"
        conn.execute(
            """
            UPDATE trade_order_executions SET
                alpaca_order_id = COALESCE(%s, alpaca_order_id),
                execution_status = %s,
                filled_avg_price = COALESCE(%s::numeric, filled_avg_price),
                error_message = %s,
                updated_at = NOW()
            WHERE trade_order_id = %s AND timestamp_utc = %s AND clerk_user_id = %s
            """,
            (oid, status, fill, err_msg, trade_order_id, ts_utc, clerk_user_id),
        )
        logger.info(
            "Execution user=%s ticker=%s trade_order_id=%s alpaca=%s status=%s",
            clerk_user_id,
            ticker,
            trade_order_id,
            oid,
            status,
        )


def main() -> None:
    logger.info(
        "Starting Alpaca executor: topic=%s group=%s",
        TRADE_ORDERS_TOPIC,
        EXECUTOR_CONSUMER_GROUP,
    )
    consumer = KafkaConsumer(
        TRADE_ORDERS_TOPIC,
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        group_id=EXECUTOR_CONSUMER_GROUP,
        auto_offset_reset=KAFKA_AUTO_OFFSET_RESET,
        enable_auto_commit=True,
        value_deserializer=lambda b: json.loads(b.decode("utf-8")),
    )

    with get_db() as conn:
        for msg in consumer:
            if not msg.value:
                continue
            try:
                process_message(conn, msg.value)
                conn.commit()
            except Exception as e:
                logger.exception("Message error: %s", e)
                conn.rollback()


if __name__ == "__main__":
    main()
