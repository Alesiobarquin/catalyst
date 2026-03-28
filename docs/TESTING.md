# Testing Guide: Project Catalyst

This guide covers how to test **Python hunters** (data ingestion), the **Java strategy engine** (risk + sizing + `trade-orders`), and **full-stack** flows locally and in Docker.

**Deep dive (engine math, VIX, Kelly, etc.):** [ENGINE.md](ENGINE.md)

---

## 1. Prerequisites

| What | Why |
|------|-----|
| **Python 3.12+** (avoid bleeding-edge 3.14 for library compatibility) | Hunters, Gatekeeper, AI layer |
| **Docker** and **Docker Compose** | Kafka, Redis, TimescaleDB, Java engine |
| **Java 21 + Maven** (optional) | Local `mvn test` / `mvn package` for `engine/` without Docker |
| **Key paths** | `hunters/`, `engine/`, `docker-compose.yml` |

---

## 2. Option A: Local Python Testing (Fast Iteration)

Use when writing or debugging hunter logic (scrapers, filters).

### Step 0: Virtual Environment

```bash
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
```

### Step 1: Install Dependencies

```bash
pip install -r hunters/requirements.txt
playwright install chromium
```

### Step 2: Run a Hunter

From the **project root**:

```bash
python3 -m hunters.main squeeze
```

**All hunters** (if configured in `main.py`):

```bash
python3 -m hunters.main
```

### Step 3: Verify Logs

- Look for success lines (e.g. potential targets found).
- If Kafka is not running locally, you may see connection errors — expected unless Docker Kafka is up.

---

## 3. Option B: Docker — Infrastructure + Hunters

Use to match production-like networking (`kafka:29092`, etc.).

### Step 1: Start Core Services

```bash
docker compose up -d zookeeper kafka redis kafka-ui timescaledb
```

Wait ~30 seconds for Kafka health.

### Step 2: Build and Run a Hunter

```bash
docker compose build hunter-squeeze
docker compose up hunter-squeeze
```

### Step 3: Verify Kafka

