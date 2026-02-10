
from .common.logger import get_logger
from .common.kafka_client import KafkaClient

logger = get_logger("insider_hunter")

async def run():
    logger.info("Insider Hunter starting...")
    # TODO: Implement insider trading scraping logic
    # raw_data = await scrape_insider_data()
    # KafkaClient.send_message("raw-events", {"source": "insider", "data": ...})
    logger.info("Insider Hunter finished.")
