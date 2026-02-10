
import json
from kafka import KafkaProducer
from .config import KAFKA_BOOTSTRAP_SERVERS
from .logger import get_logger

logger = get_logger("kafka_client")

class KafkaClient:
    _instance = None
    _producer = None

    @classmethod
    def get_producer(cls):
        if cls._producer is None:
            try:
                cls._producer = KafkaProducer(
                    bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
                    value_serializer=lambda v: json.dumps(v).encode('utf-8')
                )
                logger.info(f"Connected to Kafka at {KAFKA_BOOTSTRAP_SERVERS}")
            except Exception as e:
                logger.error(f"Failed to connect to Kafka: {e}")
                # For dev/testing without Kafka locally, we might want to return a mock or handle gracefully
                # For now, let's re-raise or return None to signal failure
                return None
        return cls._producer

    @classmethod
    def send_message(cls, topic, data):
        producer = cls.get_producer()
        if producer:
            try:
                producer.send(topic, data)
                producer.flush()
                logger.info(f"Sent message to topic '{topic}': {data.get('ticker', 'unknown')}")
            except Exception as e:
                logger.error(f"Failed to send message to '{topic}': {e}")
        else:
            logger.warning(f"Kafka producer not available. Skipping message: {data}")

