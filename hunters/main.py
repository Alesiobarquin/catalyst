import argparse
import asyncio
import contextlib

from hunters import biotech_hunter, drifter_hunter, insider_hunter, squeeze_hunter, whale_hunter
from hunters.common.logger import get_logger

logger = get_logger("main_cli")

HUNTERS = {
    "squeeze": squeeze_hunter,
    "insider": insider_hunter,
    "whale": whale_hunter,
    "biotech": biotech_hunter,
    "drifter": drifter_hunter,
}


async def run_hunter(name):
    if name not in HUNTERS:
        logger.error("Unknown hunter: %s", name)
        return

    try:
        logger.info("Starting hunter: %s", name)
        await HUNTERS[name].run()
        logger.info("Finished hunter: %s", name)
    except Exception as e:
        logger.error("Error running hunter %s: %s", name, e)


async def main():
    parser = argparse.ArgumentParser(description="Catalyst Hunters CLI")
    parser.add_argument(
        "hunter", nargs="?", help="Name of the hunter to run (or 'all')", default="all"
    )
    parser.add_argument("--list", action="store_true", help="List available hunters")

    args = parser.parse_args()

    if args.list:
        print("Available hunters:")
        for name in HUNTERS:
            print(f" - {name}")
        return

    if args.hunter == "all":
        logger.info("Running ALL hunters...")
        await asyncio.gather(*(run_hunter(name) for name in HUNTERS))
    else:
        await run_hunter(args.hunter)


if __name__ == "__main__":
    # Add project root to sys.path to ensure absolute imports work
    # This assumes we are running from the parent of 'hunters' directory or similar structure
    # But for now, let's rely on standard python path behaviors or running as a module.
    with contextlib.suppress(KeyboardInterrupt):
        asyncio.run(main())
