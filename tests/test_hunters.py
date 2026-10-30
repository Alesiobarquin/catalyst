"""Unit tests for hunters parsing, surprise math, and classification helpers."""

import xml.etree.ElementTree as ET
from datetime import UTC, date, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from hunters.drifter_hunter import (
    _eps_surprise_pct,
    _num,
    _remember,
    _rev_surprise_pct,
)
from hunters.insider_hunter import (
    classify_signal,
    get_text,
    is_recent_trade,
    parse_form4_xml,
)
from hunters.whale_hunter import (
    _first_float,
    _option_columns,
    _parse_option_type,
)


def _mock_table_page(headers, rows):
    from unittest.mock import AsyncMock

    page = AsyncMock()
    page.content.return_value = ""
    page.query_selector.return_value = None
    table = AsyncMock()
    headings = []
    for text in headers:
        heading = AsyncMock()
        heading.inner_text.return_value = text
        headings.append(heading)

    async def query(selector):
        return headings if selector == "th" else rows

    table.query_selector_all.side_effect = query

    async def page_query(selector):
        return [table] if selector == "table" else []

    page.query_selector_all.side_effect = page_query
    return page


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

    def test_eps_surprise_pct_ignores_tiny_estimates(self):
        assert _eps_surprise_pct(0.03, 0.01) is None

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
    def test_option_columns_distinguishes_underlying_price_and_strike(self):
        columns = _option_columns(
            ["Symbol", "Price", "Type", "Strike", "Exp Date", "Volume", "Delta"]
        )
        assert columns == {
            "ticker": 0,
            "option_type": 2,
            "strike_price": 3,
            "expiration_date": 4,
            "option_volume": 5,
        }

    def test_option_columns_rejects_unrelated_table(self):
        assert _option_columns(["Symbol", "Price", "Change", "Volume"]) is None

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

    def test_classify_signal_matches_title_substrings(self):
        assert classify_signal("P", 1_500_000, ["Chief Executive Officer"]) == "STRONG_BUY"
        assert classify_signal("P", 1_500_000, ["President & CEO"]) == "STRONG_BUY"
        assert classify_signal("P", 1_500_000, ["Senior Vice President"]) == "BUY"

    def test_parse_form4_aggregates_rows_and_reads_all_owners(self):
        row = """
            <nonDerivativeTransaction>
                <transactionDate><value>{date}</value></transactionDate>
                <transactionCoding><transactionCode>S</transactionCode></transactionCoding>
                <transactionAmounts>
                    <transactionShares><value>{shares}</value></transactionShares>
                    <transactionPricePerShare><value>{price}</value></transactionPricePerShare>
                </transactionAmounts>
            </nonDerivativeTransaction>"""
        rows = "".join(
            row.format(date=d, shares=s, price=p)
            for d, s, p in [("2026-10-26", 4000, 100), ("2026-10-27", 6000, 110)]
        )
        sample_xml = f"""<ownershipDocument>
            <documentType>4</documentType>
            <aff10b5One>1</aff10b5One>
            <issuer><issuerTradingSymbol>ABC</issuerTradingSymbol></issuer>
            <reportingOwner>
                <reportingOwnerId><rptOwnerName>Fund LP</rptOwnerName></reportingOwnerId>
                <reportingOwnerRelationship><isTenPercentOwner>true</isTenPercentOwner></reportingOwnerRelationship>
            </reportingOwner>
            <reportingOwner>
                <reportingOwnerId><rptOwnerName>Jane Doe</rptOwnerName></reportingOwnerId>
                <reportingOwnerRelationship>
                    <isOfficer>1</isOfficer><officerTitle>Chief Financial Officer</officerTitle>
                </reportingOwnerRelationship>
            </reportingOwner>
            <nonDerivativeTable>{rows}</nonDerivativeTable>
        </ownershipDocument>""".encode()

        signals = parse_form4_xml(sample_xml, "1", "acc-1", "https://sec.gov/test")

        assert len(signals) == 1
        sig = signals[0]
        assert sig["shares"] == 10000
        assert sig["transaction_amount_usd"] == 1_060_000
        assert sig["transaction_price_per_share"] == 106
        assert sig["transaction_rows"] == 2
        assert sig["transaction_date"] == "2026-10-27"
        assert sig["insider_name"] == "Fund LP; Jane Doe"
        assert sig["insider_title"] == "10% Owner, Chief Financial Officer"
        assert sig["signal_strength"] == "STRONG_SELL"
        assert sig["is_10b5_1"] is True

    def test_parse_form4_rejects_non_ownership_documents(self):
        assert parse_form4_xml(b"<xbrl/>", "1", "acc", "url") == []

    def test_is_recent_trade_skips_amendments_and_old_trades(self):
        today = date(2026, 10, 29)
        assert is_recent_trade({"transaction_date": "2026-10-27"}, today) is True
        assert is_recent_trade({"transaction_date": "2026-09-01"}, today) is False
        assert is_recent_trade({"transaction_date": None}, today) is True
        assert (
            is_recent_trade({"document_type": "4/A", "transaction_date": "2026-10-28"}, today)
            is False
        )


