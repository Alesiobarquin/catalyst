"""Unit tests for the Trade Resolution Service (resolver/trade_resolver.py)."""

import json
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pandas as pd

from resolver.trade_resolver import TradeResolver, serialize_resolution

# 2026-10-26 is a Monday; entry at 10:05 New York time.
ENTERED = datetime(2026, 10, 26, 14, 5, tzinfo=timezone.utc)


def bars(*rows):
    """rows: (session, open, high, low, close) with session as YYYY-MM-DD."""
    index = pd.DatetimeIndex([pd.Timestamp(r[0], tz="America/New_York") for r in rows])
    return pd.DataFrame(
        [r[1:] for r in rows], index=index, columns=["Open", "High", "Low", "Close"]
    )


def test_resolution_serializer_handles_database_types():
    resolved_at = datetime(2026, 10, 29, 14, 0, tzinfo=timezone.utc)
    payload = json.loads(serialize_resolution({"resolved_at": resolved_at, "pnl": Decimal("1.5")}))
    assert payload == {"resolved_at": "2026-10-29 14:00:00+00:00", "pnl": "1.5"}


class TestTradeResolverEvaluation:
    def setup_method(self):
        self.resolver = TradeResolver(poll_interval=300, max_holding_days=14, batch_size=50)
        self.base_order = {
            "id": 101,
            "timestamp_utc": ENTERED,
            "ticker": "NVDA",
            "action": "BUY",
            "limit_price": 100.0,
            "stop_loss": 90.0,
            "target_price": 120.0,
            "recommended_size_usd": 5000.0,
        }
        self.now = datetime(2026, 10, 29, 20, 0, tzinfo=timezone.utc)

    def test_buy_hits_target_at_target_price(self):
        history = bars(("2026-10-27", 101, 110, 99, 108), ("2026-10-28", 109, 125, 107, 118))
        resolution = self.resolver.evaluate_order(self.base_order, history, self.now)
        assert resolution["status"] == "HIT_TARGET"
        assert resolution["resolved_price"] == 120.0
        assert resolution["pnl_percent"] == 20.0
        assert resolution["realized_pnl_usd"] == 1000.0
        assert resolution["resolved_session"] == "2026-10-28"

    def test_buy_hits_stop_intraday_even_if_close_recovers(self):
        history = bars(("2026-10-27", 99, 101, 88, 99))
        resolution = self.resolver.evaluate_order(self.base_order, history, self.now)
        assert resolution["status"] == "HIT_STOP"
        assert resolution["resolved_price"] == 90.0
        assert resolution["realized_pnl_usd"] == -500.0

    def test_stop_is_checked_before_target_on_the_same_bar(self):
        history = bars(("2026-10-27", 100, 125, 85, 110))
        assert self.resolver.evaluate_order(self.base_order, history, self.now)["status"] == (
            "HIT_STOP"
        )

    def test_gap_through_stop_fills_at_open(self):
        history = bars(("2026-10-27", 80, 82, 78, 81))
        assert (
            self.resolver.evaluate_order(self.base_order, history, self.now)["resolved_price"]
            == 80.0
        )

    def test_entry_session_bar_is_ignored(self):
        history = bars(("2026-10-26", 100, 130, 80, 101), ("2026-10-27", 101, 105, 97, 102))
        assert self.resolver.evaluate_order(self.base_order, history, self.now) is None

    def test_sell_hits_target_and_stop(self):
        sell = dict(self.base_order, action="SELL", stop_loss=115.0, target_price=85.0)
        target = self.resolver.evaluate_order(sell, bars(("2026-10-27", 99, 100, 82, 90)), self.now)
        assert (target["status"], target["pnl_percent"]) == ("HIT_TARGET", 15.0)
        stop = self.resolver.evaluate_order(sell, bars(("2026-10-27", 101, 118, 99, 110)), self.now)
        assert (stop["status"], stop["pnl_percent"]) == ("HIT_STOP", -15.0)

    def test_expires_at_last_close_within_holding_period(self):
        history = bars(
            ("2026-10-27", 100, 105, 95, 101),
            ("2026-11-09", 104, 106, 103, 105),
            ("2026-11-10", 106, 125, 105, 124),
        )
        now = ENTERED + timedelta(days=16)
        resolution = self.resolver.evaluate_order(self.base_order, history, now)
        assert resolution["status"] == "EXPIRED"
        assert resolution["resolved_price"] == 105.0
        assert resolution["pnl_percent"] == 5.0

    def test_no_bars_or_zero_limit_stays_active(self):
        assert self.resolver.evaluate_order(self.base_order, None, self.now) is None
        zero_limit = dict(self.base_order, limit_price=0.0)
        history = bars(("2026-10-27", 100, 130, 99, 125))
        assert self.resolver.evaluate_order(zero_limit, history, self.now) is None


class TestTradeResolverBars:
    @patch("yfinance.Ticker")
    def test_fetch_daily_bars_requests_unadjusted_prices(self, mock_ticker_cls):
        mock_ticker_cls.return_value.history.return_value = bars(("2026-10-27", 1, 2, 1, 2))
        result = TradeResolver().fetch_daily_bars("NVDA", date(2026, 10, 26))
        assert len(result) == 1
        mock_ticker_cls.return_value.history.assert_called_once_with(
            start="2026-10-26", interval="1d", auto_adjust=False
        )

    def test_fetch_daily_bars_failure_returns_none(self):
        with patch("yfinance.Ticker", side_effect=RuntimeError("rate limited")):
            assert TradeResolver().fetch_daily_bars("NVDA", date(2026, 10, 26)) is None


class TestTradeResolverProcessCycle:
    def setup_method(self):
        self.resolver = TradeResolver()

    def test_process_cycle_no_active_orders(self):
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_cur.fetchall.return_value = []
        mock_conn.cursor.return_value.__enter__.return_value = mock_cur

        resolved = self.resolver.process_cycle(mock_conn)
        assert resolved == []

    @patch.object(TradeResolver, "fetch_daily_bars")
    def test_process_cycle_executes_db_update_and_kafka(self, mock_fetch_bars):
        mock_fetch_bars.return_value = bars(("2026-10-27", 101, 130, 99, 128))

        active_orders = [
            {
                "id": 1,
                "ticker": "NVDA",
                "timestamp_utc": ENTERED,
                "action": "BUY",
                "limit_price": 100.0,
                "stop_loss": 90.0,
                "target_price": 120.0,
                "recommended_size_usd": 10000.0,
            }
        ]

        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_cur.fetchall.return_value = active_orders
        mock_conn.cursor.return_value.__enter__.return_value = mock_cur

        mock_producer = MagicMock()
        self.resolver._producer = mock_producer

        resolved = self.resolver.process_cycle(mock_conn)

        mock_fetch_bars.assert_called_once_with("NVDA", date(2026, 10, 26))
        assert len(resolved) == 1
        assert resolved[0]["status"] == "HIT_TARGET"
        assert resolved[0]["realized_pnl_usd"] == 2000.0
        assert mock_cur.execute.called
        assert mock_conn.commit.called
        assert mock_producer.send.called
        sent_topic, payload = mock_producer.send.call_args[0]
        assert sent_topic == "trade-resolutions"
        assert payload["ticker"] == "NVDA"
        assert payload["realized_pnl_usd"] == 2000.0

    def test_stop_cleans_up_producer(self):
        mock_producer = MagicMock()
        self.resolver._producer = mock_producer
        self.resolver.stop()
        assert mock_producer.close.called
        assert self.resolver._producer is None
