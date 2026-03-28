from .common.logger import get_logger

logger = get_logger("whale_hunter")


async def run():
    logger.info("Whale Hunter starting...")
    # TODO: Implement whale watching logic using Playwright and BARCHART_URL
    # async with BrowserContext() as context:
    #     page = await context.new_page()
    #     await page.goto(BARCHART_URL)
    logger.info("Whale Hunter finished.")
