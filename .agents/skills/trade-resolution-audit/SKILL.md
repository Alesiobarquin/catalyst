---
name: trade-resolution-audit
description: >-
  Operational runbook for evaluating, auditing, and executing closed-loop trade resolutions
  across TimescaleDB, the Trade Resolution Daemon (resolver/trade_resolver.py), Kafka
  trade-resolutions events, Alpaca execution tracking, and FastAPI performance analytics.
---

# Trade Resolution & Closed-Loop Performance Audit

Use this runbook to understand, verify, audit, and debug the trade order lifecycle and closed-loop performance resolution pipeline in Catalyst.

## 1. Trade Lifecycle & Resolution Flow

```
[Strategy Engine (Java)]
       │
       ▼ (generates trade order)
TimescaleDB: trade_orders (status: ACTIVE)
       │
       ▼ (monitored every 60s)
Trade Resolution Daemon (`resolver/trade_resolver.py`)
       │
       ├── Fetch market price (Yahoo Finance fast_info / history)
       ├── Check price vs target_price & stop_loss
       └── Check elapsed holding days vs MAX_HOLDING_DAYS (14d)
       │
       ▼ (if resolved)
Update TimescaleDB:
  - status: HIT_TARGET | HIT_STOP | EXPIRED | RESOLVED_WIN | RESOLVED_LOSS
  - resolved_at: UTC ISO timestamp
  - resolved_price: Execution or exit price
  - pnl_percent: Realized return percentage
  - realized_pnl_usd: Dollar PnL based on recommended_size_usd
       │
       ▼ (Kafka dispatch)
Kafka: `trade-resolutions` topic
       │
       ├── Notification Dispatcher (alerts)
       └── FastAPI Analytics & Executive KPI Aggregations (/orders/stats, /metrics)
```

---

## 2. Mathematical PnL Calculations

The resolver calculates return metrics with full directional awareness:

### Long Positions (`action == "BUY"`)
- **Target Condition**: `current_price >= target_price` $\to$ `status = "HIT_TARGET"` (or `RESOLVED_WIN`)
- **Stop Condition**: `current_price <= stop_loss` $\to$ `status = "HIT_STOP"` (or `RESOLVED_LOSS`)
- **Return Percentage**:
  $$\text{pnl\_percent} = \left(\frac{\text{current\_price} - \text{limit\_price}}{\text{limit\_price}}\right) \times 100.0$$
- **Realized Dollar PnL**:
  $$\text{realized\_pnl\_usd} = \text{round}\left(\text{recommended\_size\_usd} \times \frac{\text{pnl\_percent}}{100.0},\, 2\right)$$

### Short Positions (`action == "SELL"`)
- **Target Condition**: `current_price <= target_price` $\to$ `status = "HIT_TARGET"`
- **Stop Condition**: `current_price >= stop_loss` $\to$ `status = "HIT_STOP"`
- **Return Percentage**:
  $$\text{pnl\_percent} = \left(\frac{\text{limit\_price} - \text{current\_price}}{\text{limit\_price}}\right) \times 100.0$$
- **Realized Dollar PnL**:
  $$\text{realized\_pnl\_usd} = \text{round}\left(\text{recommended\_size\_usd} \times \frac{\text{pnl\_percent}}{100.0},\, 2\right)$$

### Expiration
If neither target nor stop is hit within `MAX_HOLDING_DAYS` (default 14 days), the trade transitions to `EXPIRED` and marks mark-to-market PnL at the current price.

---

## 3. Database Schema Reference

The `trade_orders` hypertable contains the following resolution columns:

| Column | Type | Description |
|---|---|---|
| `status` | `VARCHAR(32)` | Order status: `ACTIVE`, `HIT_TARGET`, `HIT_STOP`, `EXPIRED`, `RESOLVED_WIN`, `RESOLVED_LOSS`, `SUBMITTED` |
| `resolved_at` | `TIMESTAMPTZ` | Timestamp when the order was resolved or closed out |
| `resolved_price` | `NUMERIC(10,4)` | Market exit price at resolution time |
| `pnl_percent` | `NUMERIC(8,4)` | Realized return percentage |
| `realized_pnl_usd` | `NUMERIC(12,2)` | Realized dollar PnL based on Half-Kelly position size |

---

## 4. Running Resolution Sweeps

### Run Single Cycle Programmatically
```python
from resolver.trade_resolver import TradeResolver, get_db_connection

resolver = TradeResolver(poll_interval=60, max_holding_days=14)
with get_db_connection() as conn:
    resolved = resolver.process_cycle(conn)
    print(f"Resolved {len(resolved)} orders.")
```

### Run Daemon via Docker Compose
```bash
docker compose up -d trade-resolver
docker logs -f catalyst_trade_resolver
```

---

## 5. Verification Commands

### Test Resolver Logic
```bash
.venv/bin/pytest tests/test_trade_resolver.py
```

### Test API Order Statistics & PnL Aggregation
```bash
.venv/bin/pytest tests/test_orders_api.py -k "stats or resolution"
```

### Inspect API Stats Endpoint
```bash
curl -s http://localhost:8000/orders/stats | jq '{
  total_orders,
  hit_target_count,
  hit_stop_count,
  win_rate_percent,
  realized_pnl_percent,
  total_realized_pnl_usd
}'
```

---

## 6. Maintenance & Troubleshooting

1. **Missing Yahoo Finance Quotes**:
   - The resolver first queries `yf.Ticker(ticker).fast_info.last_price`.
   - If missing, it defensively falls back to `yf.Ticker(ticker).history(period="1d")["Close"]`.
   - If both fail (e.g. rate limit or invalid symbol), the order remains `ACTIVE` until the next cycle.
2. **Double Resolution Prevention**:
   - The query filters exclusively on `WHERE status = 'ACTIVE'`. Once an order is updated, it will not be evaluated again.
3. **Kafka Event Delivery**:
   - Resolutions are broadcast to `trade-resolutions`. If Kafka is unreachable, the database update still commits cleanly and a warning is logged.
