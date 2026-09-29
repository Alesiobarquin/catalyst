"""Entrypoint for the Trade Resolution Daemon."""

import logging
import signal
import sys

from resolver.trade_resolver import TradeResolver

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s [resolver] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("resolver")


def main() -> None:
    resolver = TradeResolver()

    def handle_sigterm(signum, frame):
        logger.info("Received termination signal %s. Shutting down...", signum)
        resolver.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_sigterm)
    signal.signal(signal.SIGTERM, handle_sigterm)

    resolver.run()


if __name__ == "__main__":
    main()
