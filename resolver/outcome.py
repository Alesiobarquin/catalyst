"""Outcome rule for a recommendation, shared by the resolver and the performance API.

Daily bars are walked from the first session after entry; the entry session is
skipped because its high and low may predate the recommendation. A daily bar does
not say whether the stop or the target was touched first, so the stop is checked
first. Fills are at the stop or target, or at the open when the price gapped through.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

MARKET_TZ = ZoneInfo("America/New_York")


@dataclass(frozen=True)
class Outcome:
    status: str  # HIT_TARGET | HIT_STOP | EXPIRED
    price: float
    session: date


def _number(bar, column: str) -> float | None:
    try:
        value = float(bar[column])
    except (KeyError, TypeError, ValueError):
        return None
    return value if math.isfinite(value) else None


def resolve_from_bars(
    action: str,
    stop: float,
    target: float,
    bars,
    entered_at: datetime,
    now: datetime,
    max_holding_days: int,
) -> Outcome | None:
    """Return the outcome, or None while the recommendation is still open."""
    if entered_at.tzinfo is None:
        entered_at = entered_at.replace(tzinfo=timezone.utc)
    entry_session = entered_at.astimezone(MARKET_TZ).date()
    expiry_session = entry_session + timedelta(days=max_holding_days)
    is_sell = str(action or "BUY").upper() == "SELL"
    last_close: tuple[float, date] | None = None

    for timestamp, bar in bars.iterrows():
        session = timestamp.date()
        if session <= entry_session:
            continue
        if session > expiry_session:
            break
        high, low, close = _number(bar, "High"), _number(bar, "Low"), _number(bar, "Close")
        if high is None or low is None or close is None:
            continue
        opened = _number(bar, "Open")
        if is_sell:
            if stop > 0 and high >= stop:
                return Outcome("HIT_STOP", max(stop, opened or stop), session)
            if target > 0 and low <= target:
                return Outcome("HIT_TARGET", min(target, opened or target), session)
        else:
            if stop > 0 and low <= stop:
                return Outcome("HIT_STOP", min(stop, opened or stop), session)
            if target > 0 and high >= target:
                return Outcome("HIT_TARGET", max(target, opened or target), session)
        last_close = (close, session)

    if now - entered_at >= timedelta(days=max_holding_days) and last_close is not None:
        return Outcome("EXPIRED", *last_close)
    return None


def pnl_percent(action: str, entry: float, exit_price: float) -> float:
    if str(action or "BUY").upper() == "SELL":
        return (entry - exit_price) / entry * 100.0
    return (exit_price - entry) / entry * 100.0
