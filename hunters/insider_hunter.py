import asyncio
import httpx
import xml.etree.ElementTree as ET
from .common.logger import get_logger
from .common.kafka_client import KafkaClient
from .common.config import KAFKA_TOPIC_INSIDER, SEC_RSS_URL

logger = get_logger("insider_hunter")

async def run():
    logger.info("Insider Hunter starting...")
    # TODO: Implement insider trading scraping logic using SEC_RSS_URL
    # raw_data = await scrape_insider_data()
    # KafkaClient.send_message(KAFKA_TOPIC_INSIDER, {"source": "insider", "data": ...})
    logger.info("Insider Hunter finished.")
