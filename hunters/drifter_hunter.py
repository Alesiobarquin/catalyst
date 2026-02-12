import asyncio
import httpx
from .common.logger import get_logger
from .common.kafka_client import KafkaClient
from .common.config import KAFKA_TOPIC_DRIFTER, FMP_API_KEY

logger = get_logger("drifter_hunter")

async def run():
    logger.info("Drifter Hunter starting...")
    if not FMP_API_KEY:
        logger.warning("FMP_API_KEY not found. Earnings hunter may fail.")
        
    # TODO: Implement earnings logic using FMP API
    logger.info("Drifter Hunter finished.")
