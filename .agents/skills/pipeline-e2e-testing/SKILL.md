---
name: pipeline-e2e-testing
description: >-
  Provides the complete runbook for injecting synthetic market catalyst signals into Kafka
  and verifying end-to-end processing across Gatekeeper confluence, Redis caching, AI Layer
  validation, Java Engine trade sizing, TimescaleDB persistence, and FastAPI endpoints.
---

# Pipeline End-to-End Testing & Synthetic Signal Injection

Use this runbook to test, verify, and debug the entire Catalyst pipeline without waiting for organic market scraper events.

## Architecture & Signal Flow

```
[Hunters / Scrapers]
        │
        ▼ (raw catalyst events)
Kafka: raw-events
        │
        ▼ (5-min rolling window, Confluence >= 2 or technical score >= 4)
Gatekeeper (Redis state: gk:sources:{TICKER}, gk:signals:{TICKER})
        │
        ▼ (triage payload)
Kafka: triage-priority
        │
        ▼ (Gemini 2.5 + Google Search grounding, Conviction >= 50)
AI Layer
        │
        ▼ (structured analysis JSON)
Kafka: validated-signals
   ┌────┴──────────────────────────┐
   ▼                               ▼
Persistence Service          Strategy Engine (Java Spring Boot)
(TimescaleDB: validated_signals)   │ (SPY/VIX regime + Half-Kelly sizing)
                                   ▼
                             Kafka: trade-orders + TimescaleDB: trade_orders
```

---

## 1. Quick Verification with Helper Scripts

Catalyst includes a dedicated script to inject synthetic signals:

```bash
# Confluence test (triggers Gatekeeper -> AI -> Engine -> DB)
# Note: Use NVDA or real tickers so the Java engine can fetch live Yahoo Finance prices!
python scripts/inject_synthetic_signals.py --scenario confluence --ticker NVDA

# Single source test (verifies Gatekeeper buffers without forwarding)
python scripts/inject_synthetic_signals.py --scenario single --ticker TEST1

# Low volume test (verifies Gatekeeper drop filter)
python scripts/inject_synthetic_signals.py --scenario drop --ticker JUNK
```

Monitor Redis confluence status in real time:
```bash
python scripts/confluence_watcher.py --threshold 2 --interval 1.0
```

---

## 2. Docker Compose Infrastructure Verification

Before injecting events, ensure required containers are healthy:

```bash
docker compose ps

# Check core services
docker logs catalyst_gatekeeper 2>&1 | tail -n 20
docker logs catalyst_ai_layer 2>&1 | tail -n 20
docker logs catalyst_engine 2>&1 | tail -n 20
```

If starting fresh infrastructure only:
```bash
docker compose up -d zookeeper kafka redis gatekeeper ai-layer persistence catalyst-api
```

---

## 3. Manual Kafka Console Producer Injection

If testing directly through Kafka containers:

### Step A: Single Source (Buffers, does NOT forward)
```bash
docker run --rm --network catalyst_default confluentinc/cp-kafka:7.5.0 bash -c "
echo '{\"hunter\":\"squeeze\",\"ticker\":\"TEST1\",\"price\":8.50,\"volume\":900000,\"relative_volume\":3.5,\"short_float\":28.4,\"days_to_cover\":4.8,\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}' \
  | kafka-console-producer --broker-list kafka:29092 --topic raw-events
"
# Verification:
docker logs catalyst_gatekeeper 2>&1 | grep TEST1
# Expected log:
# "Buffered TEST1 from squeeze without trigger (confluence=1, technical_score=...)"
```

### Step B: Second Source (Triggers Confluence >= 2)
```bash
docker run --rm --network catalyst_default confluentinc/cp-kafka:7.5.0 bash -c "
echo '{\"hunter\":\"insider\",\"ticker\":\"TEST1\",\"transaction_code\":\"P\",\"transaction_amount_usd\":750000,\"volume\":900000,\"relative_volume\":3.5,\"price\":8.50,\"source\":\"edgar_api_json\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}' \
  | kafka-console-producer --broker-list kafka:29092 --topic raw-events
"
# Verification:
docker logs catalyst_gatekeeper 2>&1 | grep TEST1
# Expected log:
# "Forwarded TEST1 to triage-priority (confluence=2, technical_score=...)"
```

### Step C: Inspect AI Layer Output
```bash
docker logs catalyst_ai_layer 2>&1 | grep -E "TEST1|Published|Dropped"

# Check messages on validated-signals topic:
docker run --rm --network catalyst_default confluentinc/cp-kafka:7.5.0 bash -c "
kafka-console-consumer --bootstrap-server kafka:29092 \
  --topic validated-signals --from-beginning \
  --max-messages 10 --timeout-ms 5000
" 2>&1 | grep TEST1
```

---

## 4. Real vs Synthetic Tickers (Critical Gotcha!)

- **Synthetic Tickers (e.g. `TEST1`, `FAKE`)**:
  - Gatekeeper and AI Layer will process them normally.
  - However, the Java Strategy Engine calls Yahoo Finance to get market price and historical volatility for position sizing.
  - For synthetic tickers, the Java engine logs a price fetch failure and skips creating a `trade_order`.
- **Real Tickers (e.g. `NVDA`, `AAPL`, `TSLA`)**:
  - Always use real tickers when verifying the engine, Kelly sizing, and database order creation.

---

## 5. Inspecting Redis State

Check Gatekeeper state in Redis (`localhost:6379`):

```bash
# Check registered sources for a ticker
redis-cli SMEMBERS gk:sources:NVDA

# Check accumulated raw signals
redis-cli LRANGE gk:signals:NVDA 0 -1

# Check deduplication lock (TTL should be <= 300s)
redis-cli TTL gk:sent:NVDA
```

---

## 6. Verifying API & Frontend Reflection

Once validated signals and trade orders are emitted:

```bash
# Check recent validated signals
curl -s "http://localhost:8000/signals?page=1&per_page=5" | jq .

# Check signal statistics
curl -s "http://localhost:8000/signals/stats" | jq .

# Check recent trade orders
curl -s "http://localhost:8000/orders?page=1&per_page=5" | jq .

# Test real-time SSE stream
curl -N "http://localhost:8000/signals/stream"
```
