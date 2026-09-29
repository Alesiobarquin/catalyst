"""API integration tests for /orders and /orders/{id}/detail."""

from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

import api.db as db
from api.main import create_app


def make_orders_test_client(mock_conn: AsyncMock) -> TestClient:
    async def _noop() -> None:
        return None

    async def _override_conn() -> AsyncGenerator[AsyncMock, None]:
        yield mock_conn

    db.init_pool = _noop  # type: ignore[assignment]
    db.close_pool = _noop  # type: ignore[assignment]
    app = create_app()
    app.dependency_overrides[db.get_conn] = _override_conn
    return TestClient(app)


def test_list_orders_success():
    now = datetime.now(timezone.utc)
    mock_conn = AsyncMock()
    mock_conn.fetchval.return_value = 1
    mock_conn.fetch.return_value = [
        {
            "id": 1,
            "ticker": "NVDA",
            "timestamp_utc": now,
            "action": "BUY",
            "strategy_used": "Supernova",
            "recommended_size_usd": 10000.0,
            "limit_price": 120.0,
            "stop_loss": 110.0,
            "target_price": 140.0,
            "rationale": "High short interest breakout",
            "conviction_score": 90,
            "catalyst_type": "SUPERNOVA",
            "regime_vix": 16.5,
            "spy_above_200sma": True,
            "status": "ACTIVE",
        }
    ]

    with make_orders_test_client(mock_conn) as client:
        res = client.get("/orders?page=1&per_page=20")

    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert data["page"] == 1
    assert len(data["items"]) == 1
    assert data["items"][0]["ticker"] == "NVDA"


def test_list_orders_with_status_and_ticker_filters():
    now = datetime.now(timezone.utc)
    mock_conn = AsyncMock()
    mock_conn.fetchval.return_value = 1
    mock_conn.fetch.return_value = [
        {
            "id": 2,
            "ticker": "TSLA",
            "timestamp_utc": now,
            "action": "BUY",
            "strategy_used": "Supernova",
            "recommended_size_usd": 12000.0,
            "limit_price": 240.0,
            "stop_loss": 225.0,
            "target_price": 280.0,
            "rationale": "High short interest squeeze",
            "conviction_score": 88,
            "catalyst_type": "SUPERNOVA",
            "regime_vix": 17.0,
            "spy_above_200sma": True,
            "status": "ACTIVE",
        }
    ]

    with make_orders_test_client(mock_conn) as client:
        res = client.get("/orders?status=ACTIVE&ticker=TSLA&strategy=Supernova")

    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert data["items"][0]["ticker"] == "TSLA"
    assert data["items"][0]["status"] == "ACTIVE"


def test_orders_by_ticker():
    now = datetime.now(timezone.utc)
    mock_conn = AsyncMock()
    mock_conn.fetch.return_value = [
        {
            "id": 5,
            "ticker": "MSFT",
            "timestamp_utc": now,
            "action": "BUY",
            "strategy_used": "Follower",
            "recommended_size_usd": 20000.0,
            "limit_price": 420.0,
            "stop_loss": 405.0,
            "target_price": 460.0,
            "rationale": "C-suite insider buy",
            "conviction_score": 75,
            "catalyst_type": "FOLLOWER",
            "regime_vix": 14.0,
            "spy_above_200sma": True,
            "status": "ACTIVE",
        }
    ]

    with make_orders_test_client(mock_conn) as client:
        res = client.get("/orders/MSFT")

    assert res.status_code == 200
    items = res.json()
    assert len(items) == 1
    assert items[0]["ticker"] == "MSFT"
    assert items[0]["strategy_used"] == "Follower"