1. Open **Kafka UI:** [http://localhost:8080](http://localhost:8080)
2. **Topics** → e.g. `signal-squeeze` or `raw-events`
3. **Messages** tab — JSON should appear when the hunter emits

---

## 4. Option C: Java Strategy Engine (`engine/`)

The engine **consumes** `validated-signals` and **produces** `trade-orders`, **persisting** to TimescaleDB table `trade_orders`.

### 4.1 What You Are Verifying

| Check | Pass criteria |
|-------|----------------|
| Consumer | Container starts, connects to Kafka, no crash loop |
| Regime | Logs show periodic SPY / VIX / SMA refresh (or warnings if Yahoo fails) |
| Pipeline | A synthetic `validated-signals` message yields a `trade-orders` message |
| Persistence | Row appears in `trade_orders` with expected ticker and prices |
| Health | `GET /actuator/health` returns `UP` |

### 4.2 Run Engine via Docker Compose

From the **project root**:

```bash
docker compose up -d zookeeper kafka timescaledb
# Wait for Kafka healthy, then:
docker compose up -d --build engine
```

**Health check:**

```bash
curl -s http://localhost:8081/actuator/health | jq .
```

**Tail logs:**

```bash
docker logs -f catalyst_engine
```

### 4.3 Send a Synthetic `validated-signals` Message

Use a JSON line that matches [schemas.md §2](schemas.md) (required fields: `ticker`, `timestamp_utc`, `conviction_score`, `catalyst_type`, `rationale`, `is_trap`, `confluence_sources`).

**Example (Supernova, should pass regime if VIX &lt; 30):**

```bash
docker exec -it catalyst_kafka kafka-console-producer \
  --bootstrap-server localhost:9092 \
  --topic validated-signals
```

Paste (one line):

```json
{"ticker":"NVDA","timestamp_utc":"2026-03-23T14:30:00Z","conviction_score":82,"catalyst_type":"SUPERNOVA","rationale":"High short interest + insider buy","is_trap":false,"confluence_sources":["squeeze","insider"]}
```

### 4.4 Read `trade-orders`

```bash
docker exec -it catalyst_kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic trade-orders \
  --from-beginning \
  --max-messages 5
```

You should see JSON with `limit_price`, `stop_loss`, `target_price`, `recommended_size_usd`, `strategy_used`.

### 4.5 Verify TimescaleDB Persistence

```bash
docker exec -it catalyst_db psql -U catalyst_user -d catalyst_db -c \
  "SELECT ticker, strategy_used, recommended_size_usd, limit_price, stop_loss, target_price, regime_vix, spy_above_200sma
   FROM trade_orders ORDER BY timestamp_utc DESC LIMIT 5;"
```

If the table is missing, check engine logs for **Flyway** migration errors (first startup creates the hypertable).

### 4.6 Trap Signal (Should NOT Produce an Order)

Send `is_trap: true` — engine should **drop** and you should **not** see a new `trade-orders` message for that tick (or check logs for “trap”).

### 4.7 Local Maven Build (Optional, No Docker)

Requires **Java 21** and **Maven** installed:

```bash
cd engine
mvn -q test        # when tests exist
mvn -q package -DskipTests
```

Run the JAR against local Kafka/Postgres (set env vars to match `application.yml` defaults or export `KAFKA_BOOTSTRAP_SERVERS`, `TIMESCALE_*`).

### 4.8 What to Mock / Stub in Unit Tests

| Component | Mock |
|-----------|------|
| `ValidatedSignalConsumer` | `RegimeFilter`, `MarketDataService`, `StrategyRouter`, `KellySizer`, `TradeOrderProducer`, `TradeOrderRepository` |
| `KellySizer` | Pure math — feed fixed `TradeOrder` prices and `ValidatedSignal.convictionScore` |
| `RegimeFilter` | `MarketDataService.getMarketSnapshot()` returning fixed SPY/VIX/SMA |
| Kafka | `@EmbeddedKafka` + `KafkaTemplate` (Spring Boot test slice) |
| Database | `@DataJpaTest` with Testcontainers PostgreSQL/Timescale, or H2 with limitations |

---

## 5. Option D: Gatekeeper + AI + Engine (Long E2E)

1. Start stack including `gatekeeper`, `ai-layer`, `engine`, `persistence` (if you want `validated_signals` rows too).
2. Use README **End-to-End Testing** synthetic `raw-events` to drive confluence and AI.
3. Confirm `validated-signals` in Kafka UI, then confirm `trade-orders` and `trade_orders` as in §4.

**Note:** AI layer needs `GEMINI_API_KEY` in `.env`.

---

## 6. Troubleshooting

### "ModuleNotFoundError: No module named 'hunters'"

**Cause:** Running from inside `hunters/` instead of project root.  
**Fix:** `cd` to repo root; use `python3 -m hunters.main ...`.

### Kafka connection refused (Python or Java)

**Cause:** Broker not running or wrong `KAFKA_BOOTSTRAP_SERVERS`.  
**Fix:** `docker compose up -d kafka` — from **host** use `localhost:9092`; from **container** use `kafka:29092`.

### Engine exits or unhealthy

- Check `docker logs catalyst_engine` for Flyway/DB errors or Kafka errors.
- Confirm `timescaledb` is up: `docker compose ps`.
- Confirm port **8081** is free on the host.

### No messages on `trade-orders`

- **Regime HALT:** VIX ≥ `VIX_HALT_THRESHOLD` (default 40) — engine drops everything. Check engine logs.
- **SCALPER_ONLY:** Only `catalyst_type: "SCALPER"` passes. A `SUPERNOVA` signal is dropped.
- **Kelly ≤ 0:** Low conviction vs. reward-to-risk — engine skips (see [ENGINE.md](ENGINE.md)).
- **Price fetch failed:** Yahoo Finance unreachable — engine skips that signal.

### Scraper returns 0 results

**Cause:** Anti-bot or site layout change.  
**Fix:** Run with visible browser (`HEADLESS_MODE=False`) and inspect `hunters/common/config.py`.

---

## 7. Quick Reference: Topics and Tables

| Artifact | Purpose |
|----------|---------|
| `raw-events` | Hunter output |
| `validated-signals` | Gemini output; engine **input** |
| `trade-orders` | Engine **output** |
| `validated_signals` (DB) | Python persistence consumer |
| `trade_orders` (DB) | Java engine persistence |

---

## Document Map

- [ENGINE.md](ENGINE.md) — Strategy layer concepts and behavior
- [schemas.md](schemas.md) — JSON contracts + DB supplements
- [ARCHITECTURE.md](ARCHITECTURE.md) — Full stack narrative
- [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) — Phases and status
