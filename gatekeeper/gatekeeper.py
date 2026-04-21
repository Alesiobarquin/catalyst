import json
import logging
import time
from datetime import datetime, timezone

from redis import Redis

from kafka import KafkaConsumer, KafkaProducer

try:
    from gatekeeper.config import (
        CONFLUENCE_THRESHOLD,
        KAFKA_AUTO_OFFSET_RESET,
        KAFKA_BOOTSTRAP_SERVERS,
        KAFKA_CONSUMER_GROUP,
        MAX_PRICE,
        MIN_PRICE,
        MIN_RELATIVE_VOLUME,
        MIN_VOLUME,
        RAW_EVENTS_TOPIC,
        REDIS_HOST,
        REDIS_PORT,
        REDIS_SENT_KEY,
        REDIS_SIGNALS_KEY,
        REDIS_SOURCES_KEY,
        ROLLING_WINDOW_SECONDS,
        TECHNICAL_SCORE_THRESHOLD,
        TRIAGE_PRIORITY_TOPIC,
    )
except ImportError:
    from config import (
        CONFLUENCE_THRESHOLD,
        KAFKA_AUTO_OFFSET_RESET,
        KAFKA_BOOTSTRAP_SERVERS,
        KAFKA_CONSUMER_GROUP,
        MAX_PRICE,
        MIN_PRICE,
        MIN_RELATIVE_VOLUME,
        MIN_VOLUME,
        RAW_EVENTS_TOPIC,
        REDIS_HOST,
        REDIS_PORT,
        REDIS_SENT_KEY,
        REDIS_SIGNALS_KEY,
        REDIS_SOURCES_KEY,
        ROLLING_WINDOW_SECONDS,
        TECHNICAL_SCORE_THRESHOLD,
        TRIAGE_PRIORITY_TOPIC,
    )


logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s [gatekeeper] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("gatekeeper")


