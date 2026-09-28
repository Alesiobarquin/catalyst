"""Unit tests for Gatekeeper coercers, filters, and static helpers."""

from unittest.mock import MagicMock, patch

import pytest

# Import after conftest has set up path
from gatekeeper.gatekeeper import GatekeeperService


@pytest.fixture
def gatekeeper():
    """GatekeeperService with mocked Redis and Kafka."""
    with (
        patch("gatekeeper.gatekeeper.Redis") as mock_redis,
        patch("gatekeeper.gatekeeper.KafkaConsumer"),
        patch("gatekeeper.gatekeeper.KafkaProducer"),
    ):
        mock_redis.return_value.ping.return_value = True
        gk = GatekeeperService()
        gk.redis = MagicMock()
        gk.redis.smembers.return_value = set()
        gk.redis.lrange.return_value = []
        gk.redis.exists.return_value = False
        return gk


class TestGatekeeperStaticHelpers:
    """Tests for @staticmethod helpers."""

    def test_to_float_none_empty(self):
        assert GatekeeperService.to_float(None) is None
        assert GatekeeperService.to_float("") is None
        assert GatekeeperService.to_float(None, default=0.0) == 0.0

    def test_to_float_valid(self):
        assert GatekeeperService.to_float(42) == 42.0
        assert GatekeeperService.to_float("42.5") == 42.5
        assert GatekeeperService.to_float("1,234.56") == 1234.56
        assert GatekeeperService.to_float("85%") == 85.0

    def test_to_float_invalid_returns_default(self):
        assert GatekeeperService.to_float("abc", default=0.0) == 0.0
        assert GatekeeperService.to_float("N/A", default=-1.0) == -1.0

    def test_normalize_ticker(self):
        assert GatekeeperService.normalize_ticker("aapl") == "AAPL"
        assert GatekeeperService.normalize_ticker("  nvda  ") == "NVDA"
        assert GatekeeperService.normalize_ticker(None) is None

    def test_first_from_values(self):
        assert GatekeeperService.first_from_values(None, None, 5) == 5
        assert GatekeeperService.first_from_values(0, 1) == 0
        assert GatekeeperService.first_from_values(None, None) is None

    def test_first_raw_event(self):
        evt = {"ticker": "NVDA", "signal_data": {"volume": 100}}
        assert GatekeeperService.first(evt, "ticker") == "NVDA"
        assert GatekeeperService.first(evt, "volume") == 100  # from signal_data
        evt2 = {"volume": 50, "signal_data": {"volume": 99}}
        assert GatekeeperService.first(evt2, "volume") == 50  # raw_event takes precedence
        evt3 = {"ticker": "X"}
        assert GatekeeperService.first(evt3, "missing_key") is None

    def test_normalize_short_float_pct_percent_string(self):
        assert GatekeeperService.normalize_short_float_pct("23.40%", is_fraction=False) == 23.4

    def test_normalize_short_float_pct_fraction(self):
        assert GatekeeperService.normalize_short_float_pct(0.25, is_fraction=True) == 25.0

    def test_normalize_short_float_pct_clamp(self):
        assert GatekeeperService.normalize_short_float_pct(-5.0, is_fraction=False) == 0.0
        assert GatekeeperService.normalize_short_float_pct(150.0, is_fraction=False) == 100.0


class TestGatekeeperDropReason:
    """Tests for get_drop_reason."""

    def test_drop_volume_below_min(self, gatekeeper):
        norm = {
            "ticker": "X",
            "liquidity_metrics": {"price": 10.0, "volume": 1000.0, "relative_volume": 2.0},
        }
        reason = gatekeeper.get_drop_reason(norm)
        assert "volume" in reason.lower() and "50000" in reason

    def test_drop_relative_volume_below_min(self, gatekeeper):
        norm = {
            "ticker": "X",
            "liquidity_metrics": {"price": 10.0, "volume": 100_000.0, "relative_volume": 0.5},
        }
        reason = gatekeeper.get_drop_reason(norm)
        assert "relative_volume" in reason.lower()

    def test_drop_price_below_min(self, gatekeeper):
        norm = {
            "ticker": "X",
            "liquidity_metrics": {"price": 1.0, "volume": 100_000.0, "relative_volume": 2.0},
        }
        reason = gatekeeper.get_drop_reason(norm)
        assert "price" in reason.lower() and "2.0" in reason

    def test_pass_valid_liquidity(self, gatekeeper):
        norm = {
            "ticker": "X",
            "liquidity_metrics": {"price": 10.0, "volume": 100_000.0, "relative_volume": 2.0},
        }
        assert gatekeeper.get_drop_reason(norm) is None

    def test_pass_zero_price_allowed(self, gatekeeper):
        norm = {
            "ticker": "X",
            "liquidity_metrics": {"price": 0.0, "volume": 100_000.0, "relative_volume": 2.0},
        }
        # price=0 bypasses price checks (if price > 0)
        assert gatekeeper.get_drop_reason(norm) is None


