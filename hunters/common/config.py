
import os

# Kafka Configuration
KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
KAFKA_TOPIC_SQUEEZE = os.getenv("KAFKA_TOPIC_SQUEEZE", "signal-squeeze")

# Logging Configuration
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# Playwright Configuration
HEADLESS_MODE = os.getenv("HEADLESS_MODE", "True").lower() == "true"
