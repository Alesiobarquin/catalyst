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


class TestExtractJsonObject:
    def test_valid_clean_json(self):
        text = '{"conviction_score": 85, "catalyst_type": "SUPERNOVA"}'
        res = AIAnalysisService.extract_json_object(text)
        assert res["conviction_score"] == 85

    def test_json_with_code_fences(self):
        text = '```json\n{"conviction_score": 90}\n```'
        res = AIAnalysisService.extract_json_object(text)
        assert res["conviction_score"] == 90

    def test_json_with_conversational_intro_and_outro(self):
        text = 'Here is the analysis:\n{"conviction_score": 75, "catalyst_type": "DRIFTER"}\nHope this helps!'
        res = AIAnalysisService.extract_json_object(text)
        assert res["conviction_score"] == 75
        assert res["catalyst_type"] == "DRIFTER"

    def test_json_embedded_fences_with_surrounding_text(self):
        text = 'Signals evaluated:\n```json\n{"conviction_score": 88}\n```\nTrade at own risk.'
        res = AIAnalysisService.extract_json_object(text)
        assert res["conviction_score"] == 88

    def test_empty_string_raises_value_error(self):
        import pytest

        with pytest.raises(ValueError, match="Empty model response"):
            AIAnalysisService.extract_json_object("")

    def test_malformed_json_raises_json_decode_error(self):
        import json

        import pytest

        with pytest.raises(json.JSONDecodeError):
            AIAnalysisService.extract_json_object("Not a json at all {broken")


class TestPromptBuilder:
    def test_build_prompt_full_payload(self):
        from ai_layer.prompt_builder import build_analysis_prompt

        payload = {
            "ticker": "NVDA",
            "timestamp_utc": "2026-09-27T12:00:00Z",
            "confluence_count": 2,
            "confluence_sources": ["squeeze", "whale"],
            "liquidity_metrics": {"price": 120.5, "volume": 5000000},
            "market_cap": 3000000000000,
            "float_shares": 2400000000,
            "signals": [
                {"source_hunter": "squeeze", "signal_data": {"short_float_pct": 22.5}},
                {"source_hunter": "whale", "signal_data": {"option_type": "call"}},
            ],
        }
        prompt = build_analysis_prompt(payload)
        assert "NVDA" in prompt
        assert "squeeze" in prompt
        assert "whale" in prompt
        assert "ROLE:" in prompt
        assert "OUTPUT SCHEMA:" in prompt

    def test_build_prompt_empty_or_none_fields(self):
        from ai_layer.prompt_builder import build_analysis_prompt

        payload = {
            "ticker": None,
            "signals": None,
            "confluence_sources": None,
            "liquidity_metrics": None,
        }
        prompt = build_analysis_prompt(payload)
        assert "UNKNOWN" in prompt
        assert "No accumulated signals were provided." in prompt

    def test_format_signal_blocks_empty(self):
        from ai_layer.prompt_builder import format_signal_blocks

        assert format_signal_blocks([]) == "No accumulated signals were provided."
        assert format_signal_blocks(None) == "No accumulated signals were provided."

    def test_format_signal_blocks_multiple(self):
        from ai_layer.prompt_builder import format_signal_blocks

        signals = [
            {"source_hunter": "squeeze", "signal_data": {"short_float_pct": 18.2}},
            {"source_hunter": "insider", "signal_data": {"transaction_code": "P"}},
        ]
        formatted = format_signal_blocks(signals)
        assert "Signal 1:" in formatted
        assert "Source: squeeze" in formatted
        assert "Signal 2:" in formatted
        assert "Source: insider" in formatted


class TestAIAnalysisServiceWorkflow:
    def test_resolve_model_name_alias(self):
        assert AIAnalysisService.resolve_model_name("gemini-flash") == "gemini-2.0-flash"
        assert AIAnalysisService.resolve_model_name("gemini-3-flash") == "gemini-2.5-flash"
        assert AIAnalysisService.resolve_model_name("models/custom-model") == "models/custom-model"

    def test_merge_payload(self):
        service = AIAnalysisService.__new__(AIAnalysisService)
        triage = {
            "ticker": "TSLA",
            "timestamp_utc": "2026-09-27T12:00:00Z",
            "confluence_count": 2,
            "confluence_sources": ["squeeze", "whale"],
            "liquidity_metrics": {"price": 250.0},
            "signals": [{"source_hunter": "whale"}],
        }
        analysis = {
            "conviction_score": 85,
            "catalyst_type": "SUPERNOVA",
            "rationale": "High short interest + massive call volume",
            "is_trap": False,
        }
        merged = service.merge_payload(triage, analysis)
        assert merged["ticker"] == "TSLA"
        assert merged["conviction_score"] == 85
        assert merged["catalyst_type"] == "SUPERNOVA"
        assert merged["confluence_count"] == 2
        assert merged["confluence_sources"] == ["squeeze", "whale"]

    def test_process_event_below_min_conviction_dropped(self):
        from unittest.mock import MagicMock

        service = AIAnalysisService.__new__(AIAnalysisService)
        service.analyze_with_retry = MagicMock(return_value={"conviction_score": 40})
        service.producer = MagicMock()
        service.consumer = MagicMock()

        triage = {"ticker": "AAPL", "signals": []}
        service.process_event(triage)

        service.producer.send.assert_not_called()
        service.consumer.commit.assert_not_called()

    def test_process_event_success_publishes_and_commits(self):
        from unittest.mock import MagicMock

        service = AIAnalysisService.__new__(AIAnalysisService)
        service.analyze_with_retry = MagicMock(
            return_value={
                "conviction_score": 85,
                "catalyst_type": "SUPERNOVA",
                "rationale": "Strong confluence",
            }
        )
        service.producer = MagicMock()
        service.consumer = MagicMock()

        triage = {
            "ticker": "AAPL",
            "timestamp_utc": "2026-09-27T12:00:00Z",
            "confluence_count": 2,
            "confluence_sources": ["whale", "drifter"],
            "liquidity_metrics": {},
            "signals": [],
        }
        service.process_event(triage)

        service.producer.send.assert_called_once()
        service.producer.flush.assert_called_once()
        service.consumer.commit.assert_called_once()