def _atom_feed(entries: list[tuple[str, str, str]]) -> bytes:
    body = "".join(
        f"""<entry>
            <title>4 - Example ({cik}) (Reporting)</title>
            <link href="https://www.sec.gov/Archives/edgar/data/{cik}/{acc}-index.htm"/>
            <category term="{form}"/>
            <updated>{updated}</updated>
        </entry>"""
        for cik, acc, form, updated in [(e[0], e[1], "4", e[2]) for e in entries]
    )
    return f'<feed xmlns="http://www.w3.org/2005/Atom">{body}</feed>'.encode()


class TestInsiderFeed:
    @pytest.mark.asyncio
    async def test_paging_stops_at_lookback_cutoff(self):
        from hunters import insider_hunter

        now = datetime(2026, 10, 29, 14, 0, tzinfo=UTC)
        fresh = [(str(i), f"acc-{i}", "2026-10-29T09:00:00-04:00") for i in range(100)]
        page_two = [
            ("200", "acc-200", "2026-10-28T16:00:00-04:00"),
            ("201", "acc-201", "2026-10-27T16:00:00-04:00"),
        ]
        responses = [
            MagicMock(status_code=200, content=_atom_feed(fresh)),
            MagicMock(status_code=200, content=_atom_feed(page_two)),
        ]
        get = AsyncMock(side_effect=responses)
        with patch.object(insider_hunter, "async_http_get_with_retry", get):
            entries = await insider_hunter.fetch_recent_entries(
                MagicMock(), insider_hunter._RateLimiter(0), now
            )

        assert len(entries) == 101
        assert entries[-1]["accession"] == "acc-200"
        assert get.await_count == 2
        assert "start=100" in get.await_args_list[1].args[1]

    @pytest.mark.asyncio
    async def test_failed_filing_does_not_abort_sweep(self):
        from hunters import insider_hunter

        entries = [{"accession": "bad"}, {"accession": "good"}]
        signal = {"ticker": "ABC"}

        async def process(client, limiter, entry, today):
            if entry["accession"] == "bad":
                raise httpx.ReadTimeout("timeout")
            return [signal]

        with (
            patch.object(insider_hunter, "fetch_recent_entries", AsyncMock(return_value=entries)),
            patch.object(insider_hunter, "process_filing", side_effect=process),
            patch.object(insider_hunter, "fetch_liquidity", AsyncMock(return_value={})),
            patch.object(insider_hunter, "publish_signal", return_value=True) as publish,
        ):
            processed: dict[str, None] = {}
            emitted = await insider_hunter.sweep(MagicMock(), processed)

        assert emitted == 1
        publish.assert_called_once_with(signal, {})
        assert list(processed) == ["bad", "good"]

    @pytest.mark.asyncio
    async def test_all_filings_failing_is_a_provider_error(self):
        from hunters import insider_hunter
        from hunters.common.provider_errors import ProviderError

        with (
            patch.object(
                insider_hunter,
                "fetch_recent_entries",
                AsyncMock(return_value=[{"accession": "a"}, {"accession": "b"}]),
            ),
            patch.object(
                insider_hunter, "process_filing", AsyncMock(side_effect=httpx.ReadTimeout("t"))
            ),
            pytest.raises(ProviderError),
        ):
            await insider_hunter.sweep(MagicMock(), {})

    @pytest.mark.asyncio
    async def test_once_mode_requires_sec_contact(self):
        from hunters import insider_hunter
        from hunters.common.provider_errors import ProviderError

        with patch.object(insider_hunter, "SEC_USER_AGENT", ""), pytest.raises(ProviderError):
            await insider_hunter.run(once=True)


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
            mock_run.return_value = {
                "hunter": "test",
                "success": True,
                "error": None,
                "duration_sec": 0.1,
            }
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
            mock_run.return_value = {
                "hunter": "drifter",
                "success": True,
                "error": None,
                "duration_sec": 0.2,
            }
            with patch("sys.argv", ["main.py", "drifter"]):
                results = await main()

        assert len(results) == 1
        assert results[0]["hunter"] == "drifter"
        mock_run.assert_called_once_with("drifter", timeout_sec=None, once=False)


