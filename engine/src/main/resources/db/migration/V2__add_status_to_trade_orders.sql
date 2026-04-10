-- V2: Add status column to trade_orders.
-- Tracks whether the trade hit its target, stop, or is still active.
-- Default 'ACTIVE' so existing rows are not affected.

ALTER TABLE trade_orders
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_trade_orders_status
    ON trade_orders (status);
