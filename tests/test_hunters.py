"""Unit tests for hunters parsing, surprise math, and classification helpers."""

import xml.etree.ElementTree as ET

from hunters.biotech_hunter import _clean_ticker
from hunters.drifter_hunter import (
    _eps_surprise_pct,
    _num,
    _remember,
    _rev_surprise_pct,
)
from hunters.insider_hunter import (
    classify_signal,
    get_text,
    parse_form4_xml,
)
from hunters.whale_hunter import (
    _first_float,
    _parse_option_type,
)


class TestDrifterHunterHelpers:
    def test_eps_surprise_pct_positive_beat(self):
        assert _eps_surprise_pct(1.20, 1.00) == 20.0

    def test_eps_surprise_pct_miss(self):
        assert _eps_surprise_pct(0.80, 1.00) == -20.0

    def test_eps_surprise_pct_negative_estimate(self):
        # eps = -0.50, est = -1.00 -> (-0.50 - (-1.00)) / 1.00 * 100 = 50.0%
        assert _eps_surprise_pct(-0.50, -1.00) == 50.0

    def test_eps_surprise_pct_zero_estimate_returns_none(self):
        assert _eps_surprise_pct(0.50, 0.0) is None

    def test_eps_surprise_pct_none_returns_none(self):
        assert _eps_surprise_pct(None, 1.0) is None
        assert _eps_surprise_pct(1.0, None) is None
        assert _eps_surprise_pct(None, None) is None

    def test_rev_surprise_pct_beat(self):
        assert _rev_surprise_pct(110_000_000, 100_000_000) == 10.0

    def test_rev_surprise_pct_zero_or_none(self):
        assert _rev_surprise_pct(100, 0.0) is None
        assert _rev_surprise_pct(None, 100) is None

    def test_num_conversion(self):
        assert _num(42) == 42.0
        assert _num("3.1415") == 3.1415
        assert _num("invalid") is None
        assert _num(None) is None

    def test_remember_dedup(self):
        import hunters.drifter_hunter as dh

        dh._SEEN.clear()
        dh._SEEN_SET.clear()

        assert _remember("KEY1") is True
        assert _remember("KEY1") is False
        assert _remember("KEY2") is True


class TestWhaleHunterHelpers:
    def test_parse_option_type(self):
        assert _parse_option_type("call") == "call"
        assert _parse_option_type("PUT") == "put"
        assert _parse_option_type("100 Calls Traded") == "call"
        assert _parse_option_type("Unusual Put Sweep") == "put"
        assert _parse_option_type("") == "call"
        assert _parse_option_type(None) == "call"

    def test_first_float(self):
        assert _first_float(["$150.50", "200"]) == 150.50
        assert _first_float(["N/A", "1,250.75"]) == 1250.75
        assert _first_float(["foo", "bar"]) is None
        # Out of bounds (> 1e6 or < 0.01)
        assert _first_float(["0.0001", "10000000"]) is None


