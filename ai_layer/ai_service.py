import json
import logging
import time

from google import genai
from google.genai import types
from kafka import KafkaConsumer, KafkaProducer

try:
    from ai_layer.ai_config import (
        GEMINI_API_KEY,
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
except ImportError:
    from ai_config import (
        GEMINI_API_KEY,
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
    from prompt_builder import build_analysis_prompt


logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s [ai-layer] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("ai-layer")

MODEL_ALIASES = {
    "gemini-3-flash": "models/gemini-3-flash-preview",
    "gemini-3.1-pro": "models/gemini-3.1-pro-preview",
    "gemini-3.1-pro-preview": "models/gemini-3.1-pro-preview",
    "gemini-3-pro": "models/gemini-3-pro-preview",
}


class AIAnalysisService:
    def __init__(self):
        if not GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY is required")

        model_name = self.resolve_model_name(GEMINI_MODEL)
        self.client = genai.Client(api_key=GEMINI_API_KEY)
        tools = [types.Tool(google_search=types.GoogleSearch())]
        self.generation_config = types.GenerateContentConfig(
            temperature=GEMINI_TEMPERATURE,
            tools=tools,
        )
        self.model_name = model_name
        logger.info("Using Gemini model %s", model_name)

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
            except Exception as exc:
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
            self.process_event(message.value)

    def process_event(self, triage_payload):
        prompt = build_analysis_prompt(triage_payload)
        try:
            analysis = self.analyze_with_retry(prompt)
        except Exception as exc:
            logger.error(
                "Gemini analysis failed for %s: %s",
                triage_payload.get("ticker", "unknown"),
                exc,
            )
            return

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
        # Commit offsets only after successful processing to avoid message loss.
        try:
            self.consumer.commit()
        except Exception as exc:
            logger.warning("Kafka commit failed after publishing validated signal: %s", exc)
        logger.info(
            "Published validated signal for %s with conviction %s",
            validated_signal["ticker"],
            conviction_score,
        )

    def analyze_with_retry(self, prompt):
        backoff_seconds = GEMINI_INITIAL_BACKOFF_SECONDS
        last_error = None

        for attempt in range(1, GEMINI_MAX_RETRIES + 1):
            try:
                response = self.client.models.generate_content(
                    model=self.model_name,
                    contents=prompt,
                    config=self.generation_config,
                )
                raw_text = getattr(response, "text", "")
                cleaned_text = self.strip_code_fences(raw_text)
                parsed = json.loads(cleaned_text)
                return self.normalize_analysis(parsed)
            except Exception as exc:
                last_error = exc
                if attempt == GEMINI_MAX_RETRIES:
                    break
                logger.warning(
                    "Gemini attempt %s/%s failed: %s. Retrying in %ss",
                    attempt,
                    GEMINI_MAX_RETRIES,
                    exc,
                    backoff_seconds,
                )
                time.sleep(backoff_seconds)
                backoff_seconds *= 2

        # Preserve original exception type and traceback for observability.
        if last_error is not None:
            raise RuntimeError("Gemini analysis failed after max retries") from last_error
        raise RuntimeError("Gemini analysis failed after max retries with unknown error")

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

    @staticmethod
    def strip_code_fences(text):
        cleaned = (text or "").strip()
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
            "suggested_entry_zone": str(parsed.get("suggested_entry_zone", "no clear level")).strip(),
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
