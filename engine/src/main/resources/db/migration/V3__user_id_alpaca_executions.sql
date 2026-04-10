-- V3: Optional user_id on trade_orders (engine leaves NULL); Alpaca keys + execution audit.

ALTER TABLE trade_orders
    ADD COLUMN IF NOT EXISTS user_id VARCHAR(128);

CREATE INDEX IF NOT EXISTS idx_trade_orders_user_id
    ON trade_orders (user_id)
    WHERE user_id IS NOT NULL;

-- Clerk user id -> Alpaca paper API keys (dashboard Settings). Encrypt at rest in production.
CREATE TABLE IF NOT EXISTS user_alpaca_keys (
    clerk_user_id VARCHAR(128) PRIMARY KEY,
    api_key       TEXT        NOT NULL,
    secret_key    TEXT        NOT NULL,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One execution row per (trade order × user) when executor places Alpaca orders.
CREATE TABLE IF NOT EXISTS trade_order_executions (
    id                BIGSERIAL PRIMARY KEY,
    trade_order_id    BIGINT       NOT NULL,
    timestamp_utc     TIMESTAMPTZ  NOT NULL,
    clerk_user_id     VARCHAR(128) NOT NULL,
    alpaca_order_id   VARCHAR(64),
    execution_status  VARCHAR(32)  NOT NULL DEFAULT 'pending',
    filled_avg_price  NUMERIC(12, 4),
    error_message     TEXT,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_trade_order_exec
        FOREIGN KEY (trade_order_id, timestamp_utc)
        REFERENCES trade_orders (id, timestamp_utc)
        ON DELETE CASCADE,
    CONSTRAINT uq_trade_order_exec_user UNIQUE (trade_order_id, timestamp_utc, clerk_user_id)
);

CREATE INDEX IF NOT EXISTS idx_trade_order_exec_user
    ON trade_order_executions (clerk_user_id);

CREATE INDEX IF NOT EXISTS idx_trade_order_exec_status
    ON trade_order_executions (execution_status);
