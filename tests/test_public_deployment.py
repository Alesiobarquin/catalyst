import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from ai_layer.ai_service import AIAnalysisService
from ai_layer.request_budget import reserve_request
from deploy.export_snapshot import empty_snapshot, validate_snapshot
from hunters import squeeze_hunter
from hunters.main import run_hunter


def test_ai_budget_persists_failed_attempt_reservations(tmp_path, monkeypatch):
    path = tmp_path / "budget.json"
    monkeypatch.setenv("AI_DAILY_REQUEST_LIMIT", "2")
    monkeypatch.setenv("AI_BUDGET_FILE", str(path))
    reserve_request()
    reserve_request()
    with pytest.raises(RuntimeError, match="exhausted"):
        reserve_request()
    assert json.loads(path.read_text())["count"] == 2


def test_ai_budget_resets_on_new_day(tmp_path, monkeypatch):
    path = tmp_path / "budget.json"
    path.write_text(json.dumps({"day": "2000-01-01", "count": 500}))
    monkeypatch.setenv("AI_DAILY_REQUEST_LIMIT", "2")
    monkeypatch.setenv("AI_BUDGET_FILE", str(path))
    reserve_request()
    assert json.loads(path.read_text())["count"] == 1


def test_public_ai_never_publishes_heuristic_after_failure(monkeypatch):
    monkeypatch.setenv("AI_ALLOW_HEURISTIC_FALLBACK", "false")
    service = AIAnalysisService.__new__(AIAnalysisService)
    service.analyze_with_retry = MagicMock(side_effect=RuntimeError("quota unavailable"))
    service.producer = MagicMock()
    service.process_event({"ticker": "NVDA", "signals": []})
    service.producer.send.assert_not_called()


def test_snapshot_rejects_heuristic_and_broker_data():
    data = empty_snapshot("test", "2026-10-04T12:00:00Z")
    data["signals"] = [{"analysis_method": "heuristic"}]
    with pytest.raises(ValueError, match="provenance"):
        validate_snapshot(data)
    data["signals"] = []
    data["orders"] = [{"execution": {"alpaca_order_id": "private"}}]
    with pytest.raises(ValueError, match="Broker"):
        validate_snapshot(data)


def test_snapshot_rejects_secret_content(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "private-test-key")
    data = empty_snapshot("test", "2026-10-04T12:00:00Z")
    data["commit"] = "private-test-key"
    with pytest.raises(ValueError, match="Secret"):
        validate_snapshot(data)


@pytest.mark.asyncio
async def test_one_shot_hunter_exits_without_sleep(monkeypatch):
    fetch = AsyncMock(return_value=[])
    sleep = AsyncMock()
    monkeypatch.setattr(squeeze_hunter, "fetch_squeeze_targets", fetch)
    monkeypatch.setattr(squeeze_hunter.asyncio, "sleep", sleep)
    outcome = await run_hunter("squeeze", timeout_sec=1, once=True)
    assert outcome["success"]
    fetch.assert_awaited_once()
    sleep.assert_not_awaited()


@pytest.mark.asyncio
async def test_public_hunter_report_redacts_provider_exception(monkeypatch):
    monkeypatch.setattr(
        squeeze_hunter, "run", AsyncMock(side_effect=RuntimeError("https://provider?apikey=secret"))
    )
    outcome = await run_hunter("squeeze", once=True)
    assert outcome["error"] == "RuntimeError"
    assert not outcome["success"]
