"""Optional, bounded Yahoo equity screener source for the squeeze hunter.

Uses the documented yfinance EquityQuery/screen API. The first 250 US matches,
ordered by current volume, are the maximum scope; this is not a whole-market
scan. Quote fields filter them without extra requests, and at most 40 survivors
are enriched with Ticker.get_info. Relative volume is current reported volume /
Yahoo's reported average daily volume; during the session the average is scaled
by the expected share of a day's volume traded by the quote time. Short interest
and its reporting date come from get_info, and can be older than the quote.
Missing metrics never become defaults.

The subprocess isolates yfinance's shared HTTP session from concurrent hunters
and provides a hard deadline even if an SDK operation fails to return.
"""

import json
import math
import re
import subprocess
import sys
import time
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any

from curl_cffi import requests

from .liquidity_lookup import (
    MARKET_TZ,
    MIN_PROJECTION_MINUTES,
    SESSION_MINUTES,
    expected_volume_fraction,
)
from .provider_errors import ProviderError

SCREEN_ROWS = 250
MAX_CANDIDATES = 40
MAX_SWEEP_SECONDS = 55.0
REQUEST_TIMEOUT_SECONDS = 8.0
_SYMBOL = re.compile(r"[A-Z][A-Z0-9.-]{0,9}\Z")
_CHILD_ERROR_CODES = {"source_unavailable", "deadline", "response_schema"}


def _number(value: object) -> float | None:
    if isinstance(value, Mapping):
        value = value.get("raw")
    if isinstance(value, bool) or value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return parsed if math.isfinite(parsed) and parsed > 0 else None


def _epoch_timestamp(value: object) -> str | None:
    parsed = _number(value)
    if parsed is None:
        return None
    try:
        return datetime.fromtimestamp(parsed, UTC).isoformat()
    except (ValueError, OverflowError, OSError):
        return None


def _relative_volume(volume: float, average_volume: float, quote_epoch: float | None):
    if quote_epoch is not None:
        quoted = datetime.fromtimestamp(quote_epoch, MARKET_TZ)
        opened = quoted.replace(hour=9, minute=30, second=0, microsecond=0)
        minutes = (quoted - opened).total_seconds() / 60
        if MIN_PROJECTION_MINUTES <= minutes < SESSION_MINUTES:
            expected = average_volume * expected_volume_fraction(minutes)
            return volume / expected, "intraday_projection"
    return volume / average_volume, "session"


class _DeadlineSession(requests.Session):
    """A supported session with a timeout covering each SDK HTTP operation."""

    def __init__(self, deadline: float):
        # This is yfinance's standard transport configuration, without proxy,
        # challenge handling, credential injection, or additional retry logic.
        super().__init__(impersonate="chrome", timeout=REQUEST_TIMEOUT_SECONDS)
        self.deadline = deadline

    def request(self, method: str, url: str, **kwargs: Any):
        remaining = self.deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("Yahoo collection deadline")
        requested_timeout = _number(kwargs.get("timeout"))
        kwargs["timeout"] = min(
            remaining, REQUEST_TIMEOUT_SECONDS, requested_timeout or REQUEST_TIMEOUT_SECONDS
        )
        return super().request(method, url, **kwargs)


def _provider_error(exc: Exception) -> ProviderError:
    if isinstance(exc, ProviderError):
        return exc
    if isinstance(exc, (TimeoutError, requests.exceptions.Timeout)):
        return ProviderError("yahoo", "deadline")
    status = getattr(getattr(exc, "response", None), "status_code", None)
    if type(exc).__name__ == "YFRateLimitError":
        status = 429
    return ProviderError("yahoo", "source_unavailable", status)


