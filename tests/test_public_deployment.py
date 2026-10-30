import json
import re
import subprocess
from datetime import datetime
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock
from urllib.parse import parse_qs, urlsplit

import pytest

from ai_layer.ai_service import AIAnalysisService
from ai_layer.request_budget import reserve_request
from deploy.export_snapshot import (
    BENCHMARK_SYMBOLS,
    collect_benchmarks,
    empty_snapshot,
    validate_snapshot,
)
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


def test_benchmark_collection_encodes_index_symbols_and_records_utc_retrieval():
    response = MagicMock()
    response.json.return_value = [
        {"ticker": symbol, "price": 100.0} for symbol in BENCHMARK_SYMBOLS
    ]
    client = MagicMock()
    client.get.return_value = response
    quotes, retrieved = collect_benchmarks(client)
    path = client.get.call_args.args[0]
    assert "%5E" in path
    assert parse_qs(urlsplit(path).query)["symbols"] == [",".join(BENCHMARK_SYMBOLS)]
    assert len(quotes) == 19
    assert datetime.fromisoformat(retrieved).utcoffset().total_seconds() == 0


def test_missing_benchmark_prices_do_not_get_retrieval_timestamp():
    client = MagicMock()
    client.get.return_value.json.return_value = [{"ticker": symbol} for symbol in BENCHMARK_SYMBOLS]
    quotes, retrieved = collect_benchmarks(client)
    assert len(quotes) == 19
    assert retrieved is None


def test_snapshot_rejects_unbounded_benchmark_response():
    data = empty_snapshot("test", "2026-10-04T12:00:00Z")
    data["benchmarks"] = [{"ticker": "SPY"}] * 20
    with pytest.raises(ValueError, match="benchmark bound"):
        validate_snapshot(data)


def test_benchmark_collection_retains_no_data_from_unexpected_symbols():
    client = MagicMock()
    client.get.return_value.json.return_value = [{"ticker": "UNEXPECTED", "price": 100.0}]
    assert collect_benchmarks(client) == ([], None)


ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize("dockerfile", ["gatekeeper/Dockerfile", "deploy/Dockerfile.pipeline"])
def test_gatekeeper_images_include_shared_ticker_helper(dockerfile):
    text = (ROOT / dockerfile).read_text()
    assert "COPY hunters/common/__init__.py hunters/common/tickers.py /app/hunters/common/" in text


@pytest.mark.parametrize("script", sorted((ROOT / "deploy").glob("*.sh")), ids=lambda p: p.name)
def test_deploy_scripts_parse(script):
    subprocess.run(["bash", "-n", str(script)], check=True)


def test_batch_installs_next_launcher_only_after_publication():
    batch = (ROOT / "deploy" / "batch.sh").read_text()
    assert batch.index("install -m 700 run-worker.sh") > batch.index('data/manifest.json"')


def test_public_configure_keeps_the_free_sources():
    source = (ROOT / "scripts" / "public_demo.py").read_text()
    assert 'squeeze_provider = "yahoo"' in source
    assert 'biotech_provider = "pdufa"' in source


def test_local_compose_binds_published_ports_to_localhost():
    for value in re.findall(r'"([^"]+)"', (ROOT / "docker-compose.yml").read_text()):
        if re.fullmatch(r"\d+:\d+", value):
            raise AssertionError(f"published on every interface: {value}")


def test_batch_keeps_confluence_across_daily_runs():
    compose = (ROOT / "deploy" / "compose.batch.yml").read_text()
    assert "--appendonly" in compose
    assert "redis-data:" in compose
    assert 'GATEKEEPER_ROLLING_WINDOW_SECONDS: "604800"' in compose
    assert "KAFKA_OFFSETS_RETENTION_MINUTES: 43200" in compose


def test_batch_compose_modules_are_runnable():
    compose = (ROOT / "deploy" / "compose.batch.yml").read_text()
    modules = re.findall(r"command: \[python, -m, ([\w.]+)", compose)
    assert "resolver.main" in modules
    for module in modules:
        source = (ROOT / Path(*module.split("."))).with_suffix(".py").read_text()
        assert 'if __name__ == "__main__":' in source, module
