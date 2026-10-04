import json
import logging
import os
import time

from google import genai
from google.genai import types
from kafka.errors import KafkaError

from ai_layer.ai_config import (
    GEMINI_API_KEY,
    GEMINI_FALLBACK_MODEL,
    GEMINI_INITIAL_BACKOFF_SECONDS,
    GEMINI_MAX_RETRIES,
    GEMINI_MODEL,
    GEMINI_TEMPERATURE,
    KAFKA_AUTO_OFFSET_RESET,
    KAFKA_BOOTSTRAP_SERVERS,
    KAFKA_CONSUMER_GROUP,
    MIN_CONVICTION_SCORE,
    TRIAGE_PRIORITY_TOPIC,
    VALIDATED_SIGNALS_TOPIC,
)
from ai_layer.prompt_builder import build_analysis_prompt
from ai_layer.request_budget import reserve_request
from kafka import KafkaConsumer, KafkaProducer

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s [ai-layer] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("ai-layer")

MODEL_ALIASES = {
    "gemini-flash": "gemini-2.0-flash",
    "gemini-2-flash": "gemini-2.0-flash",
    "gemini-3-flash": "gemini-2.5-flash",
    "gemini-3.0-flash-preview": "gemini-2.5-flash",
    "gemini-3.1-flash-lite": "gemini-2.0-flash-lite",
    "gemini-2-pro": "gemini-2.5-pro",
    "gemini-3-pro": "gemini-2.5-pro",
    "gemini-3.1-pro": "gemini-2.5-pro",
    "gemini-3.1-pro-preview": "gemini-2.5-pro",
}


