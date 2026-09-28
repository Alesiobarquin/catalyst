"""API smoke tests for health and auth-protected routes."""

from collections.abc import AsyncGenerator

from fastapi.testclient import TestClient

import api.db as db
from api.main import create_app


async def _noop() -> None:
    return None


async def _dummy_conn() -> AsyncGenerator[None, None]:
    yield None


def make_test_client() -> TestClient:
    """Create app with DB lifespan and DB dependency patched out."""
    db.init_pool = _noop  # type: ignore[assignment]
    db.close_pool = _noop  # type: ignore[assignment]
    app = create_app()
    app.dependency_overrides[db.get_conn] = _dummy_conn
    return TestClient(app)


def test_health_endpoint_ok():
    with make_test_client() as client:
        res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["service"] == "catalyst-api"
    assert data["version"] == "1.0.0"
    assert "uptime_seconds" in data
    assert "pool" in data
    assert "size" in data["pool"]


def test_executions_me_requires_bearer_token():
    with make_test_client() as client:
        res = client.get("/executions/me")
    assert res.status_code == 401
    assert "Bearer token required" in res.json()["detail"]


def test_settings_alpaca_requires_bearer_token():
    with make_test_client() as client:
        res = client.get("/settings/alpaca")
    assert res.status_code == 401
    assert "Bearer token required" in res.json()["detail"]


def test_market_history_invalid_from_timestamp_returns_422():
    with make_test_client() as client:
        res = client.get("/market/NVDA/history?from=not-a-date")
    assert res.status_code == 422
    assert "Invalid `from` timestamp" in res.json()["detail"]


def test_performance_batch_invalid_ids_returns_422():
    with make_test_client() as client:
        res = client.get("/performance/batch?ids=1,abc,3")
    assert res.status_code == 422
    assert "comma-separated integers" in res.json()["detail"]


def test_performance_batch_over_limit_returns_422():
    ids = ",".join(str(i) for i in range(1, 25))
    with make_test_client() as client:
        res = client.get(f"/performance/batch?ids={ids}")
    assert res.status_code == 422
    assert "Maximum 20 IDs" in res.json()["detail"]


def test_health_pipeline():
    from unittest.mock import AsyncMock, patch

    with (
        patch("api.main.ping_database", new_callable=AsyncMock) as mock_ping,
        patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_http,
    ):
        mock_ping.return_value = "ok"
        mock_resp = AsyncMock()
        mock_resp.status_code = 200
        from unittest.mock import MagicMock

        mock_resp.json = MagicMock(return_value={"status": "UP"})
        mock_http.return_value = mock_resp

        with make_test_client() as client:
            res = client.get("/health/pipeline")
        assert res.status_code == 200
        data = res.json()
        assert data["api"] == "ok"
        assert data["database"] == "ok"
        assert data["engine"] == "UP"
        assert data["ready"] is True


def test_signals_list_and_by_ticker():
    from datetime import datetime, timezone
    from unittest.mock import AsyncMock

    mock_conn = AsyncMock()
    mock_conn.fetchval.return_value = 1
    mock_conn.fetch.return_value = [
        {
            "id": 1,
            "ticker": "NVDA",
            "timestamp_utc": datetime(2026, 9, 27, 12, 0, tzinfo=timezone.utc),
            "conviction_score": 85,
            "catalyst_type": "SUPERNOVA",
            "rationale": "High short interest",
            "is_trap": False,
            "confluence_sources": '["squeeze", "whale"]',
            "key_risks": '["Earnings volatility"]',
        }
    ]

    async def _mock_conn_generator():
        yield mock_conn

    app = create_app()
    app.dependency_overrides[db.get_conn] = _mock_conn_generator

    with TestClient(app) as client:
        # 1. Test /signals
        res = client.get("/signals")
        assert res.status_code == 200
        data = res.json()
        assert data["total"] == 1
        assert len(data["items"]) == 1
        assert data["items"][0]["confluence_sources"] == ["squeeze", "whale"]
        assert data["items"][0]["key_risks"] == ["Earnings volatility"]

        # 2. Test /signals/{ticker}
        res_ticker = client.get("/signals/NVDA")
        assert res_ticker.status_code == 200
        data_ticker = res_ticker.json()
        assert len(data_ticker) == 1
        assert data_ticker[0]["ticker"] == "NVDA"
        assert data_ticker[0]["confluence_sources"] == ["squeeze", "whale"]
        assert data_ticker[0]["key_risks"] == ["Earnings volatility"]

        # 3. Test /signals with filters
        res_filtered = client.get(
            "/signals?catalyst_type=SUPERNOVA&min_conviction=80&is_trap=false&ticker=NVDA"
        )
        assert res_filtered.status_code == 200
        assert res_filtered.json()["total"] == 1


