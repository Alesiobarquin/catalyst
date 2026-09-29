"""Unit tests for the Trade Resolution Service (resolver/trade_resolver.py)."""

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from resolver.trade_resolver import TradeResolver


class TestTradeResolverEvaluation:
    def setup_method(self):
        self.resolver = TradeResolver(poll_interval=300, max_holding_days=14, batch_size=50)
        self.base_order = {
            "id": 101,
            "timestamp_utc": datetime.now(timezone.utc),
            "ticker": "NVDA",
            "action": "BUY",
            "limit_price": 100.0,
            "stop_loss": 90.0,
            "target_price": 120.0,
            "recommended_size_usd": 5000.0,
        }

    def test_evaluate_buy_hit_target(self):
        resolution = self.resolver.evaluate_order(self.base_order, current_price=125.0)
        assert resolution is not None
        assert resolution["status"] == "HIT_TARGET"
        assert resolution["resolved_price"] == 125.0
        assert resolution["pnl_percent"] == 25.0  # (125 - 100) / 100 * 100
        assert resolution["realized_pnl_usd"] == 1250.0  # 5000 * 0.25

    def test_evaluate_buy_hit_stop(self):
        resolution = self.resolver.evaluate_order(self.base_order, current_price=88.5)
        assert resolution is not None
        assert resolution["status"] == "HIT_STOP"
        assert resolution["resolved_price"] == 88.5
        assert resolution["pnl_percent"] == -11.5  # (88.5 - 100) / 100 * 100
        assert resolution["realized_pnl_usd"] == -575.0  # 5000 * -0.115

    def test_evaluate_buy_remains_active(self):
        resolution = self.resolver.evaluate_order(self.base_order, current_price=105.0)
        assert resolution is None

    def test_evaluate_sell_hit_target(self):
        sell_order = dict(self.base_order, action="SELL", stop_loss=115.0, target_price=85.0)
        resolution = self.resolver.evaluate_order(sell_order, current_price=82.0)
        assert resolution is not None
        assert resolution["status"] == "HIT_TARGET"
        assert resolution["pnl_percent"] == 18.0  # (100 - 82) / 100 * 100

    def test_evaluate_sell_hit_stop(self):
        sell_order = dict(self.base_order, action="SELL", stop_loss=115.0, target_price=85.0)
        resolution = self.resolver.evaluate_order(sell_order, current_price=118.0)
        assert resolution is not None
        assert resolution["status"] == "HIT_STOP"
        assert resolution["pnl_percent"] == -18.0  # (100 - 118) / 100 * 100

    def test_evaluate_expired_order(self):
        old_time = datetime.now(timezone.utc) - timedelta(days=15)
        expired_order = dict(self.base_order, timestamp_utc=old_time)
        resolution = self.resolver.evaluate_order(expired_order, current_price=105.0)
        assert resolution is not None
        assert resolution["status"] == "EXPIRED"
        assert resolution["pnl_percent"] == 5.0

    def test_evaluate_invalid_prices(self):
        assert self.resolver.evaluate_order(self.base_order, current_price=None) is None
        assert self.resolver.evaluate_order(self.base_order, current_price=0.0) is None
        assert self.resolver.evaluate_order(self.base_order, current_price=-10.0) is None

    def test_evaluate_zero_limit_price(self):
        zero_limit = dict(self.base_order, limit_price=0.0)
        assert self.resolver.evaluate_order(zero_limit, current_price=125.0) is None


class TestTradeResolverPriceFetching:
    def setup_method(self):
        self.resolver = TradeResolver()

    def test_fetch_current_prices_empty(self):
        assert self.resolver.fetch_current_prices([]) == {}

    @patch("yfinance.Ticker")
    def test_fetch_current_prices_fast_info_success(self, mock_ticker_cls):
        mock_instance = MagicMock()
        mock_instance.fast_info.last_price = 142.50
        mock_ticker_cls.return_value = mock_instance

        prices = self.resolver.fetch_current_prices(["AAPL"])
        assert "AAPL" in prices
        assert prices["AAPL"] == 142.50

    @patch("yfinance.Ticker")
    def test_fetch_current_prices_history_fallback(self, mock_ticker_cls):
        import pandas as pd

        mock_instance = MagicMock()
        mock_instance.fast_info.last_price = None
        mock_instance.history.return_value = pd.DataFrame({"Close": [138.25]})
        mock_ticker_cls.return_value = mock_instance

        prices = self.resolver.fetch_current_prices(["MSFT"])
        assert "MSFT" in prices
        assert prices["MSFT"] == 138.25

    @patch("yfinance.Ticker")
    def test_fetch_current_prices_uses_cache(self, mock_ticker_cls):
        mock_instance = MagicMock()
        mock_instance.fast_info.last_price = 200.0
        mock_ticker_cls.return_value = mock_instance

        # First fetch fills cache
        prices1 = self.resolver.fetch_current_prices(["TSLA"])
        assert prices1["TSLA"] == 200.0
        assert mock_ticker_cls.call_count == 1

        # Second fetch should use cache without invoking Ticker
        prices2 = self.resolver.fetch_current_prices(["TSLA"])
        assert prices2["TSLA"] == 200.0
        assert mock_ticker_cls.call_count == 1

    @patch("yfinance.Ticker")
    def test_fetch_current_prices_fallback_to_stale_cache_on_error(self, mock_ticker_cls):
        # Prepopulate cache with older price
        self.resolver._price_cache["AMZN"] = (180.0, 0.0)  # expired timestamp
        mock_ticker_cls.side_effect = RuntimeError("Rate limited or network error")

        prices = self.resolver.fetch_current_prices(["AMZN"])
        assert prices["AMZN"] == 180.0

    def test_clear_price_cache(self):
        self.resolver._price_cache["TEST"] = (50.0, 12345.0)
        self.resolver.clear_price_cache()
        assert self.resolver._price_cache == {}


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

    @patch.object(TradeResolver, "fetch_current_prices")
    def test_process_cycle_executes_db_update_and_kafka(self, mock_fetch_prices):
        mock_fetch_prices.return_value = {"NVDA": 130.0}

        active_orders = [
            {
                "id": 1,
                "ticker": "NVDA",
                "timestamp_utc": datetime.now(timezone.utc),
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

        assert len(resolved) == 1
        assert resolved[0]["status"] == "HIT_TARGET"
        assert resolved[0]["realized_pnl_usd"] == 3000.0
        assert mock_cur.execute.called
        assert mock_conn.commit.called
        assert mock_producer.send.called
        sent_topic, payload = mock_producer.send.call_args[0]
        assert sent_topic == "trade-resolutions"
        assert payload["ticker"] == "NVDA"
        assert payload["realized_pnl_usd"] == 3000.0

    def test_stop_cleans_up_producer(self):
        mock_producer = MagicMock()
        self.resolver._producer = mock_producer
        self.resolver.stop()
        assert mock_producer.close.called
        assert self.resolver._producer is None
