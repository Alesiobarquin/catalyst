import os

KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
TRADE_RESOLUTIONS_TOPIC = os.getenv("TRADE_RESOLUTIONS_TOPIC", "trade-resolutions")

TIMESCALE_HOST = os.getenv("TIMESCALE_HOST", "localhost")
TIMESCALE_PORT = int(os.getenv("TIMESCALE_PORT", "5432"))
TIMESCALE_USER = os.getenv("TIMESCALE_USER", "catalyst_user")
TIMESCALE_PASSWORD = os.getenv("TIMESCALE_PASSWORD", "password123")
TIMESCALE_DB = os.getenv("TIMESCALE_DB", "catalyst_db")

RESOLVER_POLL_INTERVAL_SECONDS = int(os.getenv("RESOLVER_POLL_INTERVAL_SECONDS", "300"))
MAX_HOLDING_DAYS = int(os.getenv("MAX_HOLDING_DAYS", "14"))
MAX_BATCH_SIZE = int(os.getenv("MAX_BATCH_SIZE", "200"))
