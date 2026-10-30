"""Source failures must be actionable in reports without disclosing request secrets."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from hunters.common.provider_errors import ProviderError, check_browser_response
from hunters.main import run_hunter
from hunters.whale_hunter import scrape_whale


def _grid_page(headers, values, shadow=False):
    def cell(text):
        element = AsyncMock()
        element.inner_text.return_value = "" if shadow else text
        element.evaluate.return_value = text
        return element

    headings = [cell(text) for text in headers]
    if shadow:
        for heading, text in zip(headings, headers, strict=True):
            heading.inner_text.return_value = text
    row = AsyncMock()
    row.query_selector_all.return_value = [cell(text) for text in values]
    grid = AsyncMock()

    async def query(selector):
        return headings if selector == "[role='columnheader']" else [row]

    grid.query_selector_all.side_effect = query
    page = AsyncMock()
    page.goto.return_value = SimpleNamespace(status=202)
    page.content.return_value = "<div role='grid'>Unusual Options Activity</div>"

    async def roots(selector):
        return [grid] if selector == "[role='grid']" else []

    page.query_selector_all.side_effect = roots
    return page, row


def test_browser_http_failure_preserves_status():
    with pytest.raises(ProviderError, match=r"Finviz: HTTP error \(HTTP 403\)"):
        check_browser_response("finviz", SimpleNamespace(status=403))


def test_browser_challenge_is_not_market_data():
    with pytest.raises(ProviderError, match="access verification required"):
        check_browser_response(
            "barchart",
            SimpleNamespace(status=200),
            "In order to continue, we need to verify that you're not a robot.",
        )


def test_browser_navigation_without_response_is_not_an_empty_sweep():
    with pytest.raises(ProviderError, match="navigation returned no response"):
        check_browser_response("finviz", None)


@pytest.mark.asyncio
async def test_public_report_keeps_only_allowlisted_provider_detail(monkeypatch):
    monkeypatch.setattr(
        "hunters.squeeze_hunter.run",
        AsyncMock(side_effect=ProviderError("finviz", "http_error", 429)),
    )
    result = await run_hunter("squeeze", once=True)
    assert result["error"] == "Finviz: HTTP error (HTTP 429)"
    assert not result["success"]


@pytest.mark.asyncio
async def test_whale_http_failure_does_not_wait_for_nonexistent_market_table():
    page = AsyncMock()
    page.goto.return_value = SimpleNamespace(status=403)
    with pytest.raises(ProviderError, match="HTTP 403"):
        await scrape_whale(page)
    page.wait_for_selector.assert_not_awaited()


@pytest.mark.asyncio
async def test_whale_incompatible_table_fails_instead_of_successful_empty():
    page = AsyncMock()
    page.goto.return_value = SimpleNamespace(status=200)
    page.content.return_value = "<table><tr><td>unrelated table</td></tr></table>"
    page.query_selector_all.return_value = []
    with pytest.raises(ProviderError, match="expected data table columns are unavailable"):
        await scrape_whale(page)


@pytest.mark.asyncio
async def test_whale_parses_div_grid_instead_of_waiting_for_html_table():
    page, row = _grid_page(
        ["Symbol", "Price", "Type", "Strike", "Exp Date", "Volume", "Delta"],
        ["AAPL", "220.00", "Put", "200.00", "10/16/26", "12,345", "-0.30"],
    )
    result = await scrape_whale(page)
    assert result[0]["ticker"] == "AAPL"
    assert result[0]["strike_price"] == 200.0
    assert result[0]["option_type"] == "put"
    assert result[0]["option_volume"] == 12345
    assert result[0]["expiration_date"] == "10/16/26"
    row.query_selector_all.assert_awaited_once_with("[role='cell'], [role='gridcell']")


@pytest.mark.asyncio
async def test_dormant_challenge_markup_does_not_block_rendered_options():
    page, _ = _grid_page(["Symbol", "Type", "Strike", "Volume"], ["ABR", "Put", "3.00", "19,715"])
    page.content.return_value = (
        '<script>"px-captcha"; "cf-chl-"; "verify you are human";</script>'
        "<div role='grid'>Unusual Options Activity</div>"
    )
    page.inner_text.return_value = "Unusual Options Activity Symbol Type Strike Volume"
    result = await scrape_whale(page)
    assert result[0]["ticker"] == "ABR"
    page.inner_text.assert_awaited_once_with("body")


@pytest.mark.asyncio
async def test_whale_reads_production_shadow_cells_and_preserves_alignment():
    page, row = _grid_page(
        [
            "",
            "Symbol",
            "Price~",
            "Exp Date",
            "Type",
            "Strike",
            "Moneyness",
            "Bid",
            "Latest",
            "Ask",
            "Volume",
            "Open Int",
            "Vol/OI",
            "Imp Vol",
            "IV",
            "Delta",
            "Last Trade",
            "Details",
            "Links",
        ],
        [
            "",
            "ABR",
            "2.87",
            "10/16/26",
            "Put",
            "3.00",
            "-4.33%",
            "0.10",
            "0.20",
            "0.30",
            "19,715",
            "6,000",
            "3.29",
            "90%",
            "",
            "-0.30",
            "16:00 ET",
            "Details",
            "",
        ],
        shadow=True,
    )
    result = await scrape_whale(page)
    assert result[0]["ticker"] == "ABR"
    assert result[0]["strike_price"] == 3.0
    assert result[0]["option_volume"] == 19715
    assert result[0]["option_type"] == "put"
    assert result[0]["expiration_date"] == "10/16/26"
    assert result[0]["open_interest"] == 6000
    assert result[0]["vol_oi_ratio"] == 3.29
    assert result[0]["last_trade"] == "16:00 ET"
    cells = row.query_selector_all.return_value
    assert cells[3].evaluate.await_args.args[1] == "expirationDate"
    assert cells[11].evaluate.await_args.args[1] is None


@pytest.mark.asyncio
async def test_whale_unreadable_contract_rows_are_not_a_successful_empty_sweep():
    page, _ = _grid_page(["Symbol", "Type", "Strike", "Volume"], ["", "", "", ""])
    with pytest.raises(ProviderError, match="Barchart: unexpected response format"):
        await scrape_whale(page)


@pytest.mark.asyncio
async def test_biotech_incompatible_table_is_disclosed_in_strict_sweep(monkeypatch):
    from hunters.biotech_hunter import scrape_biopharm

    monkeypatch.setenv("HUNTER_STRICT_DELIVERY", "true")
    page = AsyncMock()
    page.goto.return_value = SimpleNamespace(status=200)
    page.content.return_value = "<table><tr><td>unrelated table</td></tr></table>"
    page.query_selector_all.return_value = []
    with pytest.raises(ProviderError, match="expected data table columns are unavailable"):
        await scrape_biopharm(page)


@pytest.mark.asyncio
async def test_biotech_locked_pdufa_calendar_is_not_a_successful_empty_sweep(monkeypatch):
    from hunters.biotech_hunter import scrape_biopharm

    monkeypatch.setenv("HUNTER_STRICT_DELIVERY", "true")

    def cell(text):
        element = AsyncMock()
        element.inner_text.return_value = text
        return element

    headers = [cell(text) for text in ["Ticker", "Name", "Price", "Drug", "PDUFA Date"]]
    row = AsyncMock()
    row.query_selector_all.return_value = [
        cell("AAPL"),
        cell("Company"),
        cell("100.00"),
        cell("Locked"),
        cell("Signup now for more information on this Catalyst"),
    ]
    table = AsyncMock()

    async def query(selector):
        return headers if selector == "th" else [row]

    table.query_selector_all.side_effect = query
    page = AsyncMock()
    page.goto.return_value = SimpleNamespace(status=200)
    page.content.return_value = "PDUFA calendar"
    page.query_selector_all.return_value = [table]
    with pytest.raises(ProviderError, match="catalyst details require provider account access"):
        await scrape_biopharm(page)


@pytest.mark.asyncio
async def test_fmp_error_object_is_not_a_successful_empty_calendar(monkeypatch):
    from hunters.drifter_hunter import _fetch_calendar

    response = SimpleNamespace(
        is_error=False,
        json=lambda: {"Error Message": "provider rejected request?apikey=secret"},
    )
    monkeypatch.setattr(
        "hunters.drifter_hunter.async_http_get_with_retry", AsyncMock(return_value=response)
    )
    with pytest.raises(ProviderError, match="FMP: unexpected response format") as error:
        await _fetch_calendar(AsyncMock())
    assert "secret" not in str(error.value)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("outcome", "code"),
    [
        ({"return_value": SimpleNamespace(is_error=True, status_code=401)}, "http_error"),
        ({"side_effect": httpx.ConnectError("failed for ?apikey=secret")}, "source_unavailable"),
    ],
)
async def test_fmp_failures_never_chain_the_keyed_url(monkeypatch, outcome, code):
    from hunters.drifter_hunter import _fetch_calendar

    monkeypatch.setattr("hunters.drifter_hunter.async_http_get_with_retry", AsyncMock(**outcome))
    with pytest.raises(ProviderError) as error:
        await _fetch_calendar(AsyncMock())
    assert error.value.code == code
    assert error.value.__cause__ is None
    assert error.value.__context__ is None or error.value.__suppress_context__


def test_one_malformed_pdufa_record_does_not_drop_the_rest():
    from datetime import datetime, timezone

    from hunters.common.pdufa_calendar import parse_pdufa_response

    good = {
        "ticker": "BIIB",
        "name": "Drug",
        "date": "2026-11-15",
        "date_precision": "day",
        "type": "PDUFA",
        "status": "upcoming",
        "source": "FDA",
        "source_url": "https://www.fda.gov/example",
    }
    events = parse_pdufa_response(
        {
            "data": [{"ticker": "broken"}, good],
            "meta": {"as_of": "2026-10-29T00:00:00Z", "served_from": "live"},
        },
        collected_at=datetime(2026, 10, 29, tzinfo=timezone.utc),
    )
    assert events[0]["ticker"] == "BIIB"
    assert events[0]["days_until_event"] == 17
    assert events[0]["calendar_truncated"] is False


@pytest.mark.asyncio
async def test_drifter_enrichment_failure_remains_retryable(monkeypatch):
    import hunters.drifter_hunter as hunter

    hunter._SEEN.clear()
    hunter._SEEN_SET.clear()
    monkeypatch.setattr(
        hunter,
        "_fetch_calendar",
        AsyncMock(
            return_value=[
                {
                    "symbol": "AAPL",
                    "date": "2026-10-09",
                    "epsActual": 2.0,
                    "epsEstimated": 1.5,
                }
            ]
        ),
    )
    monkeypatch.setattr(hunter, "fetch_liquidity_metrics", lambda _: None)
    await hunter._run_sweep(AsyncMock(), MagicMock())
    assert "AAPL:2026-10-09" not in hunter._SEEN_SET
