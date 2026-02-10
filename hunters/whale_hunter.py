
from .common.logger import get_logger
from .common.kafka_client import KafkaClient

logger = get_logger("whale_hunter")

async def run():
    logger.info("Whale Hunter starting...")
    # TODO: Implement whale watching logic
    logger.info("Whale Hunter finished.")