class TestGatekeeperCoercers:
    """Tests for source-specific coercers."""

    def test_coerce_squeeze(self, gatekeeper):
        raw = {
            "ticker": "GME",
            "short_float": "35.5%",
            "short_ratio": 5.2,
            "price": 25.0,
            "volume": 500_000,
            "relative_volume": 2.5,
        }
        norm = gatekeeper.coerce_squeeze(raw)
        assert norm["source_hunter"] == "squeeze"
        assert norm["ticker"] == "GME"
        assert norm["liquidity_metrics"]["price"] == 25.0
        assert norm["liquidity_metrics"]["volume"] == 500_000.0
        assert norm["signal_data"]["short_float_pct"] == 35.5

    def test_coerce_insider(self, gatekeeper):
        raw = {
            "ticker": "AAPL",
            "transaction_code": "P",
            "transaction_amount_usd": 250000,
            "price": 180.0,
            "volume": 1_000_000,
            "relative_volume": 1.8,
        }
        norm = gatekeeper.coerce_insider(raw)
        assert norm["source_hunter"] == "insider"
        assert norm["ticker"] == "AAPL"
        assert norm["liquidity_metrics"]["price"] == 180.0
        assert norm["signal_data"]["transaction_code"] == "P"

    def test_coerce_biotech(self, gatekeeper):
        raw = {
            "ticker": "SRNE",
            "drug_name": "ABC-123",
            "catalyst_type": "PDUFA",
            "event_date": "2026-04-15",
            "price": 5.0,
            "volume": 80_000,
            "relative_volume": 1.5,
        }
        norm = gatekeeper.coerce_biotech(raw)
        assert norm["source_hunter"] == "biotech"
        assert norm["ticker"] == "SRNE"
        assert norm["signal_data"]["drug_name"] == "ABC-123"

    def test_coerce_whale(self, gatekeeper):
        raw = {
            "ticker": "NVDA",
            "option_type": "call",
            "strike_price": 130.0,
            "option_volume": 5000,
            "open_interest": 1200,
            "price": 125.0,
            "volume": 3_000_000,
            "relative_volume": 2.2,
        }
        norm = gatekeeper.coerce_whale(raw)
        assert norm["source_hunter"] == "whale"
        assert norm["ticker"] == "NVDA"
        assert norm["signal_data"]["option_type"] == "call"
        assert norm["signal_data"]["strike_price"] == 130.0
        assert norm["liquidity_metrics"]["price"] == 125.0

    def test_coerce_drifter(self, gatekeeper):
        raw = {
            "ticker": "META",
            "surprise_percent": 15.4,
            "eps_actual": 4.50,
            "eps_estimate": 3.90,
            "price": 500.0,
            "volume": 2_000_000,
            "relative_volume": 1.9,
        }
        norm = gatekeeper.coerce_drifter(raw)
        assert norm["source_hunter"] == "drifter"
        assert norm["ticker"] == "META"
        assert norm["signal_data"]["surprise_percent"] == 15.4
        assert norm["liquidity_metrics"]["price"] == 500.0


class TestGatekeeperNormalizeEvent:
    """Tests for normalize_event and detect_source."""

    def test_normalize_unknown_schema_returns_none(self, gatekeeper):
        assert gatekeeper.normalize_event({"foo": "bar"}) is None
        assert gatekeeper.normalize_event([]) is None

    def test_detect_source_from_field(self, gatekeeper):
        assert gatekeeper.detect_source({"source_hunter": "squeeze"}) == "squeeze"
        assert gatekeeper.detect_source({"hunter": "insider"}) == "insider"

    def test_detect_source_from_signal_data(self, gatekeeper):
        evt = {"signal_data": {"source_hunter": "biotech"}}
        assert gatekeeper.detect_source(evt) == "biotech"

    def test_detect_source_from_inferred_fields(self, gatekeeper):
        assert gatekeeper.detect_source({"short_float": 0.2}) == "squeeze"
        assert gatekeeper.detect_source({"transaction_code": "P"}) == "insider"
        assert gatekeeper.detect_source({"option_type": "put"}) == "whale"
        assert gatekeeper.detect_source({"drug_name": "MK-3475"}) == "biotech"
        assert gatekeeper.detect_source({"surprise_percent": 10.0}) == "drifter"


