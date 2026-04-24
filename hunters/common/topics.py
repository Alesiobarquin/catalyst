import os

RAW_EVENTS_TOPIC = os.getenv("RAW_EVENTS_TOPIC", "raw-events")
KAFKA_TOPIC_SQUEEZE = os.getenv("KAFKA_TOPIC_SQUEEZE", "signal-squeeze")
KAFKA_TOPIC_INSIDER = os.getenv("KAFKA_TOPIC_INSIDER", "signal-insider")
KAFKA_TOPIC_WHALE = os.getenv("KAFKA_TOPIC_WHALE", "signal-whale")
KAFKA_TOPIC_BIOTECH = os.getenv("KAFKA_TOPIC_BIOTECH", "signal-biotech")
KAFKA_TOPIC_DRIFTER = os.getenv("KAFKA_TOPIC_DRIFTER", "signal-earnings")