def _collect_targets(max_candidates: int, deadline: float) -> list[dict[str, object]]:
    """Runs only in the isolated worker; no Kafka or order side effects."""
    import yfinance as yf

    query = yf.EquityQuery(
        "and",
        [
            yf.EquityQuery("eq", ["region", "us"]),
            yf.EquityQuery("btwn", ["intradayprice", 2, 60]),
            yf.EquityQuery("gte", ["dayvolume", 200_000]),
            yf.EquityQuery("gte", ["short_percentage_of_float.value", 25]),
            yf.EquityQuery("gte", ["days_to_cover_short.value", 3]),
        ],
    )
    events: list[dict[str, object]] = []
    with _DeadlineSession(deadline) as session:
        result = yf.screen(
            query,
            size=SCREEN_ROWS,
            offset=0,
            sortField="dayvolume",
            sortAsc=False,
            session=session,
        )
        if not isinstance(result, dict) or not isinstance(result.get("quotes"), list):
            raise ProviderError("yahoo", "response_schema")
        quotes = result["quotes"][:SCREEN_ROWS]
        seen: set[str] = set()
        enriched = 0
        for quote in quotes:
            if time.monotonic() >= deadline:
                raise ProviderError("yahoo", "deadline")
            if not isinstance(quote, dict):
                raise ProviderError("yahoo", "response_schema")
            symbol = quote.get("symbol")
            if not isinstance(symbol, str) or not _SYMBOL.fullmatch(symbol) or symbol in seen:
                continue
            seen.add(symbol)
            price = _number(quote.get("regularMarketPrice"))
            volume = _number(quote.get("regularMarketVolume"))
            average_volume = _number(quote.get("averageDailyVolume3Month"))
            if price is None or volume is None or average_volume is None:
                continue
            quote_epoch = _number(quote.get("regularMarketTime"))
            relative_volume, basis = _relative_volume(volume, average_volume, quote_epoch)
            if not (2 <= price <= 60) or volume < 200_000 or relative_volume < 2:
                continue
            if enriched >= max_candidates:
                break
            enriched += 1

            # Enrich only qualifying liquid candidates. The screener does not
            # return short-interest metrics; membership is not a metric value.
            info = yf.Ticker(symbol, session=session).get_info()
            if not isinstance(info, dict):
                raise ProviderError("yahoo", "response_schema")
            short_fraction = _number(info.get("shortPercentOfFloat"))
            days_to_cover = _number(info.get("shortRatio"))
            if short_fraction is None or days_to_cover is None:
                continue
            short_float = short_fraction * 100
            if short_float < 25 or days_to_cover < 3:
                continue
            collected_at = datetime.now(UTC).isoformat()
            event: dict[str, object] = {
                "hunter": "squeeze",
                "source_hunter": "squeeze",
                "source": "yahoo_equity_screener",
                "ticker": symbol,
                "price": price,
                "volume": int(volume),
                "average_volume": average_volume,
                "relative_volume": round(relative_volume, 4),
                "relative_volume_baseline": "averageDailyVolume3Month",
                "relative_volume_basis": basis,
                "short_float": short_float,
                "days_to_cover": days_to_cover,
                "timestamp": collected_at,
                "timestamp_utc": collected_at,
                "screener_rows_requested": SCREEN_ROWS,
                "screener_candidate_limit": max_candidates,
                "screener_candidates_considered": len(quotes),
                "screener_sort": "dayvolume_desc",
            }
            quote_time = _epoch_timestamp(quote.get("regularMarketTime"))
            short_time = _epoch_timestamp(info.get("dateShortInterest"))
            if quote_time is not None:
                event["quote_timestamp_utc"] = quote_time
            if short_time is not None:
                event["short_interest_timestamp_utc"] = short_time
            total = _number(result.get("total"))
            if total is not None:
                event["screener_total_matches"] = int(total)
            events.append(event)
    if time.monotonic() >= deadline:
        raise ProviderError("yahoo", "deadline")
    return events


def fetch_yahoo_squeeze_targets(
    *, max_candidates: int = MAX_CANDIDATES, timeout_seconds: float = MAX_SWEEP_SECONDS
) -> list[dict[str, object]]:
    """Enrich at most 40 candidates within 55 seconds, or raise a safe error.

    A larger requested limit/deadline is clamped. This synchronous function can
    be called using asyncio.to_thread without sharing yfinance's session state.
    subprocess.run kills and reaps the child on timeout. A failed or interrupted
    collection cannot return a truncated success disguised as an empty sweep.
    """
    if isinstance(max_candidates, bool) or not isinstance(max_candidates, int):
        raise ValueError("max_candidates must be a positive integer")
    budget = _number(timeout_seconds)
    if max_candidates <= 0 or budget is None:
        raise ValueError("max_candidates and timeout_seconds must be positive")
    limit = min(max_candidates, MAX_CANDIDATES)
    budget = min(budget, MAX_SWEEP_SECONDS)
    deadline = time.monotonic() + budget
    try:
        completed = subprocess.run(
            [sys.executable, "-m", "hunters.common.yahoo_screener"],
            input=json.dumps({"max_candidates": limit, "deadline": deadline}),
            capture_output=True,
            text=True,
            timeout=budget,
            check=False,
        )
    except subprocess.TimeoutExpired:
        raise ProviderError("yahoo", "deadline") from None
    except OSError:
        raise ProviderError("yahoo", "source_unavailable") from None
    if completed.returncode != 0:
        raise ProviderError("yahoo", "source_unavailable")
    try:
        payload = json.loads(completed.stdout)
    except (TypeError, ValueError):
        raise ProviderError("yahoo", "response_schema") from None
    if not isinstance(payload, dict):
        raise ProviderError("yahoo", "response_schema")
    if "error" in payload:
        code = payload["error"]
        if not isinstance(code, str) or code not in _CHILD_ERROR_CODES:
            code = "source_unavailable"
        raise ProviderError("yahoo", code, payload.get("status"))
    events = payload.get("events")
    if (
        not isinstance(events, list)
        or len(events) > limit
        or any(not isinstance(event, dict) for event in events)
    ):
        raise ProviderError("yahoo", "response_schema")
    return events


def _main() -> None:
    try:
        parameters = json.loads(sys.stdin.read())
        events = _collect_targets(parameters["max_candidates"], parameters["deadline"])
        payload = {"events": events}
    except Exception as exc:
        error = _provider_error(exc)
        payload = {"error": error.code, "status": error.status}
    sys.stdout.write(json.dumps(payload, allow_nan=False))


if __name__ == "__main__":
    _main()
