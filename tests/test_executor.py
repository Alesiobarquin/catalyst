"""Unit tests for the Alpaca paper executor service."""

from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from executor.consumer import (
    parse_ts,
    place_alpaca_order,
    process_message,
    resolve_trade_order_row,
)


class TestExecutorParseTs:
    def test_parse_none_or_empty(self):
        assert parse_ts(None) is None
        assert parse_ts("") is None

    def test_parse_utc_iso_string(self):
        dt = parse_ts("2026-03-27T14:30:00Z")
        assert dt is not None
        assert dt.year == 2026
        assert dt.month == 3
        assert dt.day == 27
        assert dt.hour == 14
        assert dt.minute == 30
        assert dt.tzinfo is not None

    def test_parse_with_offset(self):
        dt = parse_ts("2026-03-27T10:00:00+00:00")
        assert dt is not None
        assert dt.tzinfo == timezone.utc

    def test_parse_invalid_string(self):
        assert parse_ts("invalid-timestamp") is None


class TestPlaceAlpacaOrder:
    def test_invalid_payload_skipped(self):
        ok, oid, st, _fill, err = place_alpaca_order(
            "key", "secret", {"ticker": "", "limit_price": 0, "recommended_size_usd": 0}
        )
        assert not ok
        assert oid is None
        assert st == "skipped_invalid_payload"
        assert err is not None

    def test_zero_limit_price_skipped(self):
        ok, _oid, st, _fill, _err = place_alpaca_order(
            "key", "secret", {"ticker": "AAPL", "limit_price": 0, "recommended_size_usd": 1000}
        )
        assert not ok
        assert st == "skipped_invalid_payload"

    @patch("executor.consumer.httpx.Client")
    def test_order_success_filled(self, mock_client_cls):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.content = (
            b'{"id": "alpaca-order-1", "status": "filled", "filled_avg_price": "150.50"}'
        )
        mock_resp.json.return_value = {
            "id": "alpaca-order-1",
            "status": "filled",
            "filled_avg_price": "150.50",
        }
        mock_client = MagicMock()
        mock_client.__enter__.return_value.post.return_value = mock_resp
        mock_client_cls.return_value = mock_client

        payload = {
            "ticker": "AAPL",
            "action": "BUY",
            "limit_price": 150.0,
            "recommended_size_usd": 1500.0,
        }
        ok, oid, st, fill, err = place_alpaca_order("test-key", "test-secret", payload)
        assert ok
        assert oid == "alpaca-order-1"
        assert st == "filled"
        assert fill == 150.50
        assert err is None

    @patch("executor.consumer.httpx.Client")
    def test_order_rejected(self, mock_client_cls):
        mock_resp = MagicMock()
        mock_resp.status_code = 403
        mock_resp.content = b'{"message": "insufficient buying power"}'
        mock_resp.json.return_value = {"message": "insufficient buying power"}
        mock_client = MagicMock()
        mock_client.__enter__.return_value.post.return_value = mock_resp
        mock_client_cls.return_value = mock_client

        payload = {
            "ticker": "TSLA",
            "action": "BUY",
            "limit_price": 200.0,
            "recommended_size_usd": 5000.0,
        }
        ok, oid, st, _fill, err = place_alpaca_order("test-key", "test-secret", payload)
        assert not ok
        assert oid is None
        assert st == "rejected"
        assert "insufficient" in str(err)

    @patch("executor.consumer.httpx.Client")
    def test_order_network_exception(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client.__enter__.return_value.post.side_effect = ConnectionError("network unreachable")
        mock_client_cls.return_value = mock_client

        payload = {
            "ticker": "NVDA",
            "action": "BUY",
            "limit_price": 120.0,
            "recommended_size_usd": 2000.0,
        }
        ok, _oid, st, _fill, err = place_alpaca_order("key", "secret", payload)
        assert not ok
        assert st == "error"
        assert "network unreachable" in str(err)


class TestResolveTradeOrderRow:
    def test_resolves_existing_row(self):
        now = datetime.now(timezone.utc)
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = (101, now)
        mock_conn.execute.return_value = mock_cursor

        result = resolve_trade_order_row(mock_conn, "NVDA", now)
        assert result == (101, now)
        mock_conn.execute.assert_called_once()

    @patch("time.sleep", return_value=None)
    def test_resolves_after_retries_returns_none(self, mock_sleep):
        now = datetime.now(timezone.utc)
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None
        mock_conn.execute.return_value = mock_cursor

        result = resolve_trade_order_row(mock_conn, "NVDA", now)
        assert result is None
        assert mock_conn.execute.call_count == 15


class TestProcessMessage:
    @patch("executor.consumer.fetch_users")
    def test_process_message_no_users_skips(self, mock_fetch_users):
        mock_fetch_users.return_value = []
        mock_conn = MagicMock()

        payload = {
            "ticker": "NVDA",
            "timestamp_utc": "2026-03-27T14:30:00Z",
            "limit_price": 120.0,
        }
        process_message(mock_conn, payload)
        mock_conn.execute.assert_not_called()

    @patch("executor.consumer.place_alpaca_order")
    @patch("executor.consumer.resolve_trade_order_row")
    @patch("executor.consumer.fetch_users")
    def test_process_message_successful_execution(
        self, mock_fetch_users, mock_resolve, mock_place_order
    ):
        now = datetime.now(timezone.utc)
        mock_fetch_users.return_value = [("user_123", "apk_live", "sec_live")]
        mock_resolve.return_value = (42, now)
        mock_place_order.return_value = (True, "alpaca-ord-99", "filled", 120.50, None)

        mock_conn = MagicMock()
        mock_insert_cur = MagicMock()
        mock_insert_cur.fetchone.return_value = (1,)  # inserted successfully
        mock_conn.execute.return_value = mock_insert_cur

        payload = {
            "ticker": "NVDA",
            "timestamp_utc": now.isoformat(),
            "action": "BUY",
            "limit_price": 120.0,
            "recommended_size_usd": 2000.0,
        }
        process_message(mock_conn, payload)

        mock_place_order.assert_called_once_with("apk_live", "sec_live", payload)
        assert mock_conn.execute.call_count == 2  # INSERT + UPDATE

    @patch("executor.consumer.place_alpaca_order")
    @patch("executor.consumer.resolve_trade_order_row")
    @patch("executor.consumer.fetch_users")
    def test_process_message_duplicate_skipped(
        self, mock_fetch_users, mock_resolve, mock_place_order
    ):
        now = datetime.now(timezone.utc)
        mock_fetch_users.return_value = [("user_123", "apk_live", "sec_live")]
        mock_resolve.return_value = (42, now)

        mock_conn = MagicMock()
        mock_insert_cur = MagicMock()
        mock_insert_cur.fetchone.return_value = None  # ON CONFLICT DO NOTHING -> None
        mock_conn.execute.return_value = mock_insert_cur

        payload = {
            "ticker": "NVDA",
            "timestamp_utc": now.isoformat(),
            "action": "BUY",
            "limit_price": 120.0,
        }
        process_message(mock_conn, payload)

        mock_place_order.assert_not_called()
        assert mock_conn.execute.call_count == 1  # only INSERT attempted

    @patch("executor.consumer.place_alpaca_order")
    @patch("executor.consumer.resolve_trade_order_row")
    @patch("executor.consumer.fetch_users")
    def test_process_message_tripped_circuit_breaker_skips(
        self, mock_fetch_users, mock_resolve, mock_place_order
    ):
        from executor.consumer import UserCircuitBreaker

        cb = UserCircuitBreaker(failure_threshold=1, cooldown_seconds=60.0)
        cb.record_failure("user_123", is_auth_failure=True)

        now = datetime.now(timezone.utc)
        mock_fetch_users.return_value = [("user_123", "apk_live", "sec_live")]
        mock_resolve.return_value = (42, now)

        mock_conn = MagicMock()
        mock_insert_cur = MagicMock()
        mock_insert_cur.fetchone.return_value = (1,)  # inserted pending
        mock_conn.execute.return_value = mock_insert_cur

        payload = {
            "ticker": "NVDA",
            "timestamp_utc": now.isoformat(),
            "action": "BUY",
            "limit_price": 120.0,
            "recommended_size_usd": 2000.0,
        }
        process_message(mock_conn, payload, circuit_breaker=cb)

        # Order placement should be bypassed due to circuit breaker
        mock_place_order.assert_not_called()
        # INSERT + UPDATE status to 'skipped_circuit_breaker'
        assert mock_conn.execute.call_count == 2


class TestUserCircuitBreaker:
    def test_initial_state_allowed(self):
        from executor.consumer import UserCircuitBreaker

        cb = UserCircuitBreaker(failure_threshold=3, cooldown_seconds=60.0)
        assert cb.is_allowed("user_1")

    def test_trips_after_threshold_failures(self):
        from executor.consumer import UserCircuitBreaker

        cb = UserCircuitBreaker(failure_threshold=3, cooldown_seconds=60.0)
        cb.record_failure("user_1")
        assert cb.is_allowed("user_1")
        cb.record_failure("user_1")
        assert cb.is_allowed("user_1")
        cb.record_failure("user_1")
        assert not cb.is_allowed("user_1")

    def test_trips_immediately_on_auth_failure(self):
        from executor.consumer import UserCircuitBreaker

        cb = UserCircuitBreaker(failure_threshold=5, cooldown_seconds=60.0)
        cb.record_failure("user_bad_keys", is_auth_failure=True)
        assert not cb.is_allowed("user_bad_keys")

    def test_cooldown_recovery_half_opens(self):
        import time

        from executor.consumer import UserCircuitBreaker

        cb = UserCircuitBreaker(failure_threshold=1, cooldown_seconds=0.05)
        cb.record_failure("user_1", is_auth_failure=True)
        assert not cb.is_allowed("user_1")

        time.sleep(0.06)
        assert cb.is_allowed("user_1")

    def test_success_resets_failures(self):
        from executor.consumer import UserCircuitBreaker

        cb = UserCircuitBreaker(failure_threshold=3, cooldown_seconds=60.0)
        cb.record_failure("user_1")
        cb.record_failure("user_1")
        cb.record_success("user_1")
        cb.record_failure("user_1")
        assert cb.is_allowed("user_1")


class TestRateLimitAndSafetyGuards:
    def test_order_exceeding_safety_limit_rejected(self):
        payload = {
            "ticker": "AAPL",
            "action": "BUY",
            "limit_price": 150.0,
            "recommended_size_usd": 250000.0,  # exceeds 100k
        }
        ok, oid, st, _fill, err = place_alpaca_order("key", "secret", payload)
        assert not ok
        assert oid is None
        assert st == "rejected_safety_limit"
        assert "exceeds safety limit" in str(err)

    @patch("time.sleep", return_value=None)
    @patch("executor.consumer.httpx.Client")
    def test_429_rate_limit_retry_succeeds(self, mock_client_cls, mock_sleep):
        resp_429 = MagicMock()
        resp_429.status_code = 429
        resp_429.headers = {"retry-after": "1"}
        resp_429.content = b'{"message": "rate limit exceeded"}'
        resp_429.json.return_value = {"message": "rate limit exceeded"}

        resp_200 = MagicMock()
        resp_200.status_code = 200
        resp_200.content = (
            b'{"id": "order-retried-ok", "status": "filled", "filled_avg_price": "100.0"}'
        )
        resp_200.json.return_value = {
            "id": "order-retried-ok",
            "status": "filled",
            "filled_avg_price": "100.0",
        }

        mock_client = MagicMock()
        mock_client.__enter__.return_value.post.side_effect = [resp_429, resp_200]
        mock_client_cls.return_value = mock_client

        payload = {
            "ticker": "AAPL",
            "action": "BUY",
            "limit_price": 100.0,
            "recommended_size_usd": 1000.0,
        }
        ok, oid, st, fill, _err = place_alpaca_order("key", "secret", payload, max_retries=2)
        assert ok
        assert oid == "order-retried-ok"
        assert st == "filled"
        assert fill == 100.0
        assert mock_sleep.called

    @patch("time.sleep", return_value=None)
    @patch("executor.consumer.httpx.Client")
    def test_429_rate_limit_exhausted_returns_rejected(self, mock_client_cls, mock_sleep):
        resp_429 = MagicMock()
        resp_429.status_code = 429
        resp_429.headers = {}
        resp_429.content = b'{"message": "rate limit exceeded"}'
        resp_429.json.return_value = {"message": "rate limit exceeded"}

        mock_client = MagicMock()
        mock_client.__enter__.return_value.post.return_value = resp_429
        mock_client_cls.return_value = mock_client

        payload = {
            "ticker": "AAPL",
            "action": "BUY",
            "limit_price": 100.0,
            "recommended_size_usd": 1000.0,
        }
        ok, oid, st, _fill, err = place_alpaca_order("key", "secret", payload, max_retries=1)
        assert not ok
        assert oid is None
        assert st == "rejected"
        assert "rate limited (429)" in str(err)
