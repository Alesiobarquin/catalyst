-- TimescaleDB schema for validated_signals
-- Run once: psql -h localhost -U catalyst_user -d catalyst_db -f schema.sql

CREATE TABLE IF NOT EXISTS validated_signals (
    time TIMESTAMPTZ NOT NULL,
    ticker TEXT NOT NULL,
    conviction_score INT NOT NULL,
    catalyst_type TEXT NOT NULL,
    is_trap BOOLEAN NOT NULL DEFAULT FALSE,
    trap_reason TEXT,
    rationale TEXT,
    confluence_count INT NOT NULL DEFAULT 0,
    confluence_sources JSONB,
    liquidity_metrics JSONB,
    signals JSONB,
    news_sentiment TEXT,
    risk_level TEXT,
    suggested_timeframe TEXT,
    key_risks JSONB,
    raw_signals_summary TEXT,
    suggested_entry_zone TEXT,
    suggested_stop TEXT
);

SELECT create_hypertable('validated_signals', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_validated_signals_ticker ON validated_signals (ticker, time DESC);
