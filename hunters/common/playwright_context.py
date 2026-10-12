from playwright.async_api import async_playwright

from .config import HEADLESS_MODE
from .logger import get_logger
from .provider_errors import ProviderError

logger = get_logger("playwright_context")


class BrowserContext:
    def __init__(self, *, storage_state: dict | None = None):
        self.playwright = None
        self.browser = None
        self.context = None
        self.storage_state = storage_state

    async def __aenter__(self):
        try:
            self.playwright = await async_playwright().start()
            self.browser = await self.playwright.chromium.launch(
                headless=HEADLESS_MODE,
                args=["--disable-gpu", "--disable-dev-shm-usage", "--no-sandbox"],
            )
            self.context = await self.browser.new_context(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                storage_state=self.storage_state,
            )
        except BaseException as exc:
            await self.__aexit__(None, None, None)
            if (
                self.storage_state is not None
                and self.browser is not None
                and isinstance(exc, Exception)
            ):
                raise ProviderError("biopharm", "invalid_session") from None
            raise
        logger.info("Browser context initialized")
        return self.context

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.context:
            await self.context.close()
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()
        logger.info("Browser context closed")
