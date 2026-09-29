"""Unit tests for utility scripts: confluence_watcher and inject_synthetic_signals."""

from unittest.mock import MagicMock, patch

from scripts.confluence_watcher import inspect_confluence
from scripts.inject_synthetic_signals import (
    create_insider_event,
    create_squeeze_event,
    inject_events,
)
from scripts.verify_pipeline_health import (
    check_api,
    check_engine,
    check_redis,
    evaluate_overall_health,
    format_report,
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

    def test_inspect_confluence_zset_meets_threshold(self):
        mock_redis = MagicMock()
        # First scan call (zset match) returns key, second scan call (set match) returns empty
        mock_redis.scan.side_effect = [
            (0, [b"gk:sources_zset:TSLA"]),
            (0, []),
        ]
        mock_redis.zrange.return_value = [b"squeeze", b"whale"]
        mock_redis.ttl.return_value = 280
        found = inspect_confluence(mock_redis, min_sources=2)
        assert len(found) == 1
        assert found[0]["ticker"] == "TSLA"
        assert found[0]["count"] == 2
        assert found[0]["sources"] == ["squeeze", "whale"]
        assert found[0]["ttl_seconds"] == 280
        mock_redis.zremrangebyscore.assert_called_once()



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


class TestVerifyPipelineHealth:
    def test_check_api_success(self):
        with patch("scripts.verify_pipeline_health.fetch_url") as mock_fetch:
            mock_fetch.side_effect = [
                (200, '{"status": "ok", "uptime_seconds": 123.4, "pool": {"size": 4}}'),
                (200, '{"api": "ok", "database": "ok", "redis": "ok", "engine": "UP", "ready": true}'),
            ]
            res = check_api("http://localhost:8000")
            assert res["status"] == "OK"
            assert res["uptime_seconds"] == 123.4
            assert res["pool_size"] == 4
            assert res["database"] == "ok"
            assert res["redis"] == "ok"
            assert res["engine_reported"] == "UP"
            assert res["pipeline_ready"] is True

    def test_check_api_down(self):
        with patch("scripts.verify_pipeline_health.fetch_url") as mock_fetch:
            mock_fetch.return_value = (None, "Connection refused")
            res = check_api("http://localhost:8000")
            assert res["status"] == "DOWN"
            assert res["pipeline_ready"] is False

    def test_check_engine_up(self):
        with patch("scripts.verify_pipeline_health.fetch_url") as mock_fetch:
            mock_fetch.return_value = (200, '{"status": "UP"}')
            res = check_engine("http://localhost:8081/actuator/health")
            assert res["status"] == "UP"

    def test_check_redis(self):
        mock_client = MagicMock()
        mock_client.ping.return_value = True
        mock_client.scan.return_value = (0, [b"gk:sources:NVDA", b"gk:sources:AAPL"])

        with patch("redis.Redis", return_value=mock_client):
            res = check_redis("localhost", 6379)
            assert res["status"] == "UP"
            assert res["active_confluence_keys"] == 2
            assert res["latency_ms"] >= 0.0

    def test_evaluate_overall_health(self):
        healthy = {
            "api": {"status": "OK", "database": "ok", "redis": "ok", "engine_reported": "UP", "pipeline_ready": True},
            "redis": {"status": "UP", "latency_ms": 1.2, "active_confluence_keys": 3},
            "engine": {"status": "UP"},
        }
        assert evaluate_overall_health(healthy, require_engine=True) is True
        report = format_report(healthy, True)
        assert "ALL SYSTEMS OPERATIONAL" in report

        degraded = {
            "api": {"status": "OK", "database": "ok", "redis": "error"},
            "redis": {"status": "DOWN"},
            "engine": {"status": "DOWN"},
        }
        assert evaluate_overall_health(degraded, require_engine=True) is False
        report_degraded = format_report(degraded, False)
        assert "PIPELINE DEGRADED / UNHEALTHY" in report_degraded
