"""Configuration for Catalyst Notification Service."""

import os

DISCORD_WEBHOOK_URL: str = os.getenv("DISCORD_WEBHOOK_URL", "")
SLACK_WEBHOOK_URL: str = os.getenv("SLACK_WEBHOOK_URL", "")
TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID: str = os.getenv("TELEGRAM_CHAT_ID", "")

MIN_CONVICTION_THRESHOLD: int = int(os.getenv("NOTIFIER_MIN_CONVICTION", "70"))
KAFKA_BOOTSTRAP_SERVERS: str = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
VALIDATED_SIGNALS_TOPIC: str = os.getenv("VALIDATED_SIGNALS_TOPIC", "validated-signals")
KAFKA_CONSUMER_GROUP: str = os.getenv("NOTIFIER_CONSUMER_GROUP", "catalyst-notifier")
KAFKA_AUTO_OFFSET_RESET: str = os.getenv("KAFKA_AUTO_OFFSET_RESET", "latest")

DASHBOARD_URL: str = os.getenv("CATALYST_DASHBOARD_URL", "http://localhost:3000")
