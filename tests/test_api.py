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


def test_stream_signals_sse():
    from unittest.mock import AsyncMock

    mock_conn = AsyncMock()
    mock_conn.fetch.return_value = []

    async def _mock_conn_generator():
        yield mock_conn

    app = create_app()
    app.dependency_overrides[db.get_conn] = _mock_conn_generator

    with (
        TestClient(app) as client,
        client.stream("GET", "/signals/stream?min_conviction=75&max_events=0") as response,
    ):
        assert response.status_code == 200
        assert "text/event-stream" in response.headers["content-type"]
        chunk = next(response.iter_text())
        assert "event: connected" in chunk
        assert "stream_active" in chunk


def test_security_headers_present():
    with make_test_client() as client:
        res = client.get("/health")
    assert res.status_code == 200
    assert res.headers.get("x-content-type-options") == "nosniff"
    assert res.headers.get("x-frame-options") == "DENY"
    assert res.headers.get("x-xss-protection") == "1; mode=block"
    assert res.headers.get("referrer-policy") == "strict-origin-when-cross-origin"


def test_market_search_tickers():
    from unittest.mock import AsyncMock

    mock_conn = AsyncMock()
    mock_conn.fetch.return_value = [{"ticker": "NVDA"}, {"ticker": "NVO"}]

    async def _mock_conn_generator():
        yield mock_conn

    app = create_app()
    app.dependency_overrides[db.get_conn] = _mock_conn_generator

    with TestClient(app) as client:
        res = client.get("/market/search?q=NV")

    assert res.status_code == 200
    data = res.json()
    assert len(data) == 2
    assert data[0]["ticker"] == "NVDA"
    assert data[1]["ticker"] == "NVO"


def test_market_history_empty_returns_404():
    from unittest.mock import patch

    import pandas as pd

    with (
        patch("api.routers.market._fetch_history", return_value=pd.DataFrame()),
        make_test_client() as client,
    ):
        res = client.get("/market/NVDA/history?from=2026-03-01T00:00:00Z")

    assert res.status_code == 404
    assert "No price data found" in res.json()["detail"]


def test_market_history_success():
    from unittest.mock import patch

    import pandas as pd

    df = pd.DataFrame(
        {
            "Open": [120.0],
            "High": [125.0],
            "Low": [119.0],
            "Close": [124.0],
            "Volume": [10000000],
        },
        index=[pd.Timestamp("2026-03-01 00:00:00+0000", tz="UTC")],
    )

    with (
        patch("api.routers.market._fetch_history", return_value=df),
        make_test_client() as client,
    ):
        res = client.get("/market/NVDA/history?from=2026-03-01T00:00:00Z")

    assert res.status_code == 200
    bars = res.json()
    assert len(bars) == 1
    assert bars[0]["open"] == 120.0
    assert bars[0]["high"] == 125.0
    assert bars[0]["close"] == 124.0


def test_save_alpaca_keys_requires_auth():
    with make_test_client() as client:
        res = client.post("/settings/alpaca", json={"api_key": "PKTEST123456", "secret_key": "SKTEST123456"})
    assert res.status_code == 401
    assert "Bearer token required" in res.json()["detail"]


def test_save_alpaca_keys_invalid_credentials_returns_400():
    from unittest.mock import AsyncMock, patch

    from api.auth import require_clerk_user

    mock_conn = AsyncMock()

    async def _mock_conn_generator():
        yield mock_conn

    app = create_app()
    app.dependency_overrides[db.get_conn] = _mock_conn_generator
    app.dependency_overrides[require_clerk_user] = lambda: {"sub": "user_12345"}

    with (
        patch("api.routers.settings.verify_alpaca_credentials", return_value=(False, "Invalid Alpaca API Key ID or Secret Key (authentication failed)")),
        TestClient(app) as client,
    ):
        res = client.post(
            "/settings/alpaca",
            json={"api_key": "PKINVALIDKEY", "secret_key": "SKINVALIDSECRET", "validate_credentials": True},
        )

    assert res.status_code == 400
    assert "Invalid Alpaca API Key" in res.json()["detail"]
    mock_conn.execute.assert_not_called()


def test_save_alpaca_keys_valid_credentials_succeeds():
    from unittest.mock import AsyncMock, patch

    from api.auth import require_clerk_user

    mock_conn = AsyncMock()

    async def _mock_conn_generator():
        yield mock_conn

    app = create_app()
    app.dependency_overrides[db.get_conn] = _mock_conn_generator
    app.dependency_overrides[require_clerk_user] = lambda: {"sub": "user_12345"}

    with (
        patch("api.routers.settings.verify_alpaca_credentials", return_value=(True, None)),
        TestClient(app) as client,
    ):
        res = client.post(
            "/settings/alpaca",
            json={"api_key": "PKVALIDKEY123", "secret_key": "SKVALIDSECRET456", "validate_credentials": True},
        )

    assert res.status_code == 200
    assert res.json() == {"ok": True, "validated": True}
    mock_conn.execute.assert_called_once()


