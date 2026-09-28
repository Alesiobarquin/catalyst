"""Unit tests for utility scripts: confluence_watcher and inject_synthetic_signals."""

from unittest.mock import MagicMock

from scripts.confluence_watcher import inspect_confluence
from scripts.inject_synthetic_signals import (
    create_insider_event,
    create_squeeze_event,
    inject_events,
)


class TestConfluenceWatcher:
    def test_inspect_confluence_empty(self):
        mock_redis = MagicMock()
        mock_redis.scan.return_value = (0, [])
        found = inspect_confluence(mock_redis)
        assert found == []

    def test_inspect_confluence_below_threshold(self):
        mock_redis = MagicMock()
        mock_redis.scan.return_value = (0, [b"gk:sources:AAPL"])
        mock_redis.smembers.return_value = {b"squeeze"}
        found = inspect_confluence(mock_redis, min_sources=2)
        assert found == []

    def test_inspect_confluence_meets_threshold(self):
        mock_redis = MagicMock()
        mock_redis.scan.return_value = (0, [b"gk:sources:NVDA"])
        mock_redis.smembers.return_value = {b"squeeze", b"insider"}
        mock_redis.ttl.return_value = 240
        found = inspect_confluence(mock_redis, min_sources=2)
        assert len(found) == 1
        assert found[0]["ticker"] == "NVDA"
        assert found[0]["count"] == 2
        assert found[0]["sources"] == ["insider", "squeeze"]
        assert found[0]["ttl_seconds"] == 240


class TestInjectSyntheticSignals:
    def test_create_squeeze_event(self):
        event = create_squeeze_event("aapl", price=150.0, volume=1_000_000, relative_volume=2.5)
        assert event["ticker"] == "AAPL"
        assert event["hunter"] == "squeeze"
        assert event["price"] == 150.0
        assert event["volume"] == 1_000_000
        assert event["relative_volume"] == 2.5
        assert "timestamp" in event

    def test_create_insider_event(self):
        event = create_insider_event("tsla", price=200.0, amount_usd=1_000_000)
        assert event["ticker"] == "TSLA"
        assert event["hunter"] == "insider"
        assert event["transaction_code"] == "P"
        assert event["transaction_amount_usd"] == 1_000_000
        assert "timestamp" in event

    def test_inject_events(self):
        mock_producer = MagicMock()
        mock_future = MagicMock()
        mock_record = MagicMock()
        mock_record.topic = "raw-events"
        mock_record.partition = 0
        mock_record.offset = 42
        mock_future.get.return_value = mock_record
        mock_producer.send.return_value = mock_future

        events = [create_squeeze_event("NVDA")]
        inject_events(mock_producer, "raw-events", events, delay_sec=0)

        assert mock_producer.send.call_count == 1
        assert mock_producer.flush.call_count == 1
