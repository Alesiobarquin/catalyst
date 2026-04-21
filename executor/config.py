import os

KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
TRADE_ORDERS_TOPIC = os.getenv("TRADE_ORDERS_TOPIC", "trade-orders")
EXECUTOR_CONSUMER_GROUP = os.getenv("EXECUTOR_CONSUMER_GROUP", "catalyst-alpaca-executor")
KAFKA_AUTO_OFFSET_RESET = os.getenv("KAFKA_AUTO_OFFSET_RESET", "latest")

TIMESCALE_HOST = os.getenv("TIMESCALE_HOST", "localhost")
TIMESCALE_PORT = int(os.getenv("TIMESCALE_PORT", "5432"))
TIMESCALE_USER = os.getenv("TIMESCALE_USER", "catalyst_user")
TIMESCALE_PASSWORD = os.getenv("TIMESCALE_PASSWORD", "password123")
TIMESCALE_DB = os.getenv("TIMESCALE_DB", "catalyst_db")

ALPACA_PAPER_BASE = os.getenv("ALPACA_PAPER_BASE", "https://paper-api.alpaca.markets")
