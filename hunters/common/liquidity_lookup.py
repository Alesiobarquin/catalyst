"""
Fetch price, volume, and relative_volume for a ticker via yfinance.
Used by the Insider, Biotech, Whale and Drifter hunters to satisfy Gatekeeper liquidity requirements.

Relative volume compares against completed sessions only. During market hours the
in-progress bar is projected to a full day using a typical intraday volume curve,
so a scan shortly after the open is not compared against whole days.
"""

import threading
from collections import Counter
from datetime import UTC, datetime
from itertools import pairwise
from zoneinfo import ZoneInfo

import pandas as pd
import yfinance as yf

from .kafka_client import CURRENT_HUNTER
from .logger import get_logger

logger = get_logger("liquidity_lookup")
# Lookups run in worker threads; asyncio.to_thread copies CURRENT_HUNTER into them.
skipped_counts: Counter[str] = Counter()
_skipped_lock = threading.Lock()

MARKET_TZ = ZoneInfo("America/New_York")
SESSION_MINUTES = 390
BASELINE_SESSIONS = 20
MIN_PROJECTION_MINUTES = 15
# Approximate cumulative share of a US equity session's volume by minutes after the open.
_CUMULATIVE_VOLUME = (
    (0, 0.0),
    (30, 0.13),
    (60, 0.22),
    (120, 0.36),
    (180, 0.47),
    (240, 0.58),
    (300, 0.69),
    (360, 0.83),
    (390, 1.0),
)


def expected_volume_fraction(minutes: float) -> float:
    if minutes <= 0:
        return 0.0
    for (m0, f0), (m1, f1) in pairwise(_CUMULATIVE_VOLUME):
        if minutes <= m1:
            return f0 + (f1 - f0) * (minutes - m0) / (m1 - m0)
    return 1.0


def liquidity_from_history(hist: pd.DataFrame, now: datetime) -> dict | None:
    hist = hist.dropna(subset=["Close", "Volume"])
    if hist.empty:
        return None
    now_et = now.astimezone(MARKET_TZ)
    minutes = (
        now_et - now_et.replace(hour=9, minute=30, second=0, microsecond=0)
    ).total_seconds() / 60
    in_progress = hist.index[-1].date() == now_et.date() and minutes < SESSION_MINUTES
    completed = hist.iloc[:-1] if in_progress else hist
    if completed.empty:
        return None

    volumes = completed["Volume"].astype(float)
    last_completed = float(volumes.iloc[-1])
    prior_baseline = float(volumes.iloc[-(BASELINE_SESSIONS + 1) : -1].mean())
    relative_volume = last_completed / prior_baseline if prior_baseline > 0 else 0.0
    basis = "prior_session"
    volume = last_completed

    if in_progress:
        today = float(hist["Volume"].iloc[-1])
        volume = max(volume, today)
        baseline = float(volumes.iloc[-BASELINE_SESSIONS:].mean())
        if minutes >= MIN_PROJECTION_MINUTES and baseline > 0:
            projected = today / (baseline * expected_volume_fraction(minutes))
            if projected > relative_volume:
                relative_volume = projected
                basis = "intraday_projection"

    return {
        "price": float(hist["Close"].iloc[-1]),
        "volume": int(volume),
        "relative_volume": round(relative_volume, 4),
        "relative_volume_basis": basis,
    }


def fetch_liquidity_metrics(ticker: str, now: datetime | None = None) -> dict | None:
    """
    Fetch price, volume, and relative_volume for a ticker.
    Returns None if data unavailable (OTC, delisted, invalid ticker).
    """
    if not ticker or not str(ticker).strip():
        return None
    symbol = str(ticker).strip().upper()
    try:
        hist = yf.Ticker(symbol).history(period="2mo")
        metrics = liquidity_from_history(hist, now or datetime.now(UTC))
    except Exception as exc:
        return _skip(symbol, type(exc).__name__)
    return metrics or _skip(symbol, "no usable price history")


def _skip(symbol: str, reason: str) -> None:
    with _skipped_lock:
        skipped_counts[CURRENT_HUNTER.get()] += 1
    logger.warning("Liquidity lookup failed for %s (%s); event skipped", symbol, reason)
