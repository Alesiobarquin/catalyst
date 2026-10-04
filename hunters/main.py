import argparse
import asyncio
import contextlib
import json
import time
from pathlib import Path
from typing import Any

from hunters import biotech_hunter, drifter_hunter, insider_hunter, squeeze_hunter, whale_hunter
from hunters.common.kafka_client import CURRENT_HUNTER, KafkaClient
from hunters.common.logger import get_logger

logger = get_logger("main_cli")

HUNTERS = {
    "squeeze": squeeze_hunter,
    "insider": insider_hunter,
    "whale": whale_hunter,
    "biotech": biotech_hunter,
    "drifter": drifter_hunter,
}


async def run_hunter(
    name: str, timeout_sec: float | None = None, once: bool = False
) -> dict[str, Any]:
    if name not in HUNTERS:
        logger.error("Unknown hunter: %s", name)
        return {
            "hunter": name,
            "success": False,
            "error": f"Unknown hunter: {name}",
            "duration_sec": 0.0,
        }

    start = time.perf_counter()
    token = CURRENT_HUNTER.set(name)
    before = KafkaClient.sent_counts[(name, "raw-events")]
    try:
        logger.info("Starting hunter: %s", name)
        coro = HUNTERS[name].run(once=True) if once else HUNTERS[name].run()
        if timeout_sec is not None and timeout_sec > 0:
            await asyncio.wait_for(coro, timeout=timeout_sec)
        else:
            await coro
        elapsed = round(time.perf_counter() - start, 3)
        logger.info("Finished hunter %s in %.3fs", name, elapsed)
        return {
            "hunter": name,
            "success": True,
            "error": None,
            "duration_sec": elapsed,
            "emitted_events": KafkaClient.sent_counts[(name, "raw-events")] - before,
        }
    except TimeoutError:
        elapsed = round(time.perf_counter() - start, 3)
        logger.error("Hunter %s timed out after %.3fs", name, elapsed)
        return {
            "hunter": name,
            "success": False,
            "error": f"Timed out after {timeout_sec}s",
            "emitted_events": KafkaClient.sent_counts[(name, "raw-events")] - before,
            "duration_sec": elapsed,
        }
    except Exception as e:
        elapsed = round(time.perf_counter() - start, 3)
        logger.error("Error running hunter %s in %.3fs: %s", name, elapsed, e, exc_info=True)
        return {
            "hunter": name,
            "success": False,
            "error": type(e).__name__ if once else str(e),
            "emitted_events": KafkaClient.sent_counts[(name, "raw-events")] - before,
            "duration_sec": elapsed,
        }
    finally:
        CURRENT_HUNTER.reset(token)


async def main():
    parser = argparse.ArgumentParser(description="Catalyst Hunters CLI")
    parser.add_argument(
        "hunter", nargs="?", help="Name of the hunter to run (or 'all')", default="all"
    )
    parser.add_argument("--list", action="store_true", help="List available hunters")
    parser.add_argument("--once", action="store_true", help="Complete one sweep, then exit")
    parser.add_argument("--report", type=Path, help="Write sanitized batch outcomes as JSON")
    parser.add_argument(
        "--timeout", type=float, default=None, help="Execution timeout in seconds per hunter"
    )

    args = parser.parse_args()

    if args.list:
        print("Available hunters:")
        for name in HUNTERS:
            print(f" - {name}")
        return []

    if args.hunter == "all":
        logger.info("Running ALL %s hunters...", len(HUNTERS))
        results = await asyncio.gather(
            *(run_hunter(name, timeout_sec=args.timeout, once=args.once) for name in HUNTERS)
        )
        success_count = sum(1 for r in results if r["success"])
        logger.info(
            "Batch execution complete: %s/%s succeeded",
            success_count,
            len(HUNTERS),
        )
    else:
        result = await run_hunter(args.hunter, timeout_sec=args.timeout, once=args.once)
        results = [result]
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(results, indent=2))
    return results


if __name__ == "__main__":
    # Add project root to sys.path to ensure absolute imports work
    # This assumes we are running from the parent of 'hunters' directory or similar structure
    # But for now, let's rely on standard python path behaviors or running as a module.
    with contextlib.suppress(KeyboardInterrupt):
        asyncio.run(main())
