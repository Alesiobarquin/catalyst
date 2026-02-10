
import asyncio
import sys
import argparse
from hunters.common.logger import get_logger

# Import hunter modules
from hunters import squeeze_hunter
from hunters import insider_hunter
from hunters import whale_hunter
from hunters import biotech_hunter
from hunters import drifter_hunter
from hunters import shadow_hunter

logger = get_logger("main_cli")

HUNTERS = {
    "squeeze": squeeze_hunter,
    "insider": insider_hunter,
    "whale": whale_hunter,
    "biotech": biotech_hunter,
    "drifter": drifter_hunter,
    "shadow": shadow_hunter,
}

async def run_hunter(name):
    if name not in HUNTERS:
        logger.error(f"Unknown hunter: {name}")
        return
    
    try:
        logger.info(f"Starting hunter: {name}")
        await HUNTERS[name].run()
        logger.info(f"Finished hunter: {name}")
    except Exception as e:
        logger.error(f"Error running hunter {name}: {e}")

async def main():
    parser = argparse.ArgumentParser(description="Catalyst Hunters CLI")
    parser.add_argument("hunter", nargs="?", help="Name of the hunter to run (or 'all')", default="all")
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
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