def test_get_order_detail_success():
    now = datetime.now(timezone.utc)
    mock_conn = AsyncMock()
    mock_conn.fetchrow.side_effect = [
        # 1. trade_orders row
        {
            "id": 42,
            "ticker": "AAPL",
            "timestamp_utc": now,
            "action": "BUY",
            "strategy_used": "Supernova",
            "recommended_size_usd": 15000.0,
            "limit_price": 180.0,
            "stop_loss": 170.0,
            "target_price": 205.0,
            "rationale": "Key breakout over 50-day moving average.\n\nInstitutional flow detected.",
            "conviction_score": 85,
            "catalyst_type": "SUPERNOVA",
            "regime_vix": 15.2,
            "spy_above_200sma": True,
            "status": "ACTIVE",
        },
        # 2. validated_signals row
        {
            "id": 10,
            "confluence_count": 2,
            "confluence_sources": ["squeeze", "whale"],
            "key_risks": ["Earnings announcement in 3 weeks", "Tech sector weakness"],
        },
    ]

    with make_orders_test_client(mock_conn) as client:
        res = client.get("/orders/42/detail")

    assert res.status_code == 200
    data = res.json()
    assert data["ticker"] == "AAPL"
    assert data["convictionScore"] == 85
    assert data["convictionLabel"] == "VERY HIGH"
    assert data["entryPrice"] == 180.0
    assert data["stopLoss"] == 170.0
    assert data["targetPrice"] == 205.0
    assert len(data["thesis"]["bodyParagraphs"]) == 2
    assert len(data["thesis"]["counterArguments"]) == 2
    assert data["pipeline"]["engineVersion"] == "2.1.0-spring-boot"
    assert len(data["pipeline"]["timeline"]) == 4


def test_get_order_detail_not_found():
    mock_conn = AsyncMock()
    mock_conn.fetchrow.return_value = None

    with make_orders_test_client(mock_conn) as client:
        res = client.get("/orders/999/detail")

    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()


def test_order_stats_success():
    mock_conn = AsyncMock()
    mock_conn.fetchval.side_effect = [10, 82.5, 250000.0]
    mock_conn.fetchrow.return_value = {"total_pnl_usd": 12500.0, "avg_pnl_pct": 14.5}
    mock_conn.fetch.side_effect = [
        [{"strategy_used": "Supernova", "cnt": 6}, {"strategy_used": "Scalper", "cnt": 4}],
        [{"catalyst_type": "SUPERNOVA", "cnt": 7}, {"catalyst_type": "EARNINGS", "cnt": 3}],
        [
            {"status": "HIT_TARGET", "cnt": 4},
            {"status": "RESOLVED_WIN", "cnt": 2},
            {"status": "HIT_STOP", "cnt": 1},
            {"status": "RESOLVED_LOSS", "cnt": 1},
            {"status": "ACTIVE", "cnt": 2},
        ],
        [{"date": "Sep 27", "cnt": 10}],
        [{"bucket": "80–89", "cnt": 10}],
    ]

    with make_orders_test_client(mock_conn) as client:
        res = client.get("/orders/stats")

    assert res.status_code == 200
    data = res.json()
    assert data["total_orders"] == 10
    assert data["avg_conviction"] == 82.5
    assert data["hit_target_count"] == 6  # 4 + 2
    assert data["hit_stop_count"] == 2    # 1 + 1
    assert data["active_count"] == 2
    assert data["win_rate_percent"] == 75.0
    assert data["realized_pnl_percent"] == 14.5
    assert data["total_realized_pnl_usd"] == 12500.0
    assert data["total_recommended_volume_usd"] == 250000.0
    assert data["strategy_breakdown"]["Supernova"] == 6
    assert data["catalyst_breakdown"]["SUPERNOVA"] == 7
    assert len(data["daily_volume"]) == 1
    assert len(data["conviction_distribution"]) == 1


def test_export_orders_csv():
    now = datetime.now(timezone.utc)
    mock_conn = AsyncMock()
    mock_conn.fetch.return_value = [
        {
            "id": 1,
            "ticker": "NVDA",
            "timestamp_utc": now,
            "action": "BUY",
            "strategy_used": "Supernova",
            "recommended_size_usd": 10000.0,
            "limit_price": 120.0,
            "stop_loss": 110.0,
            "target_price": 140.0,
            "rationale": "High short interest breakout",
            "conviction_score": 90,
            "catalyst_type": "SUPERNOVA",
            "regime_vix": 16.5,
            "spy_above_200sma": True,
            "status": "ACTIVE",
        }
    ]

    with make_orders_test_client(mock_conn) as client:
        res = client.get("/orders/export/csv?strategy=Supernova&status=ACTIVE")

    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    assert "attachment; filename=" in res.headers["content-disposition"]
    csv_lines = res.text.strip().splitlines()
    assert "id,timestamp_utc,ticker,action" in csv_lines[0]
    assert "NVDA" in csv_lines[1]
    assert "Supernova" in csv_lines[1]


