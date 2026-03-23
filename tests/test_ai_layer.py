"""Unit tests for AI Layer normalize_analysis, strip_code_fences, normalize_key_risks."""

from ai_layer.ai_service import AIAnalysisService


class TestStripCodeFences:
    def test_plain_text_unchanged(self):
        text = '{"conviction_score": 85}'
        assert AIAnalysisService.strip_code_fences(text) == text

    def test_strips_markdown_fences(self):
        text = '```json\n{"conviction_score": 85}\n```'
        assert AIAnalysisService.strip_code_fences(text) == '{"conviction_score": 85}'

    def test_strips_opening_only(self):
        text = '```\n{"x": 1}'
        assert "conviction" not in AIAnalysisService.strip_code_fences(text)
        assert '"x"' in AIAnalysisService.strip_code_fences(text)

    def test_none_returns_empty(self):
        assert AIAnalysisService.strip_code_fences(None) == ""


class TestNormalizeKeyRisks:
    def test_list_preserved(self):
        risks = ["FDA delay", "Earnings miss"]
        assert AIAnalysisService.normalize_key_risks(risks) == risks

    def test_string_becomes_list(self):
        assert AIAnalysisService.normalize_key_risks("Single risk") == ["Single risk"]

    def test_empty_string_returns_empty_list(self):
        assert AIAnalysisService.normalize_key_risks("") == []
        assert AIAnalysisService.normalize_key_risks("   ") == []

    def test_none_returns_empty_list(self):
        assert AIAnalysisService.normalize_key_risks(None) == []

    def test_strips_whitespace(self):
        assert AIAnalysisService.normalize_key_risks(["  a  ", "  b  "]) == ["a", "b"]


class TestNormalizeAnalysis:
    def test_conviction_score_int(self):
        parsed = {"conviction_score": 92, "catalyst_type": "SUPERNOVA", "rationale": "x"}
        out = AIAnalysisService.normalize_analysis(parsed)
        assert out["conviction_score"] == 92
        assert out["catalyst_type"] == "SUPERNOVA"

    def test_conviction_score_string_converted(self):
        parsed = {"conviction_score": "85", "catalyst_type": "X", "rationale": ""}
        out = AIAnalysisService.normalize_analysis(parsed)
        assert out["conviction_score"] == 85

    def test_conviction_score_percent_stripped(self):
        parsed = {"conviction_score": " 90 % ", "catalyst_type": "X", "rationale": ""}
        out = AIAnalysisService.normalize_analysis(parsed)
        assert out["conviction_score"] == 90

    def test_conviction_score_float_truncated(self):
        parsed = {"conviction_score": 87.7, "catalyst_type": "X", "rationale": ""}
        out = AIAnalysisService.normalize_analysis(parsed)
        assert out["conviction_score"] == 87

    def test_defaults(self):
        parsed = {}
        out = AIAnalysisService.normalize_analysis(parsed)
        assert out["conviction_score"] == 0
        assert out["catalyst_type"] == "UNKNOWN"
        assert out["is_trap"] is False
        assert out["rationale"] == ""
        assert out["key_risks"] == []

    def test_is_trap_preserved(self):
        parsed = {"conviction_score": 30, "is_trap": True, "trap_reason": "Fake pump"}
        out = AIAnalysisService.normalize_analysis(parsed)
        assert out["is_trap"] is True
        assert out["trap_reason"] == "Fake pump"
