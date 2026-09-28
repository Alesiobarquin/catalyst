"""Unit tests for the TimescaleDB persistence consumer."""

import json
from datetime import datetime
from unittest.mock import MagicMock

from persistence.consumer import (
    INSERT_SQL,
    parse_ts,
    persist_signal,
)


class TestPersistenceParseTs:
    def test_parse_none_or_empty(self):
        assert parse_ts(None) is None
        assert parse_ts("") is None

    def test_parse_iso_string(self):
        dt = parse_ts("2026-03-28T09:30:00Z")
        assert isinstance(dt, datetime)
        assert dt.year == 2026
        assert dt.month == 3
        assert dt.day == 28
        assert dt.hour == 9
        assert dt.minute == 30

    def test_parse_invalid(self):
        assert parse_ts("not-a-timestamp") is None


class TestPersistSignal:
    def test_persist_complete_signal(self):
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur

        payload = {
            "timestamp_utc": "2026-03-28T10:00:00Z",
            "ticker": "NVDA",
            "conviction_score": 85,
            "catalyst_type": "SUPERNOVA",
            "is_trap": False,
            "trap_reason": None,
            "rationale": "High volume breakout with short squeeze momentum",
            "confluence_count": 3,
            "confluence_sources": ["squeeze", "whale"],
            "liquidity_metrics": {"volume": 2000000, "relative_volume": 3.2},
            "signals": [{"type": "short_float", "value": 22.5}],
            "news_sentiment": "BULLISH",
            "risk_level": "MODERATE",
            "suggested_timeframe": "SWING",
            "key_risks": ["Resistance at $130"],
            "raw_signals_summary": "Squeeze + Whale confluence",
            "suggested_entry_zone": "$118 - $120",
            "suggested_stop": "$114",
        }

        persist_signal(mock_conn, payload)

        mock_cur.execute.assert_called_once()
        call_args = mock_cur.execute.call_args[0]
        assert call_args[0] == INSERT_SQL

        params = call_args[1]
        assert params[1] == "NVDA"
        assert params[2] == 85
        assert params[3] == "SUPERNOVA"
        assert params[4] is False
        assert params[6] == "High volume breakout with short squeeze momentum"
        assert params[7] == 3
        # JSON serialized fields
        assert json.loads(params[8]) == ["squeeze", "whale"]
        assert json.loads(params[9]) == {"volume": 2000000, "relative_volume": 3.2}
        assert json.loads(params[10]) == [{"type": "short_float", "value": 22.5}]
        assert json.loads(params[14]) == ["Resistance at $130"]

        mock_conn.commit.assert_called_once()
        mock_cur.close.assert_called_once()

    def test_persist_minimal_signal_uses_defaults(self):
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_conn.cursor.return_value = mock_cur

        payload = {"ticker": "AAPL"}
        persist_signal(mock_conn, payload)

        mock_cur.execute.assert_called_once()
        params = mock_cur.execute.call_args[0][1]

        # Timestamp defaults to now (UTC)
        assert isinstance(params[0], datetime)
        assert params[1] == "AAPL"
        assert params[2] == 0  # conviction_score default
        assert params[3] == "UNKNOWN"  # catalyst_type default
        assert params[4] is False  # is_trap default
        assert params[6] == ""  # rationale default
        assert json.loads(params[8]) == []  # confluence_sources default
        assert json.loads(params[9]) == {}  # liquidity_metrics default

        mock_conn.commit.assert_called_once()
        mock_cur.close.assert_called_once()
