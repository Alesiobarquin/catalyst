"""Unit tests for the performance router (/performance)."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pandas as pd
from fastapi.testclient import TestClient

import api.db as db
from api.main import create_app
from api.routers.performance import _compute_ticker_performance


def make_test_client(mock_conn: AsyncMock | None = None) -> TestClient:
    conn = mock_conn or AsyncMock()

    async def _mock_conn_generator():
        yield conn

    app = create_app()
    app.dependency_overrides[db.get_conn] = _mock_conn_generator
    return TestClient(app)


class TestBatchPerformanceEndpoint:
    def test_batch_non_numeric_ids_returns_422(self):
        client = make_test_client()
        res = client.get("/performance/batch?ids=1,abc,3")
        assert res.status_code == 422
        assert "comma-separated integers" in res.json()["detail"]

    def test_batch_exceeds_max_ids_returns_422(self):
        client = make_test_client()
        ids = ",".join(str(i) for i in range(1, 23))  # 22 IDs
        res = client.get(f"/performance/batch?ids={ids}")
        assert res.status_code == 422
        assert "Maximum 20 IDs" in res.json()["detail"]

    @patch("api.routers.performance._compute_ticker_performance")
    def test_batch_success(self, mock_compute):
        mock_compute.return_value = {
            "order_id": 10,
            "ticker": "AAPL",
            "current_price": 175.50,
            "pnl_pct": 3.24,
            "status": "ACTIVE",
            "days_held": 2,
        }

        mock_conn = AsyncMock()
        mock_conn.fetch.return_value = [
            {
                "id": 10,
                "ticker": "AAPL",
                "timestamp_utc": datetime.now(timezone.utc),
                "limit_price": 170.0,
                "stop_loss": 160.0,
                "target_price": 190.0,
                "status": "ACTIVE",
            }
        ]

        client = make_test_client(mock_conn)
        res = client.get("/performance/batch?ids=10")
        assert res.status_code == 200
        data = res.json()
        assert len(data) == 1
        assert data[0]["order_id"] == 10
        assert data[0]["ticker"] == "AAPL"
        assert data[0]["pnl_pct"] == 3.24

    @patch("api.routers.performance._compute_ticker_performance")
    def test_batch_with_resolved_columns(self, mock_compute):
        mock_compute.return_value = {
            "order_id": 11,
            "ticker": "TSLA",
            "current_price": 260.0,
            "pnl_pct": 12.5,
            "status": "RESOLVED_WIN",
            "days_held": 4,
        }

        mock_conn = AsyncMock()
        mock_conn.fetch.return_value = [
            {
                "id": 11,
                "ticker": "TSLA",
                "timestamp_utc": datetime.now(timezone.utc),
                "limit_price": 230.0,
                "stop_loss": 215.0,
                "target_price": 260.0,
                "status": "RESOLVED_WIN",
                "resolved_price": 260.0,
                "pnl_percent": 12.5,
            }
        ]

        client = make_test_client(mock_conn)
        res = client.get("/performance/batch?ids=11")
        assert res.status_code == 200
        data = res.json()
        assert len(data) == 1
        assert data[0]["status"] == "RESOLVED_WIN"
        assert data[0]["pnl_pct"] == 12.5


class TestSingleOrderPerformanceEndpoint:
    def test_order_not_found_returns_404(self):
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = None

        client = make_test_client(mock_conn)
        res = client.get("/performance/99999")
        assert res.status_code == 404
        assert "Order 99999 not found" in res.json()["detail"]

    @patch("api.routers.performance._compute_ticker_performance")
    def test_order_success_with_db_status(self, mock_compute):
        now = datetime.now(timezone.utc)
        mock_compute.return_value = {
            "order_id": 42,
            "ticker": "NVDA",
            "current_price": 130.0,
            "pnl_pct": 8.33,
            "status": "HIT_TARGET",
            "days_held": 5,
        }

        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = {
            "id": 42,
            "ticker": "NVDA",
            "timestamp_utc": now,
            "limit_price": 120.0,
            "stop_loss": 110.0,
            "target_price": 130.0,
            "status": "HIT_TARGET",
        }

        client = make_test_client(mock_conn)
        res = client.get("/performance/42")
        assert res.status_code == 200
        data = res.json()
        assert data["order_id"] == 42
        assert data["ticker"] == "NVDA"
        assert data["entry_price"] == 120.0
        assert data["status"] == "HIT_TARGET"
        assert data["status_source"] == "db"

    @patch("api.routers.performance._compute_ticker_performance")
    def test_order_success_with_resolved_win(self, mock_compute):
        now = datetime.now(timezone.utc)
        mock_compute.return_value = {
            "order_id": 43,
            "ticker": "TSLA",
            "current_price": 260.0,
            "pnl_pct": 8.33,
            "status": "RESOLVED_WIN",
            "days_held": 3,
        }

        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = {
            "id": 43,
            "ticker": "TSLA",
            "timestamp_utc": now,
            "limit_price": 240.0,
            "stop_loss": 225.0,
            "target_price": 260.0,
            "status": "RESOLVED_WIN",
            "resolved_price": 260.0,
            "pnl_percent": 8.33,
        }

        client = make_test_client(mock_conn)
        res = client.get("/performance/43")
        assert res.status_code == 200
        data = res.json()
        assert data["order_id"] == 43
        assert data["ticker"] == "TSLA"
        assert data["status"] == "RESOLVED_WIN"
        assert data["status_source"] == "db"
        assert data["current_price"] == 260.0
        assert data["pnl_pct"] == 8.33

    @patch("api.routers.performance._compute_ticker_performance")
    def test_order_success_with_resolved_loss(self, mock_compute):
        now = datetime.now(timezone.utc)
        mock_compute.return_value = {
            "order_id": 44,
            "ticker": "AAPL",
            "current_price": 170.0,
            "pnl_pct": -5.56,
            "status": "RESOLVED_LOSS",
            "days_held": 2,
        }

        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = {
            "id": 44,
            "ticker": "AAPL",
            "timestamp_utc": now,
            "limit_price": 180.0,
            "stop_loss": 170.0,
            "target_price": 200.0,
            "status": "RESOLVED_LOSS",
            "resolved_price": 170.0,
            "pnl_percent": -5.56,
        }

        client = make_test_client(mock_conn)
        res = client.get("/performance/44")
        assert res.status_code == 200
        data = res.json()
        assert data["order_id"] == 44
        assert data["status"] == "RESOLVED_LOSS"
        assert data["status_source"] == "db"


class TestComputeTickerPerformanceHelper:
    @patch("api.routers.performance.yf.Ticker")
    def test_hit_target(self, mock_ticker_cls):
        df = pd.DataFrame(
            {
                "Close": [105.0, 115.0],
                "Low": [98.0, 102.0],
                "High": [106.0, 122.0],  # exceeds target 120.0
            }
        )
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = df
        mock_ticker_cls.return_value = mock_ticker

        dt = datetime(2026, 3, 1, 10, 0, tzinfo=timezone.utc)
        now = datetime(2026, 3, 5, 10, 0, tzinfo=timezone.utc)

        result = _compute_ticker_performance(
            order_id=1,
            ticker="XYZ",
            signal_dt=dt,
            entry_price=100.0,
            stop_loss=90.0,
            target_price=120.0,
            db_status="ACTIVE",
            now=now,
        )

        assert result["status"] == "HIT_TARGET"
        assert result["current_price"] == 115.0
        assert result["pnl_pct"] == 15.0
        assert result["days_held"] == 4

    @patch("api.routers.performance.yf.Ticker")
    def test_hit_stop_loss(self, mock_ticker_cls):
        df = pd.DataFrame(
            {
                "Close": [95.0, 88.0],
                "Low": [94.0, 85.0],  # breaches stop_loss 89.0
                "High": [101.0, 96.0],
            }
        )
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = df
        mock_ticker_cls.return_value = mock_ticker

        dt = datetime(2026, 3, 1, 10, 0, tzinfo=timezone.utc)
        now = datetime(2026, 3, 3, 10, 0, tzinfo=timezone.utc)

        result = _compute_ticker_performance(
            order_id=2,
            ticker="ABC",
            signal_dt=dt,
            entry_price=100.0,
            stop_loss=89.0,
            target_price=125.0,
            db_status="ACTIVE",
            now=now,
        )

        assert result["status"] == "HIT_STOP"
        assert result["current_price"] == 88.0
        assert result["pnl_pct"] == -12.0

    @patch("api.routers.performance.yf.Ticker")
    def test_fallback_fast_info_when_history_empty(self, mock_ticker_cls):
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = pd.DataFrame()
        mock_fast_info = MagicMock()
        mock_fast_info.last_price = 55.25
        mock_ticker.fast_info = mock_fast_info
        mock_ticker_cls.return_value = mock_ticker

        dt = datetime(2026, 3, 27, 10, 0, tzinfo=timezone.utc)
        now = datetime(2026, 3, 27, 12, 0, tzinfo=timezone.utc)

        result = _compute_ticker_performance(
            order_id=3,
            ticker="NEWCO",
            signal_dt=dt,
            entry_price=50.0,
            stop_loss=45.0,
            target_price=65.0,
            db_status="ACTIVE",
            now=now,
        )

        assert result["current_price"] == 55.25
        assert result["pnl_pct"] == 10.5
        assert result["status"] == "ACTIVE"

    @patch("api.routers.performance.yf.Ticker")
    def test_resolved_win_fastpath_skips_yfinance(self, mock_ticker_cls):
        dt = datetime(2026, 3, 20, 10, 0, tzinfo=timezone.utc)
        now = datetime(2026, 3, 25, 10, 0, tzinfo=timezone.utc)

        result = _compute_ticker_performance(
            order_id=5,
            ticker="NVDA",
            signal_dt=dt,
            entry_price=120.0,
            stop_loss=110.0,
            target_price=140.0,
            db_status="RESOLVED_WIN",
            now=now,
            resolved_price=140.0,
            pnl_percent=16.67,
        )

        mock_ticker_cls.assert_not_called()
        assert result["order_id"] == 5
        assert result["ticker"] == "NVDA"
        assert result["current_price"] == 140.0
        assert result["pnl_pct"] == 16.67
        assert result["status"] == "RESOLVED_WIN"
        assert result["days_held"] == 5

    @patch("api.routers.performance.yf.Ticker")
    def test_sell_order_hit_target(self, mock_ticker_cls):
        df = pd.DataFrame(
            {
                "Close": [92.0, 83.0],
                "Low": [91.0, 81.0],  # Breaches target 85.0
                "High": [102.0, 94.0],
            }
        )
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = df
        mock_ticker_cls.return_value = mock_ticker

        dt = datetime(2026, 3, 1, 10, 0, tzinfo=timezone.utc)
        now = datetime(2026, 3, 3, 10, 0, tzinfo=timezone.utc)

        result = _compute_ticker_performance(
            order_id=6,
            ticker="SHORT1",
            signal_dt=dt,
            entry_price=100.0,
            stop_loss=115.0,
            target_price=85.0,
            db_status="ACTIVE",
            now=now,
            action="SELL",
        )

        assert result["status"] == "HIT_TARGET"
        assert result["current_price"] == 83.0
        assert result["pnl_pct"] == 17.0  # (100 - 83) / 100 * 100

    @patch("api.routers.performance.yf.Ticker")
    def test_sell_order_hit_stop(self, mock_ticker_cls):
        df = pd.DataFrame(
            {
                "Close": [105.0, 118.0],
                "Low": [98.0, 104.0],
                "High": [106.0, 120.0],  # Breaches stop 115.0
            }
        )
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = df
        mock_ticker_cls.return_value = mock_ticker

        dt = datetime(2026, 3, 1, 10, 0, tzinfo=timezone.utc)
        now = datetime(2026, 3, 3, 10, 0, tzinfo=timezone.utc)

        result = _compute_ticker_performance(
            order_id=7,
            ticker="SHORT2",
            signal_dt=dt,
            entry_price=100.0,
            stop_loss=115.0,
            target_price=85.0,
            db_status="ACTIVE",
            now=now,
            action="SELL",
        )

        assert result["status"] == "HIT_STOP"
        assert result["current_price"] == 118.0
        assert result["pnl_pct"] == -18.0  # (100 - 118) / 100 * 100

    @patch("api.routers.performance.yf.Ticker")
    def test_sell_order_active_pnl(self, mock_ticker_cls):
        df = pd.DataFrame(
            {
                "Close": [95.0, 92.0],
                "Low": [93.0, 89.0],  # Above target 85.0
                "High": [101.0, 97.0],  # Below stop 115.0
            }
        )
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = df
        mock_ticker_cls.return_value = mock_ticker

        dt = datetime(2026, 3, 1, 10, 0, tzinfo=timezone.utc)
        now = datetime(2026, 3, 3, 10, 0, tzinfo=timezone.utc)

        result = _compute_ticker_performance(
            order_id=8,
            ticker="SHORT3",
            signal_dt=dt,
            entry_price=100.0,
            stop_loss=115.0,
            target_price=85.0,
            db_status="ACTIVE",
            now=now,
            action="SELL",
        )

        assert result["status"] == "ACTIVE"
        assert result["current_price"] == 92.0
        assert result["pnl_pct"] == 8.0  # (100 - 92) / 100 * 100

    @patch("api.routers.performance.yf.Ticker")
    def test_sell_order_resolved_win_fastpath(self, mock_ticker_cls):
        dt = datetime(2026, 3, 20, 10, 0, tzinfo=timezone.utc)
        now = datetime(2026, 3, 25, 10, 0, tzinfo=timezone.utc)

        result = _compute_ticker_performance(
            order_id=9,
            ticker="SHORT4",
            signal_dt=dt,
            entry_price=100.0,
            stop_loss=115.0,
            target_price=80.0,
            db_status="RESOLVED_WIN",
            now=now,
            resolved_price=80.0,
            pnl_percent=None,  # verify fallback calculation
            action="SELL",
        )

        mock_ticker_cls.assert_not_called()
        assert result["order_id"] == 9
        assert result["ticker"] == "SHORT4"
        assert result["current_price"] == 80.0
        assert result["pnl_pct"] == 20.0  # (100 - 80) / 100 * 100
        assert result["status"] == "RESOLVED_WIN"
