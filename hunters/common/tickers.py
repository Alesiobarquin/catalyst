"""Canonical US equity symbols in the Yahoo Finance form used for prices (``BRK-B``)."""

import re

EXCHANGE_PREFIXES = frozenset(
    {"NASDAQ", "NYSE", "AMEX", "NYSEAMERICAN", "NYSEARCA", "OTC", "BATS", "ARCA", "XNAS", "XNYS"}
)
# A foreign listing such as T.TO is a different security from the US symbol T, so any
# suffix outside these US share-class/warrant/unit suffixes is rejected, never stripped.
US_CLASS_SUFFIXES = frozenset({"A", "B", "C", "D", "E", "K", "U", "WS", "WT"})
PLACEHOLDERS = frozenset({"NONE", "NA", "N-A"})
_SYMBOL = re.compile(r"[A-Z][A-Z0-9]{0,5}(?:-([A-Z]{1,2}))?")


def canonical_ticker(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip().upper().split("\n")[0].split(",")[0].strip().lstrip("$").strip()
    if ":" in text:
        prefix, _, symbol = (part.strip() for part in text.partition(":"))
        if prefix in EXCHANGE_PREFIXES:
            text = symbol
        elif symbol == "US":
            text = prefix
        else:
            return None
    text = re.sub(r"[./]", "-", text)
    text = text.removesuffix("-US")
    match = _SYMBOL.fullmatch(text)
    if not match or text in PLACEHOLDERS:
        return None
    if match.group(1) and match.group(1) not in US_CLASS_SUFFIXES:
        return None
    return text