class TestInsiderHunterHelpers:
    def test_classify_signal_strong_buy(self):
        assert classify_signal("P", 1_500_000, ["CEO", "Director"]) == "STRONG_BUY"

    def test_classify_signal_buy(self):
        assert classify_signal("P", 350_000, ["VP of Sales"]) == "BUY"

    def test_classify_signal_weak_buy(self):
        assert classify_signal("P", 50_000, ["Director"]) == "WEAK_BUY"

    def test_classify_signal_strong_sell(self):
        assert classify_signal("S", 2_000_000, ["CFO"]) == "STRONG_SELL"

    def test_classify_signal_sell(self):
        assert classify_signal("S", 300_000, ["Officer"]) == "SELL"

    def test_classify_signal_weak_sell(self):
        assert classify_signal("S", 20_000, ["Director"]) == "WEAK_SELL"

    def test_classify_signal_non_signal_code(self):
        assert classify_signal("A", 10_000_000, ["CEO"]) == "NOISE"
        assert classify_signal("M", 5_000_000, ["CEO"]) == "NOISE"

    def test_get_text_nested_value(self):
        xml_str = "<shares><value>5000</value></shares>"
        el = ET.fromstring(xml_str)
        assert get_text(el, "shares") is None  # searching children
        # parent with child:
        parent = ET.fromstring("<root><shares><value>5000</value></shares></root>")
        assert get_text(parent, "shares") == "5000"

    def test_get_text_direct_node(self):
        parent = ET.fromstring("<root><symbol>AAPL</symbol></root>")
        assert get_text(parent, "symbol") == "AAPL"
        assert get_text(parent, "missing") is None

    def test_parse_form4_xml(self):
        sample_xml = b"""<?xml version="1.0"?>
        <ownershipDocument>
            <issuer>
                <issuerTradingSymbol>NVDA</issuerTradingSymbol>
                <issuerName>NVIDIA CORP</issuerName>
            </issuer>
            <reportingOwner>
                <reportingOwnerId>
                    <rptOwnerName>Huang Jen Hsun</rptOwnerName>
                </reportingOwnerId>
                <reportingOwnerRelationship>
                    <isDirector>1</isDirector>
                    <isOfficer>1</isOfficer>
                    <officerTitle>Chief Executive Officer</officerTitle>
                </reportingOwnerRelationship>
            </reportingOwner>
            <nonDerivativeTable>
                <nonDerivativeTransaction>
                    <transactionCoding>
                        <transactionCode>P</transactionCode>
                    </transactionCoding>
                    <transactionAmounts>
                        <transactionShares><value>10000</value></transactionShares>
                        <transactionPricePerShare><value>120.00</value></transactionPricePerShare>
                    </transactionAmounts>
                    <postTransactionAmounts>
                        <sharesOwnedFollowingTransaction><value>500000</value></sharesOwnedFollowingTransaction>
                    </postTransactionAmounts>
                </nonDerivativeTransaction>
            </nonDerivativeTable>
        </ownershipDocument>
        """
        signals = parse_form4_xml(
            sample_xml,
            cik="0001045810",
            accession="0001045810-26-000001",
            filing_url="https://sec.gov/test",
        )
        assert len(signals) == 1
        sig = signals[0]
        assert sig["ticker"] == "NVDA"
        assert sig["hunter"] == "insider"
        assert sig["insider_name"] == "Huang Jen Hsun"
        assert sig["transaction_code"] == "P"
        assert sig["shares"] == 10000.0
        assert sig["transaction_price_per_share"] == 120.00
        assert sig["transaction_amount_usd"] == 1_200_000.0
        assert sig["signal_strength"] == "STRONG_BUY"
        assert sig["is_buy"] is True
        assert sig["is_sell"] is False


class TestHttpRetryHelpers:
    def test_parse_retry_after_none_or_empty(self):
        from hunters.common.http_retry import parse_retry_after

        assert parse_retry_after(None, default_delay=2.5) == 2.5
        assert parse_retry_after("", default_delay=3.0) == 3.0

    def test_parse_retry_after_seconds_string(self):
        from hunters.common.http_retry import parse_retry_after

        assert parse_retry_after("15") == 15.0
        assert parse_retry_after(" 5.5 ") == 5.5

    def test_parse_retry_after_clamping(self):
        from hunters.common.http_retry import parse_retry_after

        assert parse_retry_after("100", max_delay=30.0) == 30.0
        assert parse_retry_after("-5", default_delay=2.0) == 0.1

    def test_parse_retry_after_http_date(self):
        from datetime import datetime, timedelta, timezone
        from email.utils import format_datetime

        from hunters.common.http_retry import parse_retry_after

        future_dt = datetime.now(timezone.utc) + timedelta(seconds=10)
        date_str = format_datetime(future_dt)
        parsed = parse_retry_after(date_str, max_delay=30.0)
        assert 5.0 <= parsed <= 15.0


class TestAsyncHttpGetWithRetry:
    import pytest

    @pytest.mark.asyncio
    async def test_successful_first_try(self):
        from unittest.mock import AsyncMock, MagicMock

        import httpx

        from hunters.common.http_retry import async_http_get_with_retry

        client = AsyncMock(spec=httpx.AsyncClient)
        mock_resp = MagicMock(spec=httpx.Response)
        mock_resp.status_code = 200
        client.get.return_value = mock_resp

        resp = await async_http_get_with_retry(client, "https://api.example.com/data")
        assert resp.status_code == 200
        assert client.get.call_count == 1

    @pytest.mark.asyncio
    async def test_retry_on_429_then_succeed(self):
        from unittest.mock import AsyncMock, MagicMock

        import httpx

        from hunters.common.http_retry import async_http_get_with_retry

        client = AsyncMock(spec=httpx.AsyncClient)
        resp_429 = MagicMock(spec=httpx.Response)
        resp_429.status_code = 429
        resp_429.headers = {"Retry-After": "0.01"}

        resp_200 = MagicMock(spec=httpx.Response)
        resp_200.status_code = 200

        client.get.side_effect = [resp_429, resp_200]

        resp = await async_http_get_with_retry(
            client, "https://api.example.com/rate-limited", base_delay=0.01
        )
        assert resp.status_code == 200
        assert client.get.call_count == 2

    @pytest.mark.asyncio
    async def test_retry_on_503_exhaust_retries(self):
        from unittest.mock import AsyncMock, MagicMock

        import httpx

        from hunters.common.http_retry import async_http_get_with_retry

        client = AsyncMock(spec=httpx.AsyncClient)
        resp_503 = MagicMock(spec=httpx.Response)
        resp_503.status_code = 503

        client.get.return_value = resp_503

        resp = await async_http_get_with_retry(
            client, "https://api.example.com/unavail", max_retries=2, base_delay=0.01
        )
        assert resp.status_code == 503
        assert client.get.call_count == 3  # initial + 2 retries

    @pytest.mark.asyncio
    async def test_retry_on_transport_error(self):
        from unittest.mock import AsyncMock, MagicMock

        import httpx

        from hunters.common.http_retry import async_http_get_with_retry

        client = AsyncMock(spec=httpx.AsyncClient)
        resp_200 = MagicMock(spec=httpx.Response)
        resp_200.status_code = 200

        client.get.side_effect = [
            httpx.ConnectError("Connection reset"),
            resp_200,
        ]

        resp = await async_http_get_with_retry(
            client, "https://api.example.com/flaky", base_delay=0.01
        )
        assert resp.status_code == 200
        assert client.get.call_count == 2


