"""Unit tests for hunters parsing, surprise math, and classification helpers."""

import xml.etree.ElementTree as ET

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
