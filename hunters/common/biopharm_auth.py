"""Validate an explicitly supplied BioPharmCatalyst Playwright session file.

This module reads no browser profiles, performs no login, and never prints state.
Only provider cookies and HTTPS provider local storage are accepted. Account
entitlement is established by the rendered calendar, not by this file's presence.
"""

import json
import math
import re
from pathlib import Path
from urllib.parse import urlsplit

from .provider_errors import ProviderError

MAX_STATE_BYTES = 64 * 1024
PROVIDER_HOSTS = frozenset({"biopharmcatalyst.com", "www.biopharmcatalyst.com"})
_COOKIE_DOMAINS = PROVIDER_HOSTS | frozenset(f".{host}" for host in PROVIDER_HOSTS)
_COOKIE_FIELDS = frozenset(
    {"name", "value", "domain", "path", "expires", "httpOnly", "secure", "sameSite", "partitionKey"}
)
_COOKIE_NAME = re.compile(r"[!#$%&'*+\-.^_`|~0-9A-Za-z]+\Z")


def _invalid_state() -> ValueError:
    return ValueError("Invalid BioPharmCatalyst session state")


def _provider_origin(value: object) -> str:
    if not isinstance(value, str):
        raise _invalid_state()
    try:
        parts = urlsplit(value)
        valid = (
            parts.scheme == "https"
            and parts.hostname in PROVIDER_HOSTS
            and parts.port in (None, 443)
            and parts.username is None
            and parts.password is None
            and parts.path in ("", "/")
            and not parts.query
            and not parts.fragment
        )
    except ValueError:
        raise _invalid_state() from None
    if not valid:
        raise ValueError("BioPharmCatalyst session state contains an unsupported origin")
    return f"https://{parts.hostname}"


def validate_biopharm_storage_state(state: dict) -> dict:
    """Return normalized provider-only state; reject foreign or malformed entries."""
    if not isinstance(state, dict) or set(state) != {"cookies", "origins"}:
        raise _invalid_state()
    if not isinstance(state["cookies"], list) or not isinstance(state["origins"], list):
        raise _invalid_state()
    cookies = []
    for cookie in state["cookies"]:
        if not isinstance(cookie, dict) or not set(cookie) <= _COOKIE_FIELDS:
            raise _invalid_state()
        name = cookie.get("name")
        value = cookie.get("value")
        domain = cookie.get("domain")
        path = cookie.get("path")
        expires = cookie.get("expires")
        if not isinstance(name, str) or not _COOKIE_NAME.fullmatch(name):
            raise _invalid_state()
        if not isinstance(value, str) or any(ord(char) < 32 or ord(char) == 127 for char in value):
            raise _invalid_state()
        if not isinstance(domain, str) or domain.lower() not in _COOKIE_DOMAINS:
            raise ValueError("BioPharmCatalyst session state contains an unsupported cookie domain")
        if (
            not isinstance(path, str)
            or not path.startswith("/")
            or any(ord(char) < 32 or ord(char) == 127 for char in path)
        ):
            raise _invalid_state()
        if (
            isinstance(expires, bool)
            or not isinstance(expires, (int, float))
            or not -1 <= expires <= 253402300799
            or not math.isfinite(expires)
            or (expires < 0 and expires != -1)
        ):
            raise _invalid_state()
        if not isinstance(cookie.get("httpOnly"), bool) or not isinstance(
            cookie.get("secure"), bool
        ):
            raise _invalid_state()
        if cookie.get("sameSite") not in {"Strict", "Lax", "None"}:
            raise _invalid_state()
        normalized = dict(cookie)
        normalized["domain"] = domain.lower()
        if "partitionKey" in normalized:
            normalized["partitionKey"] = _provider_origin(normalized["partitionKey"])
        cookies.append(normalized)
    origins = []
    has_local_storage = False
    for origin in state["origins"]:
        if not isinstance(origin, dict) or set(origin) != {"origin", "localStorage"}:
            raise _invalid_state()
        provider_origin = _provider_origin(origin["origin"])
        entries = origin["localStorage"]
        if not isinstance(entries, list):
            raise _invalid_state()
        normalized_entries = []
        for entry in entries:
            if (
                not isinstance(entry, dict)
                or set(entry) != {"name", "value"}
                or not isinstance(entry["name"], str)
                or not isinstance(entry["value"], str)
            ):
                raise _invalid_state()
            normalized_entries.append(dict(entry))
        has_local_storage = has_local_storage or bool(normalized_entries)
        origins.append({"origin": provider_origin, "localStorage": normalized_entries})
    if not cookies and not has_local_storage:
        raise ValueError("BioPharmCatalyst session state contains no provider session data")
    normalized_state = {"cookies": cookies, "origins": origins}
    if len(json.dumps(normalized_state, allow_nan=False).encode("utf-8")) > MAX_STATE_BYTES:
        raise ValueError("BioPharmCatalyst session state exceeds the supported size")
    return normalized_state


def load_biopharm_storage_state(path: Path | str) -> dict:
    """Load only the explicit file; failures expose no paths, values or JSON excerpts."""
    try:
        state_path = Path(path)
        if not state_path.is_file():
            raise _invalid_state()
        with state_path.open("rb") as source:
            data = source.read(MAX_STATE_BYTES + 1)
        if len(data) > MAX_STATE_BYTES:
            raise _invalid_state()
        return validate_biopharm_storage_state(json.loads(data))
    except (OSError, ValueError, TypeError):
        raise ProviderError("biopharm", "invalid_session") from None