class TestBiotechHunterHelpers:
    def test_clean_ticker_standard(self):
        assert _clean_ticker("BIIB") == "BIIB"
        assert _clean_ticker("pfe") == "PFE"

    def test_clean_ticker_strips_dollar_and_whitespace(self):
        assert _clean_ticker("  $BIIB  ") == "BIIB"
        assert _clean_ticker("$MRNA") == "MRNA"

    def test_clean_ticker_strips_exchange_prefix_or_suffix(self):
        assert _clean_ticker("NASDAQ:BIIB") == "BIIB"
        assert _clean_ticker("BIIB:US") == "BIIB"
        assert _clean_ticker("BIIB.TO") == "BIIB"

    def test_clean_ticker_multiline_cell(self):
        assert _clean_ticker("BIIB\nBiogen Inc.") == "BIIB"

    def test_clean_ticker_invalid_inputs(self):
        assert _clean_ticker("") is None
        assert _clean_ticker(None) is None
        assert _clean_ticker("   ") is None
        assert _clean_ticker("TOOLONGTICKERNAME") is None


class TestHunterOrchestrator:
    import pytest

    @pytest.mark.asyncio
    async def test_run_hunter_unknown(self):
        from hunters.main import run_hunter

        res = await run_hunter("phantom_hunter")
        assert res["hunter"] == "phantom_hunter"
        assert res["success"] is False
        assert "Unknown hunter" in res["error"]
        assert res["duration_sec"] == 0.0

    @pytest.mark.asyncio
    async def test_run_hunter_success(self):
        from unittest.mock import AsyncMock, patch

        from hunters.main import run_hunter

        with patch("hunters.squeeze_hunter.run", new_callable=AsyncMock) as mock_run:
            res = await run_hunter("squeeze")

        assert res["hunter"] == "squeeze"
        assert res["success"] is True
        assert res["error"] is None
        assert res["duration_sec"] >= 0.0
        mock_run.assert_called_once()

    @pytest.mark.asyncio
    async def test_run_hunter_exception(self):
        from unittest.mock import AsyncMock, patch

        from hunters.main import run_hunter

        with patch("hunters.insider_hunter.run", new_callable=AsyncMock) as mock_run:
            mock_run.side_effect = RuntimeError("SEC EDGAR parse timeout")
            res = await run_hunter("insider")

        assert res["hunter"] == "insider"
        assert res["success"] is False
        assert "SEC EDGAR parse timeout" in res["error"]
        assert res["duration_sec"] >= 0.0

    @pytest.mark.asyncio
    async def test_run_hunter_timeout(self):
        import asyncio
        from unittest.mock import patch

        from hunters.main import run_hunter

        async def _slow_run():
            await asyncio.sleep(0.1)

        with patch("hunters.whale_hunter.run", side_effect=_slow_run):
            res = await run_hunter("whale", timeout_sec=0.01)

        assert res["hunter"] == "whale"
        assert res["success"] is False
        assert "Timed out after 0.01s" in res["error"]
        assert res["duration_sec"] >= 0.01

    @pytest.mark.asyncio
    async def test_main_cli_list(self, capsys):
        from unittest.mock import patch
        from hunters.main import main

        with patch("sys.argv", ["main.py", "--list"]):
            results = await main()

        assert results == []
        captured = capsys.readouterr()
        assert "Available hunters:" in captured.out
        assert "squeeze" in captured.out
        assert "biotech" in captured.out

    @pytest.mark.asyncio
    async def test_main_cli_all(self):
        from unittest.mock import AsyncMock, patch
        from hunters.main import main

        with patch("hunters.main.run_hunter", new_callable=AsyncMock) as mock_run:
            mock_run.return_value = {"hunter": "test", "success": True, "error": None, "duration_sec": 0.1}
            with patch("sys.argv", ["main.py", "all", "--timeout", "15"]):
                results = await main()

        assert len(results) == 5
        assert all(r["success"] is True for r in results)
        assert mock_run.call_count == 5

    @pytest.mark.asyncio
    async def test_main_cli_single(self):
        from unittest.mock import AsyncMock, patch
        from hunters.main import main

        with patch("hunters.main.run_hunter", new_callable=AsyncMock) as mock_run:
            mock_run.return_value = {"hunter": "drifter", "success": True, "error": None, "duration_sec": 0.2}
            with patch("sys.argv", ["main.py", "drifter"]):
                results = await main()

        assert len(results) == 1
        assert results[0]["hunter"] == "drifter"
        mock_run.assert_called_once_with("drifter", timeout_sec=None)


