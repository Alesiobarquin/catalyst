"""Offline regressions for the optional Yahoo squeeze source."""

import json
import subprocess
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
import yfinance as yf
from curl_cffi import requests

from hunters.common import yahoo_screener as screener
from hunters.common.provider_errors import ProviderError


def _quote(**overrides):
    quote = {
        "symbol": "NVAX",
        "regularMarketPrice": 12.75,
        "regularMarketVolume": 19_026_371,
        "averageDailyVolume3Month": 5_430_568,
        "regularMarketTime": 1_791_576_000,
    }
    quote.update(overrides)
    return quote


def _info(**overrides):
    info = {
        "shortPercentOfFloat": 0.28100002,
        "shortRatio": 8.08,
        "dateShortInterest": 1_790_726_400,
    }
    info.update(overrides)
    return info


def _mock_source(monkeypatch, quotes, info=None):
    screen = Mock(return_value={"quotes": quotes, "total": len(quotes)})
    ticker = Mock(
        return_value=SimpleNamespace(get_info=Mock(return_value=_info() if info is None else info))
    )
    session = Mock()
    session.__enter__ = Mock(return_value=session)
    session.__exit__ = Mock(return_value=False)
    monkeypatch.setattr(screener, "_DeadlineSession", Mock(return_value=session))
    monkeypatch.setattr(screener.time, "monotonic", lambda: 100.0)
    monkeypatch.setattr(yf, "screen", screen)
    monkeypatch.setattr(yf, "Ticker", ticker)
    return screen, ticker


def test_preserves_measured_metrics_dates_and_bounded_query(monkeypatch):
    screen, ticker = _mock_source(monkeypatch, [_quote()])
    events = screener._collect_targets(40, 155.0)
    assert len(events) == 1
    event = events[0]
    assert event["short_float"] == pytest.approx(28.100002)
    assert event["days_to_cover"] == 8.08
    assert event["relative_volume"] == round(19_026_371 / 5_430_568, 4)
    assert event["source"] == "yahoo_equity_screener"
    assert event["source_hunter"] == "squeeze"
    assert event["quote_timestamp_utc"] == datetime.fromtimestamp(1_791_576_000, UTC).isoformat()
    assert (
        event["short_interest_timestamp_utc"]
        == datetime.fromtimestamp(1_790_726_400, UTC).isoformat()
    )
    assert datetime.fromisoformat(event["timestamp_utc"]).tzinfo is not None
    assert event["screener_candidate_limit"] == 40
    query = screen.call_args.args[0].to_dict()
    fields = {operand["operands"][0] for operand in query["operands"]}
    assert fields == {
        "region",
        "intradayprice",
        "dayvolume",
        "short_percentage_of_float.value",
        "days_to_cover_short.value",
    }
    assert screen.call_args.kwargs["size"] == 40
    assert screen.call_args.kwargs["sortField"] == "dayvolume"
    ticker.assert_called_once()


@pytest.mark.parametrize(
    "overrides",
    [
        {"regularMarketPrice": 1.99},
        {"regularMarketPrice": 60.01},
        {"regularMarketVolume": 199_999},
        {"regularMarketVolume": 8_000_000},
        {"regularMarketPrice": None},
        {"regularMarketPrice": float("nan")},
        {"regularMarketVolume": True},
        {"averageDailyVolume3Month": None},
        {"averageDailyVolume3Month": 0},
        {"symbol": "invalid ticker"},
    ],
)
def test_rejects_missing_and_out_of_range_quotes_before_info(monkeypatch, overrides):
    _, ticker = _mock_source(monkeypatch, [_quote(**overrides)])
    assert screener._collect_targets(40, 155.0) == []
    ticker.assert_not_called()


@pytest.mark.parametrize(
    "overrides",
    [
        {"shortPercentOfFloat": None},
        {"shortPercentOfFloat": 0.2499},
        {"shortPercentOfFloat": float("inf")},
        {"shortRatio": None},
        {"shortRatio": 2.99},
    ],
)
def test_never_fills_missing_or_insufficient_short_metrics(monkeypatch, overrides):
    _mock_source(monkeypatch, [_quote()], _info(**overrides))
    assert screener._collect_targets(40, 155.0) == []


