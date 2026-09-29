"""
TimescaleDB persistence consumer.
Consumes validated-signals from Kafka and writes to a TimescaleDB hypertable.
"""

import json
import logging
import time
from datetime import datetime, timezone

from psycopg import Connection, DatabaseError, OperationalError, connect

from kafka import KafkaConsumer
from persistence.config import (
    KAFKA_AUTO_OFFSET_RESET,
    KAFKA_BOOTSTRAP_SERVERS,
    KAFKA_CONSUMER_GROUP,
    TIMESCALE_DB,
    TIMESCALE_HOST,
    TIMESCALE_PASSWORD,
    TIMESCALE_PORT,
    TIMESCALE_USER,
    VALIDATED_SIGNALS_TOPIC,
)

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s [persistence] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("persistence")


def parse_ts(ts_str: str | None) -> datetime | None:
    if not ts_str:
        return None
    try:
        s = str(ts_str).replace("Z", "+00:00")
        return datetime.fromisoformat(s)
    except (ValueError, TypeError):
        return None


def get_db_conn() -> Connection:
    return connect(
        host=TIMESCALE_HOST,
        port=TIMESCALE_PORT,
        user=TIMESCALE_USER,
        password=TIMESCALE_PASSWORD,
        dbname=TIMESCALE_DB,
    )


def init_schema(conn: Connection) -> None:
    """Create validated_signals table and hypertable if not exists."""
    cur = conn.cursor()
    try:
        cur.execute("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE")
        conn.commit()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS validated_signals (
                time TIMESTAMPTZ NOT NULL,
                ticker TEXT NOT NULL,
                conviction_score INT NOT NULL,
                catalyst_type TEXT NOT NULL,
                is_trap BOOLEAN NOT NULL DEFAULT FALSE,
                trap_reason TEXT,
                rationale TEXT,
                confluence_count INT NOT NULL DEFAULT 0,
                confluence_sources JSONB,
                liquidity_metrics JSONB,
                signals JSONB,
                news_sentiment TEXT,
                risk_level TEXT,
                suggested_timeframe TEXT,
                key_risks JSONB,
                raw_signals_summary TEXT,
                suggested_entry_zone TEXT,
                suggested_stop TEXT
            )
        """)
        conn.commit()
        cur.execute("""
            SELECT create_hypertable('validated_signals', 'time', if_not_exists => TRUE)
        """)
        conn.commit()
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_validated_signals_ticker
            ON validated_signals (ticker, time DESC)
        """)
        conn.commit()
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_validated_signals_catalyst
            ON validated_signals (catalyst_type, time DESC)
        """)
        conn.commit()
    finally:
        cur.close()
    logger.info("Schema initialized")


INSERT_SQL = """
INSERT INTO validated_signals (
    time, ticker, conviction_score, catalyst_type, is_trap, trap_reason, rationale,
    confluence_count, confluence_sources, liquidity_metrics, signals,
    news_sentiment, risk_level, suggested_timeframe, key_risks,
    raw_signals_summary, suggested_entry_zone, suggested_stop
) VALUES (
    %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb,
    %s, %s, %s, %s::jsonb, %s, %s, %s
)
"""


def persist_signal(conn: Connection, payload: dict) -> bool:
    ticker = (payload.get("ticker") or "").strip().upper()
    if not ticker:
        logger.warning("Skipping signal without ticker: %s", payload)
        return False

    ts = parse_ts(payload.get("timestamp_utc")) or datetime.now(timezone.utc)
    cur = conn.cursor()
    try:
        cur.execute(
            INSERT_SQL,
            (
                ts,
                ticker,
                int(payload.get("conviction_score", 0)),
                str(payload.get("catalyst_type", "UNKNOWN")),
                bool(payload.get("is_trap", False)),
                payload.get("trap_reason"),
                payload.get("rationale") or "",
                int(payload.get("confluence_count", 0)),
                json.dumps(payload.get("confluence_sources", [])),
                json.dumps(payload.get("liquidity_metrics", {})),
                json.dumps(payload.get("signals", [])),
                payload.get("news_sentiment"),
                payload.get("risk_level"),
                payload.get("suggested_timeframe"),
                json.dumps(payload.get("key_risks", [])),
                payload.get("raw_signals_summary"),
                payload.get("suggested_entry_zone"),
                payload.get("suggested_stop"),
            ),
        )
        conn.commit()
        return True
    finally:
        cur.close()



def run():
    logger.info("Connecting to TimescaleDB at %s:%s", TIMESCALE_HOST, TIMESCALE_PORT)
    conn = get_db_conn()
    init_schema(conn)

    logger.info(
        "Consuming %s and persisting to validated_signals",
        VALIDATED_SIGNALS_TOPIC,
    )
    consumer = KafkaConsumer(
        VALIDATED_SIGNALS_TOPIC,
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        auto_offset_reset=KAFKA_AUTO_OFFSET_RESET,
        enable_auto_commit=False,
        group_id=KAFKA_CONSUMER_GROUP,
        value_deserializer=lambda v: json.loads(v.decode("utf-8")),
    )

    for message in consumer:
        try:
            if conn.closed:
                logger.warning("Database connection is closed. Reconnecting...")
                conn = get_db_conn()
            if persist_signal(conn, message.value):
                consumer.commit()
                logger.info("Persisted %s", message.value.get("ticker", "?"))
            else:
                consumer.commit()
                logger.info("Skipped invalid signal payload (offset committed)")

        except (OperationalError, DatabaseError) as db_exc:
            logger.error("Database error while persisting signal: %s. Reconnecting...", db_exc)
            try:
                if not conn.closed:
                    conn.rollback()
            except Exception:
                pass
            time.sleep(1)
            try:
                conn = get_db_conn()
                logger.info("Reconnected to TimescaleDB.")
            except Exception as reconn_err:
                logger.error("Database reconnection failed: %s", reconn_err)
        except Exception as exc:
            logger.error("Failed to persist signal: %s", exc)
            try:
                if not conn.closed:
                    conn.rollback()
            except Exception:
                pass
            # Do not commit - will retry on next poll


if __name__ == "__main__":
    run()