def test_market_quote_success():
    from unittest.mock import MagicMock, patch

    mock_fast_info = MagicMock()
    mock_fast_info.last_price = 125.50
    mock_fast_info.previous_close = 120.00
    mock_fast_info.day_high = 127.00
    mock_fast_info.day_low = 123.00
    mock_fast_info.last_volume = 45000000
    mock_fast_info.year_high = 140.00
    mock_fast_info.year_low = 80.00
    mock_fast_info.market_cap = 3000000000000

    mock_ticker_instance = MagicMock()
    mock_ticker_instance.fast_info = mock_fast_info

    with (
        patch("yfinance.Ticker", return_value=mock_ticker_instance),
        make_test_client() as client,
    ):
        res = client.get("/market/NVDA/quote")

    assert res.status_code == 200
    data = res.json()
    assert data["ticker"] == "NVDA"
    assert data["price"] == 125.50
    assert data["change"] == 5.50
    assert data["change_percent"] == 4.58
    assert data["day_high"] == 127.00
    assert data["volume"] == 45000000


def test_delete_alpaca_keys_requires_auth():
    with make_test_client() as client:
        res = client.delete("/settings/alpaca")
    assert res.status_code == 401
    assert "Bearer token required" in res.json()["detail"]


def test_delete_alpaca_keys_authenticated():
    from unittest.mock import AsyncMock

    mock_conn = AsyncMock()

    async def _mock_conn_generator():
        yield mock_conn

    app = create_app()
    app.dependency_overrides[db.get_conn] = _mock_conn_generator

    # Override require_clerk_user dependency
    from api.auth import require_clerk_user

    app.dependency_overrides[require_clerk_user] = lambda: {"sub": "user_12345"}

    with TestClient(app) as client:
        res = client.delete("/settings/alpaca")

    assert res.status_code == 200
    assert res.json() == {"ok": True}
    mock_conn.execute.assert_called_once()


def test_export_signals_csv():
    from datetime import datetime, timezone
    from unittest.mock import AsyncMock

    now = datetime.now(timezone.utc)
    mock_conn = AsyncMock()
    mock_conn.fetch.return_value = [
        {
            "time": now,
            "ticker": "TSLA",
            "conviction_score": 85,
            "catalyst_type": "SUPERNOVA",
            "is_trap": False,
            "trap_reason": None,
            "rationale": "High short interest and volume spike",
            "confluence_count": 2,
            "suggested_entry_zone": "$240 - $245",
            "suggested_stop": "$230",
            "risk_level": "MODERATE",
            "suggested_timeframe": "SWING",
        }
    ]

    async def _mock_conn_generator():
        yield mock_conn

    app = create_app()
    app.dependency_overrides[db.get_conn] = _mock_conn_generator

    with TestClient(app) as client:
        res = client.get("/signals/export/csv?catalyst_type=SUPERNOVA")

    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    assert "attachment; filename=" in res.headers["content-disposition"]
    lines = res.text.strip().splitlines()
    assert "time,ticker,conviction_score" in lines[0]
    assert "TSLA" in lines[1]
    assert "SUPERNOVA" in lines[1]
