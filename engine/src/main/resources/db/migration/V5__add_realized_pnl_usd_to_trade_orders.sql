-- V5: Add realized_pnl_usd column to trade_orders for closed-loop realized dollar PnL tracking.
ALTER TABLE trade_orders
    ADD COLUMN IF NOT EXISTS realized_pnl_usd NUMERIC(12, 2);
