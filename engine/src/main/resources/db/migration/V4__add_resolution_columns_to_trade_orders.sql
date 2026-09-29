-- V4: Add resolution columns to trade_orders for closed-loop lifecycle tracking.
-- Tracks when and at what price a recommended trade resolved (HIT_TARGET, HIT_STOP, or EXPIRED).

ALTER TABLE trade_orders
    ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS resolved_price NUMERIC(12, 4),
    ADD COLUMN IF NOT EXISTS pnl_percent NUMERIC(8, 4);

CREATE INDEX IF NOT EXISTS idx_trade_orders_resolved_at
    ON trade_orders (resolved_at)
    WHERE resolved_at IS NOT NULL;
