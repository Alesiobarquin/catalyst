"""Unit tests for /executions router (paper trading telemetry)."""

from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

import api.db as db
from api.auth import require_clerk_user
from api.main import create_app


async def _noop() -> None:
    return None


async def _dummy_conn() -> AsyncGenerator[None, None]:
    yield None


def make_test_client() -> TestClient:
    db.init_pool = _noop  # type: ignore[assignment]
    db.close_pool = _noop  # type: ignore[assignment]
    app = create_app()
    app.dependency_overrides[db.get_conn] = _dummy_conn
    return TestClient(app)


def test_executions_me_requires_auth():
    with make_test_client() as client:
        res = client.get("/executions/me")
    assert res.status_code == 401
    assert "Bearer token required" in res.json()["detail"]


def test_executions_summary_requires_auth():
    with make_test_client() as client:
        res = client.get("/executions/summary")
    assert res.status_code == 401
    assert "Bearer token required" in res.json()["detail"]


def test_executions_me_list_with_filters():
    mock_conn = AsyncMock()
    mock_records = [
        {
            "id": 1,
            "trade_order_id": 42,
            "timestamp_utc": datetime(2026, 3, 20, 14, 30, tzinfo=timezone.utc),
            "ticker": "NVDA",
            "alpaca_order_id": "alpaca-ord-123",
            "execution_status": "filled",
            "filled_avg_price": 125.50,
            "error_message": None,
        }
    ]
    mock_conn.fetch.return_value = mock_records

    async def _mock_conn():
        yield mock_conn

    db.init_pool = _noop  # type: ignore[assignment]
    db.close_pool = _noop  # type: ignore[assignment]
    app = create_app()
    app.dependency_overrides[db.get_conn] = _mock_conn
    app.dependency_overrides[require_clerk_user] = lambda: {"sub": "user_alice"}

    with TestClient(app) as client:
        res = client.get("/executions/me?status=filled&ticker=nvda&limit=50")

    assert res.status_code == 200
    data = res.json()
    assert len(data) == 1
    assert data[0]["ticker"] == "NVDA"
    assert data[0]["execution_status"] == "filled"
    assert data[0]["filled_avg_price"] == 125.50

    # Ensure status, ticker, and user ID were passed to query
    mock_conn.fetch.assert_called_once()
    called_args = mock_conn.fetch.call_args[0]
    sql = called_args[0]
    assert "e.clerk_user_id = $1" in sql
    assert "LOWER(e.execution_status) = $2" in sql
    assert "t.ticker = $3" in sql
    assert called_args[1] == "user_alice"
    assert called_args[2] == "filled"
    assert called_args[3] == "NVDA"
    assert called_args[4] == 50


def test_executions_summary_metrics():
    mock_conn = AsyncMock()
    mock_conn.fetchrow.return_value = {
        "total_executions": 10,
        "filled_count": 8,
        "failed_count": 1,
        "pending_count": 1,
        "total_volume_usd": 25000.0,
    }

    async def _mock_conn():
        yield mock_conn

    db.init_pool = _noop  # type: ignore[assignment]
    db.close_pool = _noop  # type: ignore[assignment]
    app = create_app()
    app.dependency_overrides[db.get_conn] = _mock_conn
    app.dependency_overrides[require_clerk_user] = lambda: {"sub": "user_alice"}

    with TestClient(app) as client:
        res = client.get("/executions/summary")

    assert res.status_code == 200
    data = res.json()
    assert data["total_executions"] == 10
    assert data["filled_count"] == 8
    assert data["failed_count"] == 1
    assert data["pending_count"] == 1
    assert data["fill_rate_percent"] == 80.0
    assert data["total_volume_usd"] == 25000.0


def test_executions_summary_empty_defaults():
    mock_conn = AsyncMock()
    mock_conn.fetchrow.return_value = {
        "total_executions": 0,
        "filled_count": 0,
        "failed_count": 0,
        "pending_count": 0,
        "total_volume_usd": 0.0,
    }

    async def _mock_conn():
        yield mock_conn

    db.init_pool = _noop  # type: ignore[assignment]
    db.close_pool = _noop  # type: ignore[assignment]
    app = create_app()
    app.dependency_overrides[db.get_conn] = _mock_conn
    app.dependency_overrides[require_clerk_user] = lambda: {"sub": "user_bob"}

    with TestClient(app) as client:
        res = client.get("/executions/summary")

    assert res.status_code == 200
    data = res.json()
    assert data["total_executions"] == 0
    assert data["fill_rate_percent"] == 0.0
    assert data["total_volume_usd"] == 0.0
