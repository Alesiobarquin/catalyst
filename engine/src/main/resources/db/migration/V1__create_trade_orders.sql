-- =============================================================================
-- V1: Create trade_orders table and promote it to a TimescaleDB hypertable.
--
-- Why hypertable?
--   The dashboard queries trade performance by time range (e.g., "all orders in
--   the last 30 days"). TimescaleDB's chunk-based time partitioning makes these
--   range queries dramatically faster than a flat PostgreSQL table as data grows.
--   Inserts are also faster because each write goes to the current (small) chunk.
--
-- Primary key structure:
--   TimescaleDB requires the partition column to be part of any unique constraint,
--   including the primary key. We use a composite PK (id, timestamp_utc) so
--   the BIGSERIAL id remains unique per row while satisfying the hypertable rule.
-- =============================================================================

CREATE TABLE IF NOT EXISTS trade_orders (
    id                   BIGSERIAL        NOT NULL,
    ticker               VARCHAR(20)      NOT NULL,
    timestamp_utc        TIMESTAMPTZ      NOT NULL,

    -- Trade blueprint fields (matches trade-orders Kafka schema)
    action               VARCHAR(10)      NOT NULL DEFAULT 'BUY',
    strategy_used        VARCHAR(50)      NOT NULL,
    recommended_size_usd NUMERIC(12, 2),
    limit_price          NUMERIC(12, 4),
    stop_loss            NUMERIC(12, 4),
    target_price         NUMERIC(12, 4),
    rationale            TEXT,

    -- Regime context at time of signal (for dashboard analytics)
    conviction_score     SMALLINT,
    catalyst_type        VARCHAR(50),
    regime_vix           NUMERIC(8, 2),
    spy_above_200sma     BOOLEAN,

    -- TimescaleDB requires partition column in any unique constraint
    PRIMARY KEY (id, timestamp_utc)
);

-- Promote to hypertable, partitioned by timestamp_utc.
-- chunk_time_interval = 7 days: each week's data lives in one chunk.
-- A trading system generating ~20 orders/day → ~140 rows/chunk.
-- Adjust to 1 day if order volume increases significantly.
SELECT create_hypertable(
    'trade_orders',
    'timestamp_utc',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE
);

-- Index for the most common dashboard query pattern: "orders for ticker X"
CREATE INDEX IF NOT EXISTS idx_trade_orders_ticker
    ON trade_orders (ticker, timestamp_utc DESC);

-- Index for regime analytics: "how many orders were placed in each regime?"
CREATE INDEX IF NOT EXISTS idx_trade_orders_strategy
    ON trade_orders (strategy_used, timestamp_utc DESC);