class TestBiotechScraper:
    import pytest

    @pytest.mark.asyncio
    async def test_scrape_biopharm_filters_high_impact(self):
        from unittest.mock import AsyncMock

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
            make_cell("$100.00"),
            make_cell("Aducanumab"),
            make_cell("Phase 3 readout"),
            make_cell("2026-06-30"),
        ]

        # Row 2: Low impact (Phase 1, should be ignored)
        row2 = AsyncMock()
        row2.query_selector_all.return_value = [
            make_cell("PFE"),
            make_cell("$25.00"),
            make_cell("PF-001"),
            make_cell("Phase 1 trial"),
            make_cell("2026-07-15"),
        ]

        # Row 3: High impact (PDUFA)
        row3 = AsyncMock()
        row3.query_selector_all.return_value = [
            make_cell("MRNA"),
            make_cell("$30.00"),
            make_cell("mRNA-1273"),
            make_cell("PDUFA Decision"),
            make_cell("2026-08-01"),
        ]

        mock_page = _mock_table_page(
            ["Ticker", "Price", "Drug", "Stage", "Catalyst"], [row1, row2, row3]
        )

        catalysts = await scrape_biopharm(mock_page)

        assert len(catalysts) == 2
        tickers = [c["ticker"] for c in catalysts]
        assert "BIIB" in tickers
        assert "MRNA" in tickers
        assert "PFE" not in tickers
        assert catalysts[0]["hunter"] == "biotech"
        assert catalysts[0]["source_hunter"] == "biotech"
        assert catalysts[0]["drug_name"] == "Aducanumab"
        assert catalysts[0]["event_date"] == "2026-06-30"


class TestDrifterSweep:
    import pytest

    @pytest.mark.asyncio
    async def test_run_sweep_filters_and_emits(self):
        from unittest.mock import AsyncMock, MagicMock, patch

        import hunters.drifter_hunter as dh
        from hunters.drifter_hunter import _run_sweep

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

        with (
            patch("hunters.drifter_hunter._fetch_calendar", new_callable=AsyncMock) as mock_fetch,
            patch("hunters.drifter_hunter.fetch_liquidity_metrics") as mock_liq,
        ):
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


class TestWhaleScraper:
    import pytest

    @pytest.mark.asyncio
    async def test_scrape_whale_parses_rows(self):
        from unittest.mock import AsyncMock, patch

        from hunters.whale_hunter import scrape_whale

        mock_page = AsyncMock()

        def make_cell(text):
            cell = AsyncMock()
            cell.inner_text.return_value = text
            return cell

        mock_link = AsyncMock()
        mock_link.inner_text.return_value = "TSLA"

        row1 = AsyncMock()
        row1.query_selector.return_value = mock_link
        row1.query_selector_all.return_value = [
            make_cell("TSLA"),
            make_cell("$215.25"),
            make_cell("Call"),
            make_cell("$220.00"),
            make_cell("10/16/26"),
            make_cell("5,000"),
            make_cell("0.34"),
        ]

        mock_page = _mock_table_page(
            ["Symbol", "Price", "Type", "Strike", "Exp Date", "Volume", "Delta"], [row1]
        )

        with patch("asyncio.sleep", new_callable=AsyncMock):
            results = await scrape_whale(mock_page)

        assert len(results) == 1
        assert results[0]["ticker"] == "TSLA"
        assert results[0]["option_type"] == "call"
        assert results[0]["strike_price"] == 220.0
        assert results[0]["option_volume"] == 5000
        assert results[0]["expiration_date"] == "10/16/26"
        assert results[0]["hunter"] == "whale"
        assert results[0]["source_hunter"] == "whale"

    @pytest.mark.asyncio
    async def test_scrape_whale_deduplicates(self):
        from unittest.mock import AsyncMock, patch

        from hunters.whale_hunter import scrape_whale

        mock_page = AsyncMock()

        def make_cell(text):
            cell = AsyncMock()
            cell.inner_text.return_value = text
            return cell

        mock_link = AsyncMock()
        mock_link.inner_text.return_value = "TSLA"

        row = AsyncMock()
        row.query_selector.return_value = mock_link
        row.query_selector_all.return_value = [
            make_cell("TSLA"),
            make_cell("Call"),
            make_cell("$220.00"),
            make_cell("5,000"),
        ]

        # Two identical rows in table
        mock_page = _mock_table_page(["Symbol", "Type", "Strike", "Volume"], [row, row])

        with patch("asyncio.sleep", new_callable=AsyncMock):
            results = await scrape_whale(mock_page)

        assert len(results) == 1