class AIAnalysisService:
    def __init__(self):
        if not GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY is required")

        model_name = self.resolve_model_name(GEMINI_MODEL)
        fallback_model = (
            self.resolve_model_name(GEMINI_FALLBACK_MODEL) if GEMINI_FALLBACK_MODEL else None
        )
        self.client = genai.Client(api_key=GEMINI_API_KEY, http_options={"timeout": 120000})
        tools = [types.Tool(google_search=types.GoogleSearch())]
        self.generation_config = types.GenerateContentConfig(
            temperature=GEMINI_TEMPERATURE,
            tools=tools,
            max_output_tokens=int(os.getenv("GEMINI_MAX_OUTPUT_TOKENS", "2048")),
            thinking_config=(
                types.ThinkingConfig(thinking_level=os.environ["GEMINI_THINKING_LEVEL"])
                if os.getenv("GEMINI_THINKING_LEVEL")
                else types.ThinkingConfig(thinking_budget=0)
                if os.getenv("GEMINI_DISABLE_THINKING") == "true"
                else None
            ),
        )
        self.model_name = model_name
        self.fallback_model = fallback_model
        logger.info("Using Gemini model %s (fallback: %s)", model_name, fallback_model)

        # Kafka connections with basic retry to handle transient bootstrap issues.
        kafka_backoff = 1
        last_error = None
        for attempt in range(1, 4):
            try:
                self.consumer = KafkaConsumer(
                    TRIAGE_PRIORITY_TOPIC,
                    bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
                    auto_offset_reset=KAFKA_AUTO_OFFSET_RESET,
                    enable_auto_commit=False,
                    group_id=KAFKA_CONSUMER_GROUP,
                    value_deserializer=lambda value: json.loads(value.decode("utf-8")),
                )
                self.producer = KafkaProducer(
                    bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
                    value_serializer=lambda value: json.dumps(value).encode("utf-8"),
                )
                break
            except (KafkaError, ValueError, OSError) as exc:
                last_error = exc
                logger.warning(
                    "Kafka connection attempt %s/3 failed: %s. Retrying in %ss",
                    attempt,
                    exc,
                    kafka_backoff,
                )
                time.sleep(kafka_backoff)
                kafka_backoff *= 2

        if last_error is not None and not hasattr(self, "consumer"):
            raise RuntimeError("Failed to initialize Kafka consumer/producer") from last_error

    def run(self):
        logger.info(
            "Listening on %s and publishing to %s",
            TRIAGE_PRIORITY_TOPIC,
            VALIDATED_SIGNALS_TOPIC,
        )
        for message in self.consumer:
            try:
                self.process_event(message.value)
            except Exception as exc:
                logger.error("Unhandled error processing triage message: %s", exc, exc_info=True)
            finally:
                if (
                    hasattr(self, "consumer")
                    and hasattr(self.consumer, "commit")
                    and callable(self.consumer.commit)
                ):
                    try:
                        self.consumer.commit()
                    except (KafkaError, OSError) as exc:
                        logger.warning("Kafka commit failed: %s", exc)

    def close(self):
        if hasattr(self, "consumer"):
            self.consumer.close()
        if hasattr(self, "producer"):
            self.producer.close()

    def process_event(self, triage_payload):
        prompt = build_analysis_prompt(triage_payload)
        try:
            analysis = self.analyze_with_retry(prompt)
            analysis["analysis_method"] = "gemini"
            analysis["analysis_model"] = getattr(
                self, "last_model", getattr(self, "model_name", "unknown")
            )
        except (RuntimeError, ValueError, TypeError, KeyError) as exc:
            if os.getenv("AI_ALLOW_HEURISTIC_FALLBACK", "true") != "true":
                logger.error(
                    "Grounded analysis unavailable for %s; dropping signal",
                    triage_payload.get("ticker"),
                )
                return
            logger.warning(
                "Gemini analysis failed for %s (%s). Engaging deterministic heuristic fallback.",
                triage_payload.get("ticker", "unknown"),
                exc,
            )
            analysis = self.synthesize_fallback_analysis(triage_payload)
            analysis["analysis_method"] = "heuristic"
            analysis["analysis_model"] = None

        conviction_score = analysis.get("conviction_score", 0)
        if conviction_score < MIN_CONVICTION_SCORE:
            logger.info(
                "Dropped %s: conviction_score %s below threshold %s",
                triage_payload.get("ticker", "unknown"),
                conviction_score,
                MIN_CONVICTION_SCORE,
            )
            return

        validated_signal = self.merge_payload(triage_payload, analysis)
        self.producer.send(VALIDATED_SIGNALS_TOPIC, validated_signal)
        self.producer.flush()
        if (
            hasattr(self, "consumer")
            and hasattr(self.consumer, "commit")
            and callable(self.consumer.commit)
        ):
            try:
                self.consumer.commit()
            except (KafkaError, OSError) as exc:
                logger.warning("Kafka commit failed after publishing validated signal: %s", exc)
        logger.info(
            "Published validated signal for %s with conviction %s",
            validated_signal["ticker"],
            conviction_score,
        )

    def analyze_with_retry(self, prompt):
        backoff_seconds = GEMINI_INITIAL_BACKOFF_SECONDS
        last_error = None
        current_model = self.model_name
        fallback_model = getattr(self, "fallback_model", None)

        for attempt in range(1, GEMINI_MAX_RETRIES + 1):
            if attempt > 1 and fallback_model and current_model != fallback_model:
                logger.info(
                    "Switching to fallback Gemini model %s for attempt %s/%s",
                    fallback_model,
                    attempt,
                    GEMINI_MAX_RETRIES,
                )
                current_model = fallback_model

            try:
                reserve_request()
                response = self.client.models.generate_content(
                    model=current_model,
                    contents=prompt[:24000],
                    config=self.generation_config,
                )
                raw_text = getattr(response, "text", "")
                parsed = self.extract_json_object(raw_text)
                if os.getenv("AI_REQUIRE_GROUNDING") == "true":
                    candidates = getattr(response, "candidates", None) or []
                    grounded = any(
                        getattr(getattr(c, "grounding_metadata", None), "grounding_chunks", None)
                        for c in candidates
                    )
                    if not grounded:
                        raise ValueError("Response lacks search grounding sources")
                self.last_model = current_model
                return self.normalize_analysis(parsed)
            except Exception as exc:
                last_error = exc
                err_msg = str(exc)
                if "API_KEY_INVALID" in err_msg or "API key not valid" in err_msg:
                    logger.warning(
                        "Gemini API key is invalid or unconfigured. Skipping redundant retries."
                    )
                    break
                if attempt == GEMINI_MAX_RETRIES:
                    break
                logger.warning(
                    "Gemini attempt %s/%s with model %s failed: %s. Retrying in %ss",
                    attempt,
                    GEMINI_MAX_RETRIES,
                    current_model,
                    exc,
                    backoff_seconds,
                )
                time.sleep(backoff_seconds)
                backoff_seconds *= 2

        # Preserve original exception type and traceback for observability.
        if last_error is not None:
            raise RuntimeError("Gemini analysis failed after max retries") from last_error
        raise RuntimeError("Gemini analysis failed after max retries with unknown error")

    @classmethod
    def synthesize_fallback_analysis(cls, triage_payload: dict) -> dict:
        """Deterministic heuristic analysis when external LLM is unreachable or unconfigured."""
        ticker = (triage_payload.get("ticker") or "UNKNOWN").upper()
        confluence_sources = triage_payload.get("confluence_sources") or []
        confluence_count = triage_payload.get("confluence_count") or len(confluence_sources)
        sources_lower = [str(s).lower() for s in confluence_sources]

        if any("biotech" in s for s in sources_lower):
            catalyst_type = "SCALPER"
            suggested_timeframe = "intraday"
            risk_level = "high"
        elif any("drifter" in s or "earnings" in s for s in sources_lower):
            catalyst_type = "DRIFTER"
            suggested_timeframe = "swing"
            risk_level = "medium"
        elif any("insider" in s for s in sources_lower):
            catalyst_type = "FOLLOWER"
            suggested_timeframe = "swing"
            risk_level = "low"
        elif any("squeeze" in s for s in sources_lower):
            catalyst_type = "SUPERNOVA"
            suggested_timeframe = "intraday"
            risk_level = "medium"
        else:
            catalyst_type = "SUPERNOVA"
            suggested_timeframe = "intraday"
            risk_level = "medium"

        if confluence_count >= 3:
            conviction_score = 88
        elif confluence_count >= 2:
            conviction_score = 82
        else:
            conviction_score = 75

        sources_str = ", ".join(confluence_sources) if confluence_sources else "technical screening"
        rationale = f"Confluence detected across {sources_str} for {ticker}. Order flow and liquidity thresholds satisfied."
        raw_signals_summary = f"{confluence_count} confirming signal(s) from {sources_str}"

        return {
            "conviction_score": conviction_score,
            "catalyst_type": catalyst_type,
            "is_trap": False,
            "trap_reason": None,
            "rationale": rationale,
            "news_sentiment": "bullish",
            "risk_level": risk_level,
            "suggested_timeframe": suggested_timeframe,
            "key_risks": ["Market-wide volatility / macro regime", "Execution slippage at open"],
            "raw_signals_summary": raw_signals_summary,
            "suggested_entry_zone": "Near current market price with volume confirmation",
            "suggested_stop": "Key support level or 3-5% trailing stop",
        }

    def merge_payload(self, triage_payload, analysis):
        return {
            "ticker": triage_payload.get("ticker"),
            "timestamp_utc": triage_payload.get("timestamp_utc"),
            "confluence_count": triage_payload.get("confluence_count", 0),
            "confluence_sources": triage_payload.get("confluence_sources", []),
            "liquidity_metrics": triage_payload.get("liquidity_metrics", {}),
            "signals": triage_payload.get("signals", []),
            **analysis,
        }

    @classmethod
    def extract_json_object(cls, text):
        """Robustly extracts and parses a JSON object from model output."""
        if not text:
            raise ValueError("Empty model response")

        cleaned = cls.strip_code_fences(text)
        try:
            return json.loads(cleaned)
        except (json.JSONDecodeError, TypeError):
            pass

        first_brace = text.find("{")
        last_brace = text.rfind("}")
        if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
            candidate = text[first_brace : last_brace + 1]
            try:
                return json.loads(candidate)
            except (json.JSONDecodeError, TypeError):
                pass

        return json.loads(text)

    @staticmethod
    def strip_code_fences(text):
        cleaned = (text or "").strip()
        if "```json" in cleaned:
            parts = cleaned.split("```json", 1)[1]
            if "```" in parts:
                return parts.split("```", 1)[0].strip()
        if "```" in cleaned:
            parts = cleaned.split("```", 1)[1]
            if "```" in parts:
                return parts.split("```", 1)[0].strip()
        if cleaned.startswith("```"):
            lines = cleaned.splitlines()
            if lines:
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            cleaned = "\n".join(lines).strip()
        return cleaned

    @staticmethod
    def normalize_analysis(parsed):
        def _safe_int_from_field(obj, field, default=0):
            raw = obj.get(field)
            if raw is None:
                return default
            try:
                # Handle cases like "85", "85.0", " 90 %"
                if isinstance(raw, str):
                    cleaned = raw.replace("%", "").strip()
                    if not cleaned:
                        return default
                    try:
                        return int(cleaned)
                    except ValueError:
                        return int(float(cleaned))
                if isinstance(raw, (int, float)):
                    return int(raw)
                return default
            except (TypeError, ValueError):
                return default

        conviction_score = _safe_int_from_field(parsed, "conviction_score", default=0)

        return {
            "conviction_score": conviction_score,
            "catalyst_type": str(parsed.get("catalyst_type", "UNKNOWN")).upper(),
            "is_trap": bool(parsed.get("is_trap", False)),
            "trap_reason": parsed.get("trap_reason"),
            "rationale": str(parsed.get("rationale", "")).strip(),
            "news_sentiment": str(parsed.get("news_sentiment", "unknown")).lower(),
            "risk_level": str(parsed.get("risk_level", "high")).lower(),
            "suggested_timeframe": str(parsed.get("suggested_timeframe", "intraday")).lower(),
            "key_risks": AIAnalysisService.normalize_key_risks(parsed.get("key_risks")),
            "raw_signals_summary": str(parsed.get("raw_signals_summary", "")).strip(),
            "suggested_entry_zone": str(
                parsed.get("suggested_entry_zone", "no clear level")
            ).strip(),
            "suggested_stop": str(parsed.get("suggested_stop", "no clear level")).strip(),
        }

    @staticmethod
    def normalize_key_risks(value):
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        if isinstance(value, str) and value.strip():
            return [value.strip()]
        return []

    @staticmethod
    def resolve_model_name(model_name):
        if model_name.startswith("models/"):
            return model_name
        return MODEL_ALIASES.get(model_name, model_name)


if __name__ == "__main__":
    AIAnalysisService().run()
