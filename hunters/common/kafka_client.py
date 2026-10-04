import json
import os
from collections import Counter
from contextvars import ContextVar
from typing import ClassVar

from kafka import KafkaProducer

from .config import KAFKA_BOOTSTRAP_SERVERS
from .logger import get_logger

logger = get_logger("kafka_client")
CURRENT_HUNTER = ContextVar("current_hunter", default="unknown")


class KafkaClient:
    _instance = None
    _producer = None
    sent_counts: ClassVar[Counter[tuple[str, str]]] = Counter()

    @classmethod
    def get_producer(cls):
        if cls._producer is None:
            try:
                cls._producer = KafkaProducer(
                    bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
                    value_serializer=lambda v: json.dumps(v).encode("utf-8"),
                )
                logger.info("Connected to Kafka at %s", KAFKA_BOOTSTRAP_SERVERS)
            except Exception as e:
                logger.error("Failed to connect to Kafka: %s", e)
                # For dev/testing without Kafka locally, we might want to return a mock or handle gracefully
                # For now, let's re-raise or return None to signal failure
                return None
        return cls._producer

    @classmethod
    def send_message(cls, topic, data):
        producer = cls.get_producer()
        if producer:
            try:
                producer.send(topic, data).get(timeout=30)
                producer.flush()
                cls.sent_counts[(CURRENT_HUNTER.get(), topic)] += 1
                logger.info("Sent message to topic '%s': %s", topic, data.get("ticker", "unknown"))
            except Exception as e:
                logger.error("Failed to send message to '%s': %s", topic, e)
                if os.getenv("HUNTER_STRICT_DELIVERY") == "true":
                    raise
        else:
            if os.getenv("HUNTER_STRICT_DELIVERY") == "true":
                raise RuntimeError("Kafka producer unavailable")
            logger.warning("Kafka producer not available. Skipping message: %s", data)
