"""HTTP retry and rate-limiting utility for hunter API integrations (SEC EDGAR, FMP, etc.)."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any

import httpx

from .logger import get_logger

logger = get_logger("http_retry")


def parse_retry_after(
    header_val: str | None, default_delay: float = 2.0, max_delay: float = 30.0
) -> float:
    """Parse HTTP Retry-After header (either seconds integer or HTTP date)."""
    if not header_val:
        return default_delay

    val = header_val.strip()
    # Try integer seconds first
    try:
        secs = float(val)
        return max(0.1, min(secs, max_delay))
    except ValueError:
        pass

    # Try HTTP date
    try:
        target_dt = parsedate_to_datetime(val)
        now_dt = datetime.now(timezone.utc)
        diff = (target_dt - now_dt).total_seconds()
        return max(0.1, min(diff, max_delay))
    except Exception:
        return default_delay


async def async_http_get_with_retry(
    client: httpx.AsyncClient,
    url: str,
    *,
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 30.0,
    retry_statuses: tuple[int, ...] = (429, 500, 502, 503, 504),
    custom_logger: logging.Logger | None = None,
    **kwargs: Any,
) -> httpx.Response:
    """Execute an async GET request with exponential backoff on transient errors and 429 rate limits."""
    log = custom_logger or logger

    for attempt in range(max_retries + 1):
        try:
            resp = await client.get(url, **kwargs)
            if resp.status_code not in retry_statuses or attempt == max_retries:
                return resp

            if resp.status_code == 429:
                retry_header = resp.headers.get("Retry-After")
                wait_time = parse_retry_after(
                    retry_header,
                    default_delay=min(base_delay * (2**attempt), max_delay),
                    max_delay=max_delay,
                )
                log.warning(
                    "Rate limit (429) hit for %s (attempt %d/%d). Sleeping for %.2fs...",
                    url,
                    attempt + 1,
                    max_retries,
                    wait_time,
                )
            else:
                wait_time = min(base_delay * (2**attempt), max_delay)
                log.warning(
                    "Transient HTTP %s for %s (attempt %d/%d). Retrying in %.2fs...",
                    resp.status_code,
                    url,
                    attempt + 1,
                    max_retries,
                    wait_time,
                )

            await asyncio.sleep(wait_time)

        except (httpx.TransportError, httpx.TimeoutException) as exc:
            if attempt == max_retries:
                log.error("GET %s failed after %d retries: %s", url, max_retries, exc)
                raise
            wait_time = min(base_delay * (2**attempt), max_delay)
            log.warning(
                "Network/timeout exception for %s: %s (attempt %d/%d). Retrying in %.2fs...",
                url,
                exc,
                attempt + 1,
                max_retries,
                wait_time,
            )
            await asyncio.sleep(wait_time)

    # Fallback return (the loop will normally return or raise)
    raise RuntimeError(f"Unexpected termination in async_http_get_with_retry for {url}")
