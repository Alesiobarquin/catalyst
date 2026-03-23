"""Unit tests for Squeeze Hunter clean_percent, clean_number, compute_relative_volume."""

from unittest.mock import MagicMock

import pandas as pd

from hunters.squeeze_hunter import clean_number, clean_percent, compute_relative_volume


class TestCleanPercent:
    def test_percent_string(self):
        assert clean_percent("23.40%") == 23.4
        assert clean_percent("100%") == 100.0

    def test_invalid_returns_zero(self):
        assert clean_percent("N/A") == 0.0
        assert clean_percent("") == 0.0
        assert clean_percent(42) == 0.0


class TestCleanNumber:
    def test_numeric(self):
        assert clean_number(1_000_000) == 1_000_000.0
        assert clean_number("1,234") == 1234.0

    def test_k_suffix(self):
        assert clean_number("500K") == 500_000.0
        assert clean_number("1.5K") == 1500.0

    def test_m_suffix(self):
        assert clean_number("2M") == 2_000_000.0
        assert clean_number("10.5M") == 10_500_000.0

    def test_b_suffix(self):
        assert clean_number("1B") == 1_000_000_000.0

    def test_nan_none(self):
        assert clean_number(pd.NA) is None
        assert clean_number("-") is None
        assert clean_number("") is None

    def test_invalid_returns_none(self):
        assert clean_number("N/A") is None


class TestComputeRelativeVolume:
    def test_no_redis_no_baseline(self):
        rv = compute_relative_volume(None, "X", 100_000, None)
        assert rv == 0.0

    def test_with_avg_volume(self):
        rv = compute_relative_volume(None, "X", 200_000, 100_000)
        assert rv == 2.0

    def test_redis_stored_baseline(self):
        redis = MagicMock()
        redis.get.return_value = "80_000"
        rv = compute_relative_volume(redis, "X", 160_000, 100_000)
        assert rv == 2.0  # 160_000 / 80_000

    def test_redis_seeds_baseline_when_none(self):
        redis = MagicMock()
        redis.get.return_value = None
        rv = compute_relative_volume(redis, "X", 100_000, None)
        assert rv == 0.0
        redis.set.assert_called_once()
        stored_val = redis.set.call_args[0][1]
        assert abs(float(stored_val) - 100_000) < 1
