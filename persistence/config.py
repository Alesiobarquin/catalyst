import os

KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
VALIDATED_SIGNALS_TOPIC = os.getenv("VALIDATED_SIGNALS_TOPIC", "validated-signals")
KAFKA_CONSUMER_GROUP = os.getenv("PERSISTENCE_CONSUMER_GROUP", "persistence-service")
KAFKA_AUTO_OFFSET_RESET = os.getenv("PERSISTENCE_AUTO_OFFSET_RESET", "earliest")

TIMESCALE_HOST = os.getenv("TIMESCALE_HOST", "localhost")
TIMESCALE_PORT = int(os.getenv("TIMESCALE_PORT", "5432"))
TIMESCALE_USER = os.getenv("TIMESCALE_USER", "catalyst_user")
TIMESCALE_PASSWORD = os.getenv("TIMESCALE_PASSWORD", "password123")
TIMESCALE_DB = os.getenv("TIMESCALE_DB", "catalyst_db")
