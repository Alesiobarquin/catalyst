import pytest

from hunters.common.tickers import canonical_ticker


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("BIIB", "BIIB"),
        ("pfe", "PFE"),
        ("  $BIIB  ", "BIIB"),
        ("NASDAQ:BIIB", "BIIB"),
        ("BIIB:US", "BIIB"),
        ("BIIB.US", "BIIB"),
        ("BIIB\nBiogen Inc.", "BIIB"),
        ("BRK.B", "BRK-B"),
        ("BRK/B", "BRK-B"),
        ("BRK-B", "BRK-B"),
        ("ACHR.WS", "ACHR-WS"),
    ],
)
def test_canonical_form(raw, expected):
    assert canonical_ticker(raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        None,
        "",
        "   ",
        "TOOLONGTICKER",
        "T.TO",
        "SHEL.L",
        "7203.T",
        "XYZ:ABC",
        "NONE",
        "N/A",
        "BRK B",
    ],
)
def test_rejects_foreign_placeholder_and_malformed_symbols(raw):
    assert canonical_ticker(raw) is None
