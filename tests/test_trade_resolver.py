"""Unit tests for the Trade Resolution Service (resolver/trade_resolver.py)."""

import json
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

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

    @pytest.mark.parametrize(
        ("action", "stop", "target", "row", "status", "price"),
        [
            ("BUY", 90, 120, ("2026-10-27", 130, 132, 128, 131), "HIT_TARGET", 130),
            ("SELL", 115, 85, ("2026-10-27", 130, 132, 128, 131), "HIT_STOP", 130),
            ("SELL", 115, 85, ("2026-10-27", 80, 82, 78, 81), "HIT_TARGET", 80),
        ],
    )
    def test_gap_fills_preserve_direction(self, action, stop, target, row, status, price):
        order = dict(self.base_order, action=action, stop_loss=stop, target_price=target)
        resolution = self.resolver.evaluate_order(order, bars(row), self.now)
        assert (resolution["status"], resolution["resolved_price"]) == (status, price)

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

    @pytest.mark.parametrize(
        "field", ["limit_price", "stop_loss", "target_price", "recommended_size_usd"]
    )
    @pytest.mark.parametrize("value", [float("nan"), float("inf"), -1.0, "invalid"])
    def test_invalid_financial_inputs_stay_active(self, field, value):
        order = dict(self.base_order, **{field: value})
        history = bars(("2026-10-27", 100, 130, 99, 125))
        assert self.resolver.evaluate_order(order, history, self.now) is None

    def test_overflowed_pnl_stays_active(self):
        order = dict(self.base_order, limit_price=1e-308)
        history = bars(("2026-10-27", 100, 130, 99, 125))
        assert self.resolver.evaluate_order(order, history, self.now) is None

    @pytest.mark.parametrize("action", ["HOLD", "", None])
    def test_unknown_action_stays_active(self, action):
        order = dict(self.base_order, action=action)
        history = bars(("2026-10-27", 100, 130, 99, 125))
        assert self.resolver.evaluate_order(order, history, self.now) is None

    @pytest.mark.parametrize(
        "row",
        [
            ("2026-10-27", -1, 130, -2, 125),
            ("2026-10-27", 100, 130, 0, 125),
            ("2026-10-27", 121, 125, 130, 120),
            ("2026-10-27", 100, 130, 99, 140),
            ("2026-10-27", float("inf"), 130, 99, 125),
        ],
    )
    def test_invalid_ohlc_cannot_resolve(self, row):
        assert self.resolver.evaluate_order(self.base_order, bars(row), self.now) is None

    def test_future_bar_cannot_resolve(self):
        history = bars(("2026-10-30", 100, 130, 99, 125))
        assert self.resolver.evaluate_order(self.base_order, history, self.now) is None

    def test_missing_bar_timestamp_cannot_abort_resolution(self):
        history = bars(("2026-10-27", 100, 130, 99, 125))
        history.index = pd.DatetimeIndex([pd.NaT])
        assert self.resolver.evaluate_order(self.base_order, history, self.now) is None

    def test_stale_history_cannot_supply_expiration_price(self):
        history = bars(("2026-10-27", 100, 105, 95, 101))
        assert (
            self.resolver.evaluate_order(self.base_order, history, ENTERED + timedelta(days=16))
            is None
        )

    def test_unfinished_expiry_session_stays_active_until_close(self):
        history = bars(("2026-11-09", 100, 105, 95, 101))
        assert (
            self.resolver.evaluate_order(self.base_order, history, ENTERED + timedelta(days=14))
            is None
        )

    def test_after_hours_entry_keeps_the_full_holding_period(self):
        order = dict(self.base_order, timestamp_utc=ENTERED + timedelta(hours=9))
        history = bars(("2026-11-09", 100, 105, 95, 101))
        now = datetime(2026, 11, 9, 21, 0, tzinfo=timezone.utc)
        assert self.resolver.evaluate_order(order, history, now) is None

    def test_unsorted_bars_resolve_at_first_crossing(self):
        history = bars(("2026-10-28", 100, 130, 99, 125), ("2026-10-27", 99, 101, 88, 99))
        resolution = self.resolver.evaluate_order(self.base_order, history, self.now)
        assert (resolution["status"], resolution["resolved_session"]) == ("HIT_STOP", "2026-10-27")


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

    @staticmethod
    def order(order_id=1):
        return dict(
            id=order_id,
            ticker="NVDA",
            timestamp_utc=ENTERED,
            action="BUY",
            limit_price=100.0,
            stop_loss=90.0,
            target_price=120.0,
            recommended_size_usd=10000.0,
        )

    @patch.object(TradeResolver, "fetch_daily_bars")
    def test_batches_advance_past_active_orders_and_wrap(self, fetch_bars):
        self.resolver.batch_size = 1
        conn = MagicMock()
        cur = conn.cursor.return_value.__enter__.return_value
        first, second = self.order(1), self.order(2)
        cur.fetchall.side_effect = [[first], [second], [], [first]]
        fetch_bars.return_value = bars(("2026-10-27", 100, 105, 95, 101))

        for _ in range(3):
            assert self.resolver.process_cycle(conn) == []

        assert fetch_bars.call_count == 3
        queries = cur.execute.call_args_list
        cutoff = queries[0].args[1][0]
        assert queries[0].args[1] == (cutoff, 1)
        assert queries[1].args[1] == (cutoff, ENTERED, 1, 1)
        assert queries[2].args[1] == (cutoff, ENTERED, 2, 1)
        assert queries[3].args[1][-1] == 1
        assert queries[3].args[1][0] >= cutoff
        assert all("AND timestamp_utc <= %s" in query.args[0] for query in queries)
        assert "ORDER BY timestamp_utc ASC, id ASC" in queries[1].args[0]

    @patch.object(TradeResolver, "fetch_active_orders")
    @patch.object(TradeResolver, "fetch_daily_bars")
    def test_bad_order_cannot_abort_other_orders(self, fetch_bars, fetch_orders):
        fetch_orders.return_value = [dict(self.order(1), timestamp_utc="invalid"), self.order(2)]
        fetch_bars.return_value = bars(("2026-10-27", 100, 130, 99, 125))
        conn = MagicMock()
        self.resolver._producer = MagicMock()
        assert [r["id"] for r in self.resolver.process_cycle(conn)] == [2]
        conn.commit.assert_called_once()

    @patch.object(TradeResolver, "fetch_active_orders")
    @patch.object(TradeResolver, "fetch_daily_bars")
    def test_concurrent_resolution_is_not_overwritten_or_emitted(self, fetch_bars, fetch_orders):
        fetch_orders.return_value = [self.order(1), self.order(2)]
        fetch_bars.return_value = bars(("2026-10-27", 100, 130, 99, 125))
        conn = MagicMock()
        cur = conn.cursor.return_value.__enter__.return_value
        cur.fetchone.side_effect = [{"id": 1}, None]
        producer = self.resolver._producer = MagicMock()
        producer.send.side_effect = lambda *_: conn.commit.assert_called_once()

        assert [r["id"] for r in self.resolver.process_cycle(conn)] == [1]
        producer.send.assert_called_once()
        assert producer.send.call_args.args[1]["id"] == 1
        for query in cur.execute.call_args_list:
            assert "AND status = 'ACTIVE'" in query.args[0]
            assert "RETURNING id" in query.args[0]

    @pytest.mark.parametrize("failure", ["update", "commit"])
    @patch.object(TradeResolver, "fetch_active_orders")
    @patch.object(TradeResolver, "fetch_daily_bars")
    def test_failed_transaction_rolls_back_without_emitting(
        self, fetch_bars, fetch_orders, failure
    ):
        fetch_orders.return_value = [self.order(1), self.order(2)]
        fetch_bars.return_value = bars(("2026-10-27", 100, 130, 99, 125))
        conn = MagicMock()
        cur = conn.cursor.return_value.__enter__.return_value
        if failure == "update":
            cur.execute.side_effect = [None, RuntimeError("update failed")]
        else:
            conn.commit.side_effect = RuntimeError("commit failed")
        producer = self.resolver._producer = MagicMock()

        with pytest.raises(RuntimeError, match="failed"):
            self.resolver.process_cycle(conn)

        conn.rollback.assert_called_once()
        producer.send.assert_not_called()
        assert self.resolver._last_order is None
