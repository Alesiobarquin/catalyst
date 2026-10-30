from datetime import datetime

import pandas as pd
import pytest

from hunters.common.liquidity_lookup import (
    MARKET_TZ,
    expected_volume_fraction,
    liquidity_from_history,
)


def _history(volumes: list[float], last_day: str) -> pd.DataFrame:
    index = pd.bdate_range(end=last_day, periods=len(volumes), tz=MARKET_TZ)
    closes = [10.0 + i * 0.01 for i in range(len(volumes))]
    return pd.DataFrame({"Close": closes, "Volume": volumes}, index=index)


def _at(day: str, hour: int, minute: int) -> datetime:
    return datetime.fromisoformat(f"{day}T{hour:02d}:{minute:02d}").replace(tzinfo=MARKET_TZ)


def test_partial_opening_bar_is_not_compared_with_full_days():
    # 21 normal sessions, then 32 minutes of today's trading at a normal pace.
    hist = _history([1_000_000] * 21 + [140_000], "2026-10-29")
    result = liquidity_from_history(hist, _at("2026-10-29", 10, 2))
    assert 0.8 < result["relative_volume"] < 1.3
    assert result["volume"] == 1_000_000


def test_heavy_opening_is_projected_to_a_full_day():
    hist = _history([1_000_000] * 21 + [400_000], "2026-10-29")
    result = liquidity_from_history(hist, _at("2026-10-29", 10, 2))
    assert result["relative_volume"] > 2.5
    assert result["relative_volume_basis"] == "intraday_projection"


def test_prior_session_spike_counts_before_projection_starts():
    hist = _history([1_000_000] * 20 + [3_000_000, 20_000], "2026-10-29")
    result = liquidity_from_history(hist, _at("2026-10-29", 9, 35))
    assert result["relative_volume"] == pytest.approx(3.0)
    assert result["relative_volume_basis"] == "prior_session"
    assert result["volume"] == 3_000_000


def test_completed_session_after_close_uses_its_own_full_volume():
    hist = _history([1_000_000] * 20 + [2_000_000], "2026-10-29")
    result = liquidity_from_history(hist, _at("2026-10-29", 16, 30))
    assert result["relative_volume"] == pytest.approx(2.0)


def test_empty_history_returns_none():
    empty = pd.DataFrame({"Close": [], "Volume": []})
    assert liquidity_from_history(empty, _at("2026-10-29", 10, 0)) is None


def test_failed_lookup_is_counted_for_the_current_hunter():
    from unittest.mock import patch

    from hunters.common import liquidity_lookup
    from hunters.common.kafka_client import CURRENT_HUNTER

    token = CURRENT_HUNTER.set("whale")
    before = liquidity_lookup.skipped_counts["whale"]
    try:
        with patch.object(liquidity_lookup.yf, "Ticker", side_effect=OSError("down")):
            assert liquidity_lookup.fetch_liquidity_metrics("NVDA") is None
    finally:
        CURRENT_HUNTER.reset(token)
    assert liquidity_lookup.skipped_counts["whale"] == before + 1


def test_expected_volume_fraction_bounds():
    assert expected_volume_fraction(-5) == 0.0
    assert expected_volume_fraction(30) == pytest.approx(0.13)
    assert expected_volume_fraction(400) == 1.0
