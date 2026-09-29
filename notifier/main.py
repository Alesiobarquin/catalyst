"""Catalyst Notifier Service — Kafka background consumer."""

import json
import logging
import signal
import sys
import time

from kafka.errors import KafkaError

from kafka import KafkaConsumer
from notifier.config import (
    KAFKA_AUTO_OFFSET_RESET,
    KAFKA_BOOTSTRAP_SERVERS,
    KAFKA_CONSUMER_GROUP,
    VALIDATED_SIGNALS_TOPIC,
)
from notifier.dispatcher import SignalNotificationDispatcher

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s [notifier] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("notifier")


class NotifierService:
    def __init__(self, dispatcher: SignalNotificationDispatcher | None = None):
        self.dispatcher = dispatcher or SignalNotificationDispatcher()
        self.running = True

        kafka_backoff = 1
        last_error = None
        for attempt in range(1, 4):
            try:
                self.consumer = KafkaConsumer(
                    VALIDATED_SIGNALS_TOPIC,
                    bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
                    auto_offset_reset=KAFKA_AUTO_OFFSET_RESET,
                    enable_auto_commit=False,
                    group_id=KAFKA_CONSUMER_GROUP,
                    value_deserializer=lambda v: json.loads(v.decode("utf-8")),
                )
                break
            except (KafkaError, ValueError, OSError) as exc:
                last_error = exc
                logger.warning(
                    "Kafka connection attempt %d/3 failed: %s. Retrying in %ds",
                    attempt,
                    exc,
                    kafka_backoff,
                )
                time.sleep(kafka_backoff)
                kafka_backoff *= 2

        if last_error is not None and not hasattr(self, "consumer"):
            raise RuntimeError("Failed to initialize Kafka consumer for notifier") from last_error

    def process_message(self, message_value: dict) -> None:
        """Process a single validated-signals event."""
        try:
            self.dispatcher.dispatch(message_value)
        except Exception as exc:
            logger.error("Error dispatching notification: %s", exc, exc_info=True)

    def run(self) -> None:
        """Main consumer loop."""
        logger.info(
            "Notifier listening on %s (min_conviction=%d)",
            VALIDATED_SIGNALS_TOPIC,
            self.dispatcher.min_conviction,
        )

        for message in self.consumer:
            if not self.running:
                break
            try:
                self.process_message(message.value)
            except Exception as exc:
                logger.error("Unexpected error in consumer loop: %s", exc, exc_info=True)
            finally:
                if (
                    hasattr(self, "consumer")
                    and hasattr(self.consumer, "commit")
                    and callable(self.consumer.commit)
                ):
                    try:
                        self.consumer.commit()
                    except (KafkaError, OSError) as exc:
                        logger.warning("Kafka commit failed in notifier: %s", exc)

    def stop(self) -> None:
        self.running = False
        if hasattr(self, "consumer"):
            try:
                self.consumer.close()
            except Exception as e:
                logger.debug("Error closing notifier consumer: %s", e)


def main():
    service = NotifierService()

    def handle_signal(sig, frame):
        logger.info("Received shutdown signal %s. Stopping...", sig)
        service.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    service.run()


if __name__ == "__main__":
    main()