class TestGatekeeperRedisAndWorkflow:
    """Tests for Redis tracking and full process_event workflow."""

    def test_track_signal_and_accumulated_signals(self, gatekeeper):
        import json

        pipe_mock = MagicMock()
        gatekeeper.redis.pipeline.return_value = pipe_mock
        gatekeeper.redis.lrange.return_value = [
            json.dumps({"source_hunter": "whale", "signal_data": {"strike": 100}}),
            json.dumps({"source_hunter": "squeeze", "signal_data": {"short_float_pct": 25.0}}),
        ]

        norm = {
            "source_hunter": "whale",
            "signal_data": {"strike": 100},
        }
        gatekeeper.track_signal("AAPL", norm)
        pipe_mock.execute.assert_called_once()

        signals = gatekeeper.get_accumulated_signals("AAPL")
        assert len(signals) == 2
        assert signals[0]["source_hunter"] == "whale"
        assert signals[1]["source_hunter"] == "squeeze"

    def test_process_event_skips_unknown_schema(self, gatekeeper):
        gatekeeper.producer = MagicMock()
        gatekeeper.process_event({"invalid": "payload"})
        gatekeeper.producer.send.assert_not_called()

    def test_process_event_drops_unliquid_signal(self, gatekeeper):
        gatekeeper.producer = MagicMock()
        raw = {
            "source_hunter": "whale",
            "ticker": "PENNY",
            "price": 0.5,  # Below MIN_PRICE (2.0)
            "volume": 10_000,  # Below MIN_VOLUME
            "relative_volume": 0.5,
        }
        gatekeeper.process_event(raw)
        gatekeeper.producer.send.assert_not_called()

    def test_process_event_buffers_without_trigger(self, gatekeeper):
        gatekeeper.producer = MagicMock()
        gatekeeper.get_sources = MagicMock(return_value=["whale"])  # confluence = 1 (< 2)
        raw = {
            "source_hunter": "whale",
            "ticker": "AAPL",
            "option_type": "call",
            "price": 180.0,
            "volume": 2_000_000,
            "relative_volume": 2.5,
            "_technical_score": 50.0,  # Below TECHNICAL_SCORE_THRESHOLD (75.0)
        }
        gatekeeper.process_event(raw)
        gatekeeper.producer.send.assert_not_called()

    def test_process_event_triggers_and_forwards_on_confluence(self, gatekeeper):
        gatekeeper.producer = MagicMock()
        gatekeeper.consumer = MagicMock()
        gatekeeper.get_sources = MagicMock(return_value=["whale", "squeeze"])  # confluence = 2
        gatekeeper.was_recently_sent = MagicMock(return_value=False)
        gatekeeper.get_accumulated_signals = MagicMock(return_value=[{"source_hunter": "whale"}])

        raw = {
            "source_hunter": "squeeze",
            "ticker": "GME",
            "short_float": "35%",
            "price": 25.0,
            "volume": 1_000_000,
            "relative_volume": 3.0,
            "_technical_score": 60.0,
        }
        gatekeeper.process_event(raw)

        gatekeeper.producer.send.assert_called_once()
        sent_topic, payload = gatekeeper.producer.send.call_args[0]
        assert sent_topic == "triage-priority"
        assert payload["ticker"] == "GME"
        assert payload["confluence_count"] == 2
        gatekeeper.consumer.commit.assert_called_once()

    def test_process_event_triggers_and_forwards_on_technical_score(self, gatekeeper):
        gatekeeper.producer = MagicMock()
        gatekeeper.consumer = MagicMock()
        gatekeeper.get_sources = MagicMock(return_value=["biotech"])  # confluence = 1
        gatekeeper.was_recently_sent = MagicMock(return_value=False)
        gatekeeper.get_accumulated_signals = MagicMock(return_value=[{"source_hunter": "biotech"}])

        raw = {
            "source_hunter": "biotech",
            "ticker": "BIIB",
            "drug_name": "Aduhelm",
            "price": 200.0,
            "volume": 500_000,
            "relative_volume": 2.0,
            "_technical_score": 85.0,  # >= 75.0 triggers alone
        }
        gatekeeper.process_event(raw)

        gatekeeper.producer.send.assert_called_once()
        gatekeeper.consumer.commit.assert_called_once()

    def test_process_event_dedupes_when_already_sent(self, gatekeeper):
        gatekeeper.producer = MagicMock()
        gatekeeper.get_sources = MagicMock(return_value=["whale", "squeeze"])
        gatekeeper.was_recently_sent = MagicMock(return_value=True)  # Deduped

        raw = {
            "source_hunter": "whale",
            "ticker": "NVDA",
            "option_type": "call",
            "price": 125.0,
            "volume": 3_000_000,
            "relative_volume": 2.2,
        }
        gatekeeper.process_event(raw)
        gatekeeper.producer.send.assert_not_called()

    def test_gatekeeper_close(self, gatekeeper):
        gatekeeper.consumer = MagicMock()
        gatekeeper.producer = MagicMock()
        gatekeeper.close()
        gatekeeper.consumer.close.assert_called_once()
        gatekeeper.producer.close.assert_called_once()
        gatekeeper.redis.close.assert_called_once()

    def test_gatekeeper_run_error_handling(self, gatekeeper):
        msg = MagicMock()
        msg.value = {"source_hunter": "whale", "ticker": "BAD"}
        gatekeeper.consumer = [msg]
        gatekeeper.process_event = MagicMock(side_effect=RuntimeError("Corrupt payload"))

        # Should not raise exception out of run()
        gatekeeper.run()
        gatekeeper.process_event.assert_called_once_with(msg.value)