class GatekeeperService:
    def __init__(self):
        try:
            self.redis = Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
            # Fail fast if Redis is not reachable.
            self.redis.ping()
        except Exception as exc:
            logger.error(
                "Failed to connect to Redis at %s:%s: %s",
                REDIS_HOST,
                REDIS_PORT,
                exc,
            )
            raise SystemExit(1) from exc

        kafka_backoff = 1
        last_error = None
        for attempt in range(1, 4):
            try:
                self.consumer = KafkaConsumer(
                    RAW_EVENTS_TOPIC,
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
            "Listening on %s and forwarding to %s",
            RAW_EVENTS_TOPIC,
            TRIAGE_PRIORITY_TOPIC,
        )
        for message in self.consumer:
            self.process_event(message.value)

    def process_event(self, raw_event):
        normalized = self.normalize_event(raw_event)
        if not normalized:
            logger.warning("Skipping event with unknown schema: %s", raw_event)
            return

        drop_reason = self.get_drop_reason(normalized)
        if drop_reason:
            logger.info("Dropped %s: %s", normalized["ticker"], drop_reason)
            return

        ticker = normalized["ticker"]
        self.track_signal(ticker, normalized)

        confluence_sources = self.get_sources(ticker)
        confluence_count = len(confluence_sources)
        technical_score = float(normalized.get("_technical_score") or 0.0)
        should_trigger = (
            confluence_count >= CONFLUENCE_THRESHOLD or technical_score >= TECHNICAL_SCORE_THRESHOLD
        )

        if not should_trigger:
            logger.info(
                "Buffered %s from %s without trigger (confluence=%s, technical_score=%s)",
                ticker,
                normalized["source_hunter"],
                confluence_count,
                technical_score,
            )
            return

        if self.was_recently_sent(ticker):
            logger.info("Deduped %s: already sent within rolling window", ticker)
            return

        triage_payload = {
            "ticker": ticker,
            "timestamp_utc": normalized["timestamp_utc"],
            "confluence_count": confluence_count,
            "confluence_sources": confluence_sources,
            "liquidity_metrics": normalized["liquidity_metrics"],
            "signals": self.get_accumulated_signals(ticker),
            "float_shares": normalized.get("float_shares"),
            "market_cap": normalized.get("market_cap"),
        }
        self.producer.send(TRIAGE_PRIORITY_TOPIC, triage_payload)
        self.producer.flush()
        try:
            self.consumer.commit()
        except Exception as exc:
            logger.warning("Kafka commit failed after forwarding triage payload: %s", exc)
        self.mark_sent(ticker)
        logger.info(
            "Forwarded %s to %s (confluence=%s, technical_score=%s)",
            ticker,
            TRIAGE_PRIORITY_TOPIC,
            confluence_count,
            technical_score,
        )

    def normalize_event(self, raw_event):
        if not isinstance(raw_event, dict):
            return None

        source_hunter = self.detect_source(raw_event)
        coercers = {
            "squeeze": self.coerce_squeeze,
            "insider": self.coerce_insider,
            "whale": self.coerce_whale,
            "biotech": self.coerce_biotech,
            "drifter": self.coerce_drifter,
            "shadow": self.coerce_shadow,
        }

        coercer = coercers.get(source_hunter)
        if not coercer:
            return None

        normalized = coercer(raw_event)
        if not normalized.get("ticker"):
            return None
        return normalized

    def detect_source(self, raw_event):
        for field in ("source_hunter", "hunter", "source"):
            value = raw_event.get(field)
            if isinstance(value, str) and value:
                return value.strip().lower()

        signal_data = raw_event.get("signal_data", {})
        if isinstance(signal_data, dict):
            value = signal_data.get("source_hunter")
            if isinstance(value, str) and value:
                return value.strip().lower()

        if "short_float" in raw_event or "short_float_pct" in signal_data:
            return "squeeze"
        if "transaction_code" in raw_event or "transaction_code" in signal_data:
            return "insider"
        if "option_type" in raw_event or "option_type" in signal_data:
            return "whale"
        if "drug_name" in raw_event or "event_date" in signal_data:
            return "biotech"
        if "surprise_percent" in raw_event or "surprise_percent" in signal_data:
            return "drifter"
        if "net_value_usd" in raw_event or "block_trade_count" in signal_data:
            return "shadow"
        return None

    def coerce_squeeze(self, raw_event):
        signal_fields = {
            "short_float_pct": self.normalize_short_float_pct(
                self.first(raw_event, "short_float_pct", "short_float"),
                is_fraction=False,
            ),
            "days_to_cover": self.first(raw_event, "days_to_cover", "short_ratio"),
            "borrow_fee_rate": self.first(raw_event, "borrow_fee_rate", "borrow_fee"),
        }
        return self.build_event("squeeze", raw_event, signal_fields)

    def coerce_insider(self, raw_event):
        signal_fields = {
            "transaction_code": self.first(raw_event, "transaction_code", "code"),
            "transaction_amount_usd": self.first(
                raw_event,
                "transaction_amount_usd",
                "amount_usd",
                "transaction_value_usd",
            ),
            "insider_name": self.first(raw_event, "insider_name", "name"),
            "insider_title": self.first(raw_event, "insider_title", "title"),
            "shares_traded": self.first(raw_event, "shares_traded", "shares"),
        }
        return self.build_event("insider", raw_event, signal_fields)

    def coerce_whale(self, raw_event):
        signal_fields = {
            "option_type": self.first(raw_event, "option_type", "type"),
            "strike_price": self.first(raw_event, "strike_price", "strike"),
            "expiration_date": self.first(raw_event, "expiration_date", "expiry"),
            "volume": self.first(raw_event, "option_volume", "contracts", "volume"),
            "open_interest": self.first(raw_event, "open_interest", "oi"),
            "vol_oi_ratio": self.first(raw_event, "vol_oi_ratio", "volume_open_interest_ratio"),
            "premium_paid_usd": self.first(raw_event, "premium_paid_usd", "premium"),
        }
        liquidity_overrides = {
            "volume": self.first(raw_event, "market_volume", "stock_volume", "underlying_volume"),
        }
        return self.build_event("whale", raw_event, signal_fields, liquidity_overrides)

    def coerce_biotech(self, raw_event):
        signal_fields = {
            "catalyst_type": self.first(raw_event, "catalyst_type"),
            "stage": self.first(raw_event, "stage"),
            "drug_name": self.first(raw_event, "drug_name"),
            "event_date": self.first(raw_event, "event_date"),
            "notes": self.first(raw_event, "notes"),
        }
        return self.build_event("biotech", raw_event, signal_fields)

    def coerce_drifter(self, raw_event):
        signal_fields = {
            "surprise_percent": self.first(
                raw_event, "surprise_percent", "earnings_surprise_percent"
            ),
            "eps_estimate": self.first(raw_event, "eps_estimate"),
            "eps_actual": self.first(raw_event, "eps_actual"),
            "revenue_estimate": self.first(raw_event, "revenue_estimate"),
            "revenue_actual": self.first(raw_event, "revenue_actual"),
        }
        return self.build_event("drifter", raw_event, signal_fields)

    def coerce_shadow(self, raw_event):
        signal_fields = {
            "net_value_usd": self.first(raw_event, "net_value_usd", "net_value"),
            "block_trade_count": self.first(raw_event, "block_trade_count", "blocks"),
            "sentiment": self.first(raw_event, "sentiment"),
        }
        return self.build_event("shadow", raw_event, signal_fields)

    def build_event(self, source_hunter, raw_event, signal_fields, liquidity_overrides=None):
        liquidity_metrics = self.extract_liquidity_metrics(raw_event, liquidity_overrides or {})
        signal_data = self.extract_signal_data(raw_event, signal_fields)
        technical_score = self.first(raw_event, "_technical_score", "technical_score")
        if technical_score is None and isinstance(signal_data, dict):
            technical_score = signal_data.get("_technical_score") or signal_data.get(
                "technical_score"
            )

        return {
            "source_hunter": source_hunter,
            "ticker": self.normalize_ticker(self.first(raw_event, "ticker", "symbol")),
            "timestamp_utc": self.normalize_timestamp(
                self.first(raw_event, "timestamp_utc", "timestamp", "ts", "created_at")
            ),
            "liquidity_metrics": liquidity_metrics,
            "signal_data": signal_data,
            "_technical_score": self.to_float(technical_score, default=0.0),
            "float_shares": self.to_float(self.first(raw_event, "float_shares", "float")),
            "market_cap": self.first(raw_event, "market_cap", "cap"),
        }

    def extract_liquidity_metrics(self, raw_event, overrides):
        nested = raw_event.get("liquidity_metrics", {})
        if not isinstance(nested, dict):
            nested = {}

        price = self.first_from_values(
            overrides.get("price"),
            nested.get("price"),
            raw_event.get("price"),
            raw_event.get("last_price"),
            raw_event.get("close"),
        )
        volume = self.first_from_values(
            overrides.get("volume"),
            nested.get("volume"),
            raw_event.get("volume"),
            raw_event.get("vol"),
        )
        relative_volume = self.first_from_values(
            overrides.get("relative_volume"),
            nested.get("relative_volume"),
            raw_event.get("relative_volume"),
            raw_event.get("relativeVolume"),
            raw_event.get("rel_volume"),
            raw_event.get("rvol"),
        )
        return {
            "price": self.to_float(price),
            "volume": self.to_float(volume, default=0.0),
            "relative_volume": self.to_float(relative_volume, default=0.0),
        }

    def extract_signal_data(self, raw_event, source_specific_fields):
        if isinstance(raw_event.get("signal_data"), dict):
            signal_data = dict(raw_event["signal_data"])
        else:
            signal_data = {}

        for key, value in source_specific_fields.items():
            if value is not None:
                signal_data[key] = value

        ignored_keys = {
            "_technical_score",
            "created_at",
            "hunter",
            "liquidity_metrics",
            "price",
            "relative_volume",
            "relativeVolume",
            "rel_volume",
            "rvol",
            "short_float",
            "source",
            "source_hunter",
            "signal_data",
            "symbol",
            "ticker",
            "technical_score",
            "timestamp",
            "timestamp_utc",
            "ts",
            "vol",
            "volume",
        }

        for key, value in raw_event.items():
            if key in ignored_keys or key in signal_data or value is None:
                continue
            signal_data[key] = value

        return signal_data

    def get_drop_reason(self, normalized):
        liquidity = normalized["liquidity_metrics"]
        source_hunter = normalized.get("source_hunter", "")

        # Insider (Form 4) signals carry no real-time volume data — skip
        # volume/rel_volume filters and only check price range.
        if source_hunter != "insider":
            volume = liquidity.get("volume", 0.0)
            relative_volume = liquidity.get("relative_volume", 0.0)
            if volume < MIN_VOLUME:
                return f"volume {volume} below minimum {MIN_VOLUME}"
            if relative_volume < MIN_RELATIVE_VOLUME:
                return f"relative_volume {relative_volume} below minimum {MIN_RELATIVE_VOLUME}"

        price = liquidity.get("price") or 0.0
        if price > 0 and price < MIN_PRICE:
            return f"price {price} below minimum {MIN_PRICE}"
        if price > 0 and price > MAX_PRICE:
            return f"price {price} above maximum {MAX_PRICE}"
        return None

    def track_signal(self, ticker, normalized):
        signal_key = REDIS_SIGNALS_KEY.format(ticker=ticker)
        source_key = REDIS_SOURCES_KEY.format(ticker=ticker)

        payload = {
            "source_hunter": normalized["source_hunter"],
            "signal_data": normalized["signal_data"],
        }

        # Cap per-ticker signal history to avoid unbounded growth.
        max_signals_per_window = 200
        pipe = self.redis.pipeline()
        pipe.lpush(signal_key, json.dumps(payload))
        pipe.ltrim(signal_key, 0, max_signals_per_window - 1)
        pipe.expire(signal_key, ROLLING_WINDOW_SECONDS)

        pipe.sadd(source_key, normalized["source_hunter"])
        pipe.expire(source_key, ROLLING_WINDOW_SECONDS)
        pipe.execute()

    def get_sources(self, ticker):
        source_key = REDIS_SOURCES_KEY.format(ticker=ticker)
        return sorted(self.redis.smembers(source_key))

    def get_accumulated_signals(self, ticker):
        signal_key = REDIS_SIGNALS_KEY.format(ticker=ticker)
        raw_signals = self.redis.lrange(signal_key, 0, -1)
        return [json.loads(signal) for signal in raw_signals]

    def was_recently_sent(self, ticker):
        sent_key = REDIS_SENT_KEY.format(ticker=ticker)
        return bool(self.redis.exists(sent_key))

    def mark_sent(self, ticker):
        sent_key = REDIS_SENT_KEY.format(ticker=ticker)
        self.redis.set(sent_key, "1", ex=ROLLING_WINDOW_SECONDS)

    @staticmethod
    def first(raw_event, *keys):
        signal_data = raw_event.get("signal_data", {})
        for key in keys:
            if key in raw_event and raw_event[key] is not None:
                return raw_event[key]
            if (
                isinstance(signal_data, dict)
                and key in signal_data
                and signal_data[key] is not None
            ):
                return signal_data[key]
        return None

    @staticmethod
    def first_from_values(*values):
        for value in values:
            if value is not None:
                return value
        return None

    @staticmethod
    def normalize_ticker(value):
        if value is None:
            return None
        return str(value).strip().upper()

    @staticmethod
    def normalize_timestamp(value):
        if isinstance(value, str) and value.strip():
            return value
        return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    @staticmethod
    def normalize_short_float_pct(value, is_fraction=False):
        numeric_value = GatekeeperService.to_float(value, default=0.0)
        if numeric_value is None:
            return 0.0

        # Only treat as a fraction when explicitly indicated or when clearly in (0,1]
        # and scaling would still keep the result within 0–100%.
        if is_fraction or (0 < numeric_value <= 1.0 and numeric_value * 100.0 <= 100.0):
            numeric_value *= 100.0

        numeric_value = round(numeric_value, 4)
        # Clamp to a realistic percentage range.
        if numeric_value < 0.0:
            numeric_value = 0.0
        if numeric_value > 100.0:
            numeric_value = 100.0
        return numeric_value

    @staticmethod
    def to_float(value, default=None):
        if value is None or value == "":
            return default
        try:
            if isinstance(value, str):
                cleaned = value.replace(",", "").replace("%", "").strip()
                if cleaned == "":
                    return default
                value = cleaned
            return float(value)
        except (TypeError, ValueError):
            return default


if __name__ == "__main__":
    GatekeeperService().run()
