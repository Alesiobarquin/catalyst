"""Bounded, anonymous PDUFA.bio calendar acquisition using its free core API.

Only pending FDA goal dates announced to an exact day and linked to a primary
source are candidates. Month/quarter estimates never become invented dates.
The public site must visibly attribute PDUFA.bio and link back, as its free API
terms require: https://www.pdufa.bio/developers.
"""

import asyncio
import json
import re
from datetime import date, datetime, timedelta, timezone
from urllib.parse import urlsplit

import httpx

from .provider_errors import ProviderError

PDUFA_API_URL = "https://www.pdufa.bio/api/v1/pdufa"
MAX_RECORDS = 40
LOOKAHEAD_DAYS = 90
MAX_RESPONSE_BYTES = 512 * 1024
REQUEST_DEADLINE_SECONDS = 25
_TICKER = re.compile(r"[A-Z][A-Z0-9-]{0,5}\Z")
_DAY = re.compile(r"\d{4}-\d{2}-\d{2}\Z")
_REQUIRED_FIELDS = frozenset(
    {"ticker", "name", "date", "date_precision", "type", "status", "source", "source_url"}
)
_PLACEHOLDERS = frozenset({"", "-", "n/a", "none", "null", "tba", "tbd", "locked"})


def _text(value: object) -> str:
    return value.strip() if isinstance(value, str) else ""


def _source_url(value: object) -> str | None:
    text = _text(value)
    if not text or len(text) > 2048:
        return None
    try:
        parts = urlsplit(text)
        if (
            parts.scheme != "https"
            or not parts.hostname
            or parts.username is not None
            or parts.password is not None
        ):
            return None
    except ValueError:
        return None
    return text


def parse_pdufa_response(payload: object, *, collected_at: datetime) -> list[dict]:
    """Parse the documented core envelope without treating estimates as FDA goals."""
    if not isinstance(payload, dict):
        raise ProviderError("pdufa", "response_schema")
    records = payload.get("data")
    metadata = payload.get("meta")
    if not isinstance(records, list) or not isinstance(metadata, dict):
        raise ProviderError("pdufa", "response_schema")
    served_from = _text(metadata.get("served_from")).lower()
    if "stale" in served_from or "degraded" in served_from:
        raise ProviderError("pdufa", "stale_data")
    if not _text(metadata.get("as_of")):
        raise ProviderError("pdufa", "response_schema")
    first_day = collected_at.date()
    last_day = first_day + timedelta(days=LOOKAHEAD_DAYS)
    timestamp = collected_at.isoformat()
    candidates = []
    seen = set()
    for record in records[:MAX_RECORDS]:
        if not isinstance(record, dict) or not _REQUIRED_FIELDS <= record.keys():
            raise ProviderError("pdufa", "response_schema")
        if (
            _text(record["type"]).upper() != "PDUFA"
            or _text(record["status"]).lower() != "upcoming"
            or _text(record["date_precision"]).lower() != "day"
            or record.get("goal_unsourced") not in (None, False)
        ):
            continue
        event_date = _text(record["date"])
        if not _DAY.fullmatch(event_date):
            continue
        try:
            scheduled = date.fromisoformat(event_date)
        except ValueError:
            continue
        if not first_day <= scheduled <= last_day:
            continue
        ticker = _text(record["ticker"]).upper()
        drug = _text(record["name"])
        source_document = _text(record["source"])
        primary_url = _source_url(record["source_url"])
        if (
            not _TICKER.fullmatch(ticker)
            or drug.lower() in _PLACEHOLDERS
            or source_document.lower() in _PLACEHOLDERS
            or not primary_url
            or "trial-estimate" in source_document.lower()
        ):
            continue
        source_host = (urlsplit(primary_url).hostname or "").lower()
        if source_host == "clinicaltrials.gov" or source_host.endswith(".clinicaltrials.gov"):
            continue
        identity = (ticker, drug, event_date)
        if identity in seen:
            continue
        seen.add(identity)
        event = {
            "ticker": ticker,
            "drug_name": drug,
            "catalyst_type": "PDUFA",
            "event_date": event_date,
            "event_date_precision": "day",
            "source": "pdufa.bio",
            "source_url": primary_url,
            "source_document": source_document,
            "source_status": record["status"],
            "goal_unsourced": record.get("goal_unsourced"),
            "timestamp": timestamp,
            "timestamp_utc": timestamp,
            "hunter": "biotech",
            "source_hunter": "biotech",
            "provider_as_of": metadata["as_of"],
            "provider_record_limit": MAX_RECORDS,
            "provider_records_considered": min(len(records), MAX_RECORDS),
            "provider_lookahead_days": LOOKAHEAD_DAYS,
        }
        for field, value in (
            ("provider_built_at", metadata.get("data_built_at")),
            ("source_updated_at", record.get("updated_at")),
            ("source_event_id", record.get("id")),
        ):
            if isinstance(value, str) and value:
                event[field] = value
        publisher_url = _source_url(record.get("url"))
        if publisher_url and urlsplit(publisher_url).hostname in {"www.pdufa.bio", "pdufa.bio"}:
            event["publisher_url"] = publisher_url
        date_history = record.get("date_history")
        if isinstance(date_history, list):
            event["source_date_history"] = [
                {
                    key: item[key]
                    for key in ("date", "changed", "why")
                    if isinstance(item.get(key), str)
                }
                for item in date_history[:12]
                if isinstance(item, dict)
            ]
        candidates.append(event)
    return candidates


async def fetch_pdufa_targets() -> list[dict]:
    """One keyless GET, at most 40 records and 512 KiB, within a 25-second deadline."""
    collected_at = datetime.now(timezone.utc)
    params = {
        "from": collected_at.date().isoformat(),
        "to": (collected_at.date() + timedelta(days=LOOKAHEAD_DAYS)).isoformat(),
        "limit": MAX_RECORDS,
    }
    timeout = httpx.Timeout(15.0, connect=5.0, write=5.0, pool=5.0)
    headers = {
        "Accept": "application/json",
        "User-Agent": "Catalyst/1.0 (+https://github.com/Alesiobarquin/catalyst)",
    }
    body = bytearray()
    try:
        async with asyncio.timeout(REQUEST_DEADLINE_SECONDS):
            async with httpx.AsyncClient(timeout=timeout, headers=headers) as client:
                async with client.stream("GET", PDUFA_API_URL, params=params) as response:
                    if response.status_code != 200:
                        raise ProviderError("pdufa", "http_error", response.status_code)
                    async for chunk in response.aiter_bytes():
                        body.extend(chunk)
                        if len(body) > MAX_RESPONSE_BYTES:
                            raise ProviderError("pdufa", "response_schema")
    except (TimeoutError, httpx.TimeoutException):
        raise ProviderError("pdufa", "deadline") from None
    except httpx.TransportError:
        raise ProviderError("pdufa", "source_unavailable") from None
    try:
        payload = json.loads(body)
    except (ValueError, TypeError):
        raise ProviderError("pdufa", "response_schema") from None
    return parse_pdufa_response(payload, collected_at=collected_at)