class TestWhaleSweep:
    import pytest

    @pytest.mark.asyncio
    async def test_one_sweep_pushes_to_kafka(self):
        from unittest.mock import AsyncMock, MagicMock, patch

        from hunters.whale_hunter import _one_sweep

        mock_kafka = MagicMock()
        mock_entries = [
            {
                "ticker": "NVDA",
                "option_type": "call",
                "strike_price": 130.0,
                "option_volume": 12000,
                "source": "barchart_unusual",
                "hunter": "whale",
                "source_hunter": "whale",
            }
        ]

        mock_browser = AsyncMock()
        mock_browser.new_page.return_value = AsyncMock()

        mock_context = MagicMock()
        mock_context.__aenter__.return_value = mock_browser
        mock_context.__aexit__.return_value = None

        with (
            patch("hunters.whale_hunter.BrowserContext", return_value=mock_context),
            patch("hunters.whale_hunter.scrape_whale", new_callable=AsyncMock) as mock_scrape,
            patch("hunters.whale_hunter.fetch_liquidity_metrics") as mock_liq,
        ):
            mock_scrape.return_value = mock_entries
            mock_liq.return_value = {
                "price": 125.0,
                "volume": 45_000_000,
                "relative_volume": 3.2,
            }

            pushed = await _one_sweep(mock_kafka)

        assert pushed == 1
        assert mock_kafka.send_message.call_count == 2
        call_args = mock_kafka.send_message.call_args_list[0]
        assert call_args[0][1]["ticker"] == "NVDA"
        assert call_args[0][1]["price"] == 125.0
        assert call_args[0][1]["source_hunter"] == "whale"

    @pytest.mark.asyncio
    async def test_one_sweep_skips_missing_liquidity(self):
        from unittest.mock import AsyncMock, MagicMock, patch

        from hunters.whale_hunter import _one_sweep

        mock_kafka = MagicMock()
        mock_entries = [{"ticker": "UNKNOWN_TICKER"}]

        mock_browser = AsyncMock()
        mock_context = MagicMock()
        mock_context.__aenter__.return_value = mock_browser
        mock_context.__aexit__.return_value = None

        with (
            patch("hunters.whale_hunter.BrowserContext", return_value=mock_context),
            patch("hunters.whale_hunter.scrape_whale", new_callable=AsyncMock) as mock_scrape,
            patch("hunters.whale_hunter.fetch_liquidity_metrics", return_value=None),
        ):
            mock_scrape.return_value = mock_entries
            pushed = await _one_sweep(mock_kafka)

        assert pushed == 0
        assert mock_kafka.send_message.call_count == 0

    @pytest.mark.asyncio
    async def test_one_sweep_empty_rows(self):
        from unittest.mock import AsyncMock, MagicMock, patch

        from hunters.whale_hunter import _one_sweep

        mock_kafka = MagicMock()
        mock_browser = AsyncMock()
        mock_context = MagicMock()
        mock_context.__aenter__.return_value = mock_browser
        mock_context.__aexit__.return_value = None

        with (
            patch("hunters.whale_hunter.BrowserContext", return_value=mock_context),
            patch("hunters.whale_hunter.scrape_whale", new_callable=AsyncMock, return_value=[]),
        ):
            pushed = await _one_sweep(mock_kafka)

        assert pushed == 0