class TestBiotechScraper:
    import pytest

    @pytest.mark.asyncio
    async def test_scrape_biopharm_filters_high_impact(self):
        from unittest.mock import AsyncMock, MagicMock
        from hunters.biotech_hunter import scrape_biopharm

        mock_page = AsyncMock()

        # Cell mock helper
        def make_cell(text):
            cell = AsyncMock()
            cell.inner_text.return_value = text
            return cell

        # Row 1: High impact (Phase 3)
        row1 = AsyncMock()
        row1.query_selector_all.return_value = [
            make_cell("BIIB"),
            make_cell("Aducanumab"),
            make_cell("Phase 3 readout"),
            make_cell("2026-06-30"),
        ]

        # Row 2: Low impact (Phase 1, should be ignored)
        row2 = AsyncMock()
        row2.query_selector_all.return_value = [
            make_cell("PFE"),
            make_cell("PF-001"),
            make_cell("Phase 1 trial"),
            make_cell("2026-07-15"),
        ]

        # Row 3: High impact (PDUFA)
        row3 = AsyncMock()
        row3.query_selector_all.return_value = [
            make_cell("MRNA"),
            make_cell("mRNA-1273"),
            make_cell("PDUFA Decision"),
            make_cell("2026-08-01"),
        ]

        mock_page.query_selector_all.return_value = [row1, row2, row3]

        catalysts = await scrape_biopharm(mock_page)

        assert len(catalysts) == 2
        tickers = [c["ticker"] for c in catalysts]
        assert "BIIB" in tickers
        assert "MRNA" in tickers
        assert "PFE" not in tickers
        assert catalysts[0]["hunter"] == "biotech"
        assert catalysts[0]["source_hunter"] == "biotech"


class TestDrifterSweep:
    import pytest

    @pytest.mark.asyncio
    async def test_run_sweep_filters_and_emits(self):
        from unittest.mock import AsyncMock, MagicMock, patch
        from hunters.drifter_hunter import _run_sweep
        import hunters.drifter_hunter as dh

        dh._SEEN.clear()
        dh._SEEN_SET.clear()

        mock_client = AsyncMock()
        mock_kafka = MagicMock()

        sample_calendar = [
            {
                "symbol": "AAPL",
                "date": "2026-03-25",
                "eps": 2.10,
                "epsEstimated": 1.90,  # +10.53% beat (passes >= 5.0%)
                "revenue": 100_000_000,
                "revenueEstimated": 95_000_000,
            },
            {
                "symbol": "MSFT",
                "date": "2026-03-25",
                "eps": 2.02,
                "epsEstimated": 2.00,  # +1.0% beat (fails < 5.0%)
                "revenue": 50_000_000,
                "revenueEstimated": 50_000_000,
            },
        ]

        with patch("hunters.drifter_hunter._fetch_calendar", new_callable=AsyncMock) as mock_fetch, \
             patch("hunters.drifter_hunter.fetch_liquidity_metrics") as mock_liq:
            mock_fetch.return_value = sample_calendar
            mock_liq.return_value = {
                "price": 180.0,
                "volume": 25_000_000,
                "relative_volume": 2.5,
            }

            pushed = await _run_sweep(mock_client, mock_kafka)

        assert pushed == 1
        assert mock_kafka.send_message.call_count == 2  # KAFKA_TOPIC_DRIFTER + RAW_EVENTS_TOPIC
        call_args = mock_kafka.send_message.call_args_list[0]
        payload = call_args[0][1]
        assert payload["ticker"] == "AAPL"
        assert payload["hunter"] == "drifter"
        assert payload["source_hunter"] == "drifter"
        assert payload["price"] == 180.0
        assert payload["volume"] == 25_000_000