def test_list_orders_with_execution_details():
    now = datetime.now(timezone.utc)
    mock_conn = AsyncMock()
    mock_conn.fetchval.return_value = 1
    mock_conn.fetch.return_value = [
        {
            "id": 1,
            "ticker": "AAPL",
            "timestamp_utc": now,
            "action": "BUY",
            "strategy_used": "Scalper",
            "recommended_size_usd": 8000.0,
            "limit_price": 175.0,
            "stop_loss": 170.0,
            "target_price": 185.0,
            "rationale": "FDA binary breakout",
            "conviction_score": 85,
            "catalyst_type": "SCALPER",
            "regime_vix": 15.0,
            "spy_above_200sma": True,
            "status": "ACTIVE",
            "exec_id": 99,
            "alpaca_order_id": "alp-12345",
            "execution_status": "filled",
            "filled_avg_price": 175.25,
            "error_message": None,
        }
    ]

    with make_orders_test_client(mock_conn) as client:
        res = client.get("/orders?ticker=AAPL")

    assert res.status_code == 200
    data = res.json()
    assert len(data["items"]) == 1
    order = data["items"][0]
    assert order["execution"] is not None
    assert order["execution"]["id"] == 99
    assert order["execution"]["alpaca_order_id"] == "alp-12345"
    assert order["execution"]["execution_status"] == "filled"
    assert order["execution"]["filled_avg_price"] == 175.25


def test_list_orders_with_resolution_details():
    now = datetime.now(timezone.utc)
    mock_conn = AsyncMock()
    mock_conn.fetchval.return_value = 1
    mock_conn.fetch.return_value = [
        {
            "id": 10,
            "ticker": "NVDA",
            "timestamp_utc": now,
            "action": "BUY",
            "strategy_used": "Supernova",
            "recommended_size_usd": 10000.0,
            "limit_price": 120.0,
            "stop_loss": 110.0,
            "target_price": 140.0,
            "rationale": "High short interest breakout",
            "conviction_score": 90,
            "catalyst_type": "SUPERNOVA",
            "regime_vix": 16.5,
            "spy_above_200sma": True,
            "status": "RESOLVED_WIN",
            "resolved_at": now,
            "resolved_price": 140.0,
            "pnl_percent": 16.67,
            "realized_pnl_usd": 1667.0,
        }
    ]

    with make_orders_test_client(mock_conn) as client:
        res = client.get("/orders?status=RESOLVED_WIN")

    assert res.status_code == 200
    data = res.json()
    assert len(data["items"]) == 1
    order = data["items"][0]
    assert order["status"] == "RESOLVED_WIN"
    assert order["resolved_price"] == 140.0
    assert order["pnl_percent"] == 16.67
    assert order["realized_pnl_usd"] == 1667.0


def test_export_orders_csv_with_resolution_columns():
    now = datetime.now(timezone.utc)
    mock_conn = AsyncMock()
    mock_conn.fetch.return_value = [
        {
            "id": 15,
            "ticker": "TSLA",
            "timestamp_utc": now,
            "action": "BUY",
            "strategy_used": "Supernova",
            "recommended_size_usd": 12000.0,
            "limit_price": 240.0,
            "stop_loss": 225.0,
            "target_price": 280.0,
            "rationale": "High short interest squeeze",
            "conviction_score": 88,
            "catalyst_type": "SUPERNOVA",
            "regime_vix": 17.0,
            "spy_above_200sma": True,
            "status": "RESOLVED_WIN",
            "resolved_at": now,
            "resolved_price": 280.0,
            "pnl_percent": 16.67,
            "realized_pnl_usd": 2000.4,
        }
    ]

    with make_orders_test_client(mock_conn) as client:
        res = client.get("/orders/export/csv?status=RESOLVED_WIN")

    assert res.status_code == 200
    lines = res.text.strip().splitlines()
    assert "resolved_at,resolved_price,pnl_percent,realized_pnl_usd" in lines[0]
    assert "TSLA" in lines[1]
    assert "280.0" in lines[1]
    assert "2000.4" in lines[1]

