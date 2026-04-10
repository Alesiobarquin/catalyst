-- TimescaleDB schema for Catalyst
-- Run once: psql -h localhost -U catalyst_user -d catalyst_db -f schema.sql

-- ── trade_orders ──────────────────────────────────────────────────────────────
-- Written by the Java strategy engine; queried by FastAPI + the dashboard.

CREATE TABLE IF NOT EXISTS trade_orders (
    id                   BIGSERIAL        NOT NULL,
    ticker               VARCHAR(20)      NOT NULL,
    timestamp_utc        TIMESTAMPTZ      NOT NULL,
    action               VARCHAR(10)      NOT NULL DEFAULT 'BUY',
    strategy_used        VARCHAR(50)      NOT NULL,
    recommended_size_usd NUMERIC(12, 2),
    limit_price          NUMERIC(12, 4),
    stop_loss            NUMERIC(12, 4),
    target_price         NUMERIC(12, 4),
    rationale            TEXT,
    conviction_score     SMALLINT,
    catalyst_type        VARCHAR(50),
    regime_vix           NUMERIC(8, 2),
    spy_above_200sma     BOOLEAN,
    status               VARCHAR(20)      NOT NULL DEFAULT 'ACTIVE',
    PRIMARY KEY (id, timestamp_utc)
);

SELECT create_hypertable(
    'trade_orders',
    'timestamp_utc',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_trade_orders_ticker
    ON trade_orders (ticker, timestamp_utc DESC);
CREATE INDEX IF NOT EXISTS idx_trade_orders_status
    ON trade_orders (status);

-- ── validated_signals ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS validated_signals (
    id                   BIGSERIAL        PRIMARY KEY,
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