def test_save_alpaca_keys_skip_validation():
    from unittest.mock import AsyncMock, patch

    from api.auth import require_clerk_user

    mock_conn = AsyncMock()

    async def _mock_conn_generator():
        yield mock_conn

    app = create_app()
    app.dependency_overrides[db.get_conn] = _mock_conn_generator
    app.dependency_overrides[require_clerk_user] = lambda: {"sub": "user_12345"}

    with (
        patch("api.routers.settings.verify_alpaca_credentials") as mock_verify,
        TestClient(app) as client,
    ):
        res = client.post(
            "/settings/alpaca",
            json={"api_key": "PKVALIDKEY123", "secret_key": "SKVALIDSECRET456", "validate_credentials": False},
        )

    assert res.status_code == 200
    assert res.json() == {"ok": True, "validated": False}
    mock_verify.assert_not_called()
    mock_conn.execute.assert_called_once()


def test_get_signals_stats():
    from unittest.mock import AsyncMock

    mock_conn = AsyncMock()
    mock_conn.fetchrow.return_value = {
        "total": 42,
        "avg_conviction": 84.5,
        "trap_count": 4,
        "clean_count": 38,
        "high_conviction_count": 28,
    }
    mock_conn.fetch.return_value = [
        {"catalyst_type": "SUPERNOVA", "count": 22},
        {"catalyst_type": "DRIFTER", "count": 14},
        {"catalyst_type": "BIO_CATALYST", "count": 6},
    ]

    async def _mock_conn_generator():
        yield mock_conn

    app = create_app()
    app.dependency_overrides[db.get_conn] = _mock_conn_generator

    with TestClient(app) as client:
        res = client.get("/signals/stats")

    assert res.status_code == 200
    data = res.json()
    assert data["total_signals"] == 42
    assert data["avg_conviction"] == 84.5
    assert data["trap_count"] == 4
    assert data["clean_count"] == 38
    assert data["trap_rate_percent"] == 9.5
    assert data["high_conviction_count"] == 28
    assert data["catalyst_breakdown"]["SUPERNOVA"] == 22


def test_list_signals_date_range_filter():
    from datetime import datetime, timezone
    from unittest.mock import AsyncMock

    now = datetime.now(timezone.utc)
    mock_conn = AsyncMock()
    mock_conn.fetchval.return_value = 1
    mock_conn.fetch.return_value = [
        {
            "id": 1,
            "ticker": "AAPL",
            "timestamp_utc": now,
            "conviction_score": 88,
            "catalyst_type": "SUPERNOVA",
            "rationale": "High volume breakout",
            "is_trap": False,
            "confluence_sources": '["squeeze", "insider"]',
            "key_risks": '["market broad selloff"]',
            "suggested_entry_zone": "$170 - $172",
            "suggested_stop": "$165",
        }
    ]

    async def _mock_conn_generator():
        yield mock_conn

    app = create_app()
    app.dependency_overrides[db.get_conn] = _mock_conn_generator

    with TestClient(app) as client:
        res = client.get("/signals?date_range=7d&ticker=AAPL")

    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert data["items"][0]["ticker"] == "AAPL"
    assert data["items"][0]["confluence_sources"] == ["squeeze", "insider"]


def test_export_signals_csv_date_range_filter():
    from datetime import datetime, timezone
    from unittest.mock import AsyncMock

    now = datetime.now(timezone.utc)
    mock_conn = AsyncMock()
    mock_conn.fetch.return_value = [
        {
            "time": now,
            "ticker": "NVDA",
            "conviction_score": 92,
            "catalyst_type": "SUPERNOVA",
            "is_trap": False,
            "trap_reason": None,
            "rationale": "Strong short squeeze",
            "confluence_count": 2,
            "suggested_entry_zone": "$120 - $125",
            "suggested_stop": "$115",
            "risk_level": "MODERATE",
            "suggested_timeframe": "SWING",
        }
    ]

    async def _mock_conn_generator():
        yield mock_conn

    app = create_app()
    app.dependency_overrides[db.get_conn] = _mock_conn_generator

    with TestClient(app) as client:
        res = client.get("/signals/export/csv?date_range=30d")

    assert res.status_code == 200
    assert "NVDA" in res.text


def test_metrics_endpoint():
    app = create_app()
    with TestClient(app) as client:
        res = client.get("/metrics")

    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/plain")
    assert "catalyst_api_uptime_seconds" in res.text
    assert "catalyst_api_db_connections_total" in res.text
    assert "catalyst_api_db_connections_active" in res.text


def test_inject_synthetic_signals_endpoint_confluence():
    app = create_app()
    with TestClient(app) as client:
        res = client.post(
            "/testing/inject",
            json={
                "scenario": "confluence",
                "ticker": "NVDA",
                "price": 125.50,
                "volume": 850000.0,
                "relative_volume": 3.2,
            },
        )

    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["scenario"] == "confluence"
    assert data["ticker"] == "NVDA"
    assert data["events_injected"] == 2


def test_inject_synthetic_signals_endpoint_drop():
    app = create_app()
    with TestClient(app) as client:
        res = client.post(
            "/testing/inject",
            json={
                "scenario": "drop",
                "ticker": "JUNK",
            },
        )

    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["scenario"] == "drop"
    assert data["ticker"] == "JUNK"
    assert data["events_injected"] == 1