def test_empty_info_never_becomes_a_default_short_interest(monkeypatch):
    _mock_source(monkeypatch, [_quote()], {})
    assert screener._collect_targets(40, 155.0) == []


def test_caps_candidates_and_deduplicates_symbols(monkeypatch):
    _, ticker = _mock_source(monkeypatch, [_quote(), _quote(), _quote(symbol="EOSE")])
    events = screener._collect_targets(2, 155.0)
    assert len(events) == 1
    assert events[0]["screener_candidates_considered"] == 2
    ticker.assert_called_once()


def test_legitimate_empty_screen_is_empty(monkeypatch):
    _, ticker = _mock_source(monkeypatch, [])
    assert screener._collect_targets(40, 155.0) == []
    ticker.assert_not_called()


def test_bad_screen_schema_is_reported(monkeypatch):
    screen, _ = _mock_source(monkeypatch, [])
    screen.return_value = {"quotes": None}
    with pytest.raises(ProviderError, match="unexpected response format"):
        screener._collect_targets(40, 155.0)


def test_deadline_stops_enrichment(monkeypatch):
    _mock_source(monkeypatch, [_quote()])
    monkeypatch.setattr(screener.time, "monotonic", lambda: 156.0)
    with pytest.raises(ProviderError) as failure:
        screener._collect_targets(40, 155.0)
    assert failure.value.code == "deadline"


def test_session_caps_sdk_timeout_and_remaining_budget(monkeypatch):
    monkeypatch.setattr(screener.time, "monotonic", lambda: 100.0)
    request = Mock(return_value=object())
    monkeypatch.setattr(requests.Session, "request", request)
    with screener._DeadlineSession(155.0) as session:
        session.get("https://example.com", timeout=30)
        assert request.call_args.kwargs["timeout"] == 8.0
        session.deadline = 103.0
        session.get("https://example.com", timeout=30)
        assert request.call_args.kwargs["timeout"] == 3.0
        session.deadline = 100.0
        with pytest.raises(TimeoutError):
            session.get("https://example.com")
    assert request.call_count == 2


def test_wrapper_isolates_session_and_clamps_limits(monkeypatch):
    run = Mock(return_value=SimpleNamespace(returncode=0, stdout='{"events": []}'))
    monkeypatch.setattr(screener.subprocess, "run", run)
    monkeypatch.setattr(screener.time, "monotonic", lambda: 100.0)
    assert screener.fetch_yahoo_squeeze_targets(max_candidates=200, timeout_seconds=100) == []
    assert run.call_args.args[0][-2:] == ["-m", "hunters.common.yahoo_screener"]
    assert run.call_args.kwargs["timeout"] == 55.0
    parameters = json.loads(run.call_args.kwargs["input"])
    assert parameters == {"max_candidates": 40, "deadline": 155.0}


def test_wrapper_timeout_discards_captured_source_details(monkeypatch):
    secret = "private-request-url-and-key"
    run = Mock(side_effect=subprocess.TimeoutExpired("worker", 55, output=secret, stderr=secret))
    monkeypatch.setattr(screener.subprocess, "run", run)
    with pytest.raises(ProviderError) as failure:
        screener.fetch_yahoo_squeeze_targets()
    assert failure.value.code == "deadline"
    assert secret not in str(failure.value)


def test_wrapper_does_not_trust_child_error_text(monkeypatch):
    run = Mock(
        return_value=SimpleNamespace(
            returncode=0,
            stdout='{"error": "secret-key-and-url", "status": 403}',
        )
    )
    monkeypatch.setattr(screener.subprocess, "run", run)
    with pytest.raises(ProviderError) as failure:
        screener.fetch_yahoo_squeeze_targets()
    assert failure.value.code == "source_unavailable"
    assert failure.value.status == 403
    assert "secret-key-and-url" not in str(failure.value)
