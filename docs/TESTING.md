# Testing Guide: Project Catalyst

This guide covers how to test **Python hunters** (data ingestion), the **Java strategy engine** (risk + sizing + `trade-orders`), and **full-stack** flows locally and in Docker.

**What “one compose command” does and does not guarantee (event-driven pipeline, gatekeeper, Gemini):** [PIPELINE_EXPLAINED.md](PIPELINE_EXPLAINED.md)

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

## 2. Starting The Stack (Backend + Frontend)

### Backend — Docker Compose

**Required:** `GEMINI_API_KEY` must be set in `.env` before startup.

#### First-time start (or after a clean wipe)

```bash
# From the project root
docker compose up -d --build
```

This builds and starts every service, including the **Next.js dashboard** (`catalyst_frontend` on port **3000**): Zookeeper, Kafka, Redis, TimescaleDB, hunters, Gatekeeper, AI layer, persistence, Java engine, FastAPI, frontend, Kafka UI, and RedisInsight.

#### Restarting after Docker was stopped cleanly

If you stopped Docker or the containers exited days ago, Kafka's Zookeeper state can go stale and Kafka will refuse to start (`NodeExistsException`). The safe restart sequence is:

```bash
# 1. Remove the stale Zookeeper/Kafka containers
docker compose stop zookeeper kafka
docker compose rm -f zookeeper kafka

# 2. Bring everything back up
docker compose up -d
```

#### Frontend — included in Compose

The dashboard is **`frontend`** in `docker-compose.yml`. After `docker compose up -d --build`, open **http://localhost:3000**.

If port 3000 does not load, check that the container is up: `docker compose ps frontend` and `docker logs catalyst_frontend`.

**Alternative — run Next.js on the host** (no Docker for the UI):

```bash
cd frontend
npm install       # first time only
npm run dev
```

Same URL: **http://localhost:3000**. Ensure the API is reachable at **http://localhost:8000** (Compose maps it from `catalyst_api`).

---

### Step 1 — Verify all services are running

```bash
docker compose ps
```

Expected healthy/running services:

| Container | Port | Status |
|---|---|---|
| `catalyst_zookeeper` | 2181 | Up |
| `catalyst_kafka` | 9092 | Up (healthy) |
| `catalyst_redis` | 6379 | Up (healthy) |
| `catalyst_db` | 5432 | Up |
| `catalyst_gatekeeper` | — | Up |
| `catalyst_ai_layer` | — | Up |
| `catalyst_persistence` | — | Up |
| `catalyst_engine` | 8081 | Up (healthy) |
| `catalyst_api` | 8000 | Up (healthy) |
| `catalyst_frontend` | 3000 | Up |
| `catalyst_kafka_ui` | 8080 | Up |
| `catalyst_redisinsight` | 5540 | Up |
| `hunter_squeeze` | — | Up (loops forever) |
| `hunter_insider` | — | Up |
| `hunter_biotech` | — | Up (loops forever) |
| `hunter_drifter` | — | Up (loops; needs `FMP_API_KEY` or idle sleep) |

> **Note:** Squeeze and biotech hunters run **continuous loops**: scrape → Kafka → sleep (`SQUEEZE_INTERVAL_SECONDS` / `BIOTECH_INTERVAL_SECONDS`, defaults 900s / 1800s) → repeat. Compose uses `restart: always` so the process restarts if it crashes. Insider polls SEC RSS on its own `while True` loop.

### Day-to-day: hunter schedules

Tune intervals via `.env` (passed through Compose):

| Variable | Default | Meaning |
|----------|---------|---------|
| `SQUEEZE_INTERVAL_SECONDS` | `900` | Seconds between Finviz squeeze scans (~15 min). |
| `BIOTECH_INTERVAL_SECONDS` | `1800` | Seconds between BioPharm sweeps (~30 min; be kind to the site). |
| `DRIFTER_INTERVAL_SECONDS` | `3600` | Seconds between FMP earnings-calendar polls (~1 hr). |
| `DRIFTER_MIN_SURPRISE_PERCENT` | `5.0` | Minimum EPS beat vs consensus to emit (`eps` vs `epsEstimated`). |
| `DRIFTER_LOOKBACK_DAYS` | `3` | FMP `from=today−N` … `to=today` window. |

**Drifter** requires **`FMP_API_KEY`** in `.env`. Without it, the container stays up but only sleeps (no API calls).

Free FMP tiers are often capped around **250 API calls per day**. If you hit limits, raise **`DRIFTER_INTERVAL_SECONDS`** (and avoid shortening the lookback window unnecessarily) so each loop makes fewer calendar requests per 24h. One poll per hour (`3600`) is usually safe for a single earnings-calendar call per tick.

After changing values, recreate the hunter containers: `docker compose up -d hunter-squeeze hunter-biotech hunter-drifter`.

See [PRODUCT_PRIORITIES.md](PRODUCT_PRIORITIES.md) Track 1 for rationale.

### Step 2 — Verify API and engine health

```bash
# FastAPI read layer
curl -s http://localhost:8000/health
# → {"status":"ok","service":"catalyst-api"}

# Java strategy engine
curl -s http://localhost:8081/actuator/health | jq .status
# → "UP"
```

### Step 3: Verify Hunters Are Emitting Raw Events

There are two good ways to verify the first stage:

1. Open **Kafka UI:** [http://localhost:8080](http://localhost:8080)
2. Check topics such as `signal-squeeze` and `raw-events`
3. Confirm messages are appearing

You can also tail a hunter directly:

```bash
docker logs -f hunter_squeeze
```

Pass criteria:

- A hunter logs successful scrape/output activity.
- `raw-events` receives JSON messages.

### Step 4: Force A Deterministic Gatekeeper + AI Test

Live hunters are useful, but this synthetic test proves the downstream chain deterministically.

First event: should buffer only.

```bash
docker run --rm --network catalyst_default confluentinc/cp-kafka:7.5.0 bash -c "
echo '{\"hunter\":\"squeeze\",\"ticker\":\"TEST1\",\"price\":8.50,\"volume\":900000,\"relative_volume\":3.5,\"short_float\":28.4,\"days_to_cover\":4.8,\"timestamp\":\"2026-01-01T12:00:00\"}' \
  | kafka-console-producer --broker-list kafka:29092 --topic raw-events
"
docker logs catalyst_gatekeeper 2>&1 | grep TEST1
```

Second event: should create confluence and forward.

```bash
docker run --rm --network catalyst_default confluentinc/cp-kafka:7.5.0 bash -c "
echo '{\"hunter\":\"insider\",\"ticker\":\"TEST1\",\"transaction_code\":\"P\",\"transaction_amount_usd\":750000,\"volume\":900000,\"relative_volume\":3.5,\"price\":8.50,\"source\":\"edgar_api_json\",\"timestamp\":\"2026-01-01T12:00:05\"}' \
  | kafka-console-producer --broker-list kafka:29092 --topic raw-events
"
docker logs catalyst_gatekeeper 2>&1 | grep TEST1
```

Pass criteria:

- First message is buffered but not forwarded.
- Second message triggers confluence and Gatekeeper forwards `TEST1`.

**If the second event still logs “buffered” with `confluence=1`:** the gatekeeper only counts **distinct hunter sources per ticker** in Redis (`squeeze` and `insider` are two sources). That set **expires** after `GATEKEEPER_ROLLING_WINDOW_SECONDS` (default **300** = 5 minutes). So you must run the **squeeze** producer and then the **insider** producer **within that window**, and you must run **squeeze first** (otherwise Redis only has `insider` and confluence stays 1). Confirm sources before the second message:

```bash
docker exec -it catalyst_redis redis-cli SMEMBERS gk:sources:TEST1
```

After the first (squeeze) message you should see `squeeze` in the set; after the second, both `squeeze` and `insider`. If the set is empty or only shows one source, the window expired or the first message never landed (check gatekeeper logs for `Dropped` / `unknown schema`).

### Step 5: Verify AI Output Reaches `validated-signals`

```bash
docker logs catalyst_ai_layer 2>&1 | grep -E "TEST1|Published|Dropped"
docker run --rm --network catalyst_default confluentinc/cp-kafka:7.5.0 bash -c "
  kafka-console-consumer --bootstrap-server kafka:29092 \
    --topic validated-signals --from-beginning \
    --max-messages 20 --timeout-ms 5000
" 2>&1 | grep TEST1
```

Pass criteria:

- AI logs mention `TEST1`.
- A `validated-signals` message appears for `TEST1`.

### Step 6: Verify The Java Engine Consumes And Produces `trade-orders`

```bash
docker logs catalyst_engine 2>&1 | grep -E "validated-signals|trade-orders|TEST1|Produced|Published"
docker exec -it catalyst_kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic trade-orders \
  --from-beginning \
  --max-messages 5
```

Pass criteria:

- Engine stays healthy and does not crash loop.
- A `trade-orders` message appears with fields like `limit_price`, `stop_loss`, `target_price`, `recommended_size_usd`, `strategy_used`.

### Step 7: Verify Database Persistence

```bash
docker exec -it catalyst_db psql -U catalyst_user -d catalyst_db -c \
  "SELECT ticker, strategy_used, recommended_size_usd, limit_price, stop_loss, target_price, regime_vix, spy_above_200sma
   FROM trade_orders ORDER BY timestamp_utc DESC LIMIT 5;"
```

Pass criteria:

- A row for `TEST1` appears in `trade_orders`.

### Step 8: Verify A Negative Path

This confirms the Gatekeeper still rejects bad input even when the stack is healthy.

```bash
docker run --rm --network catalyst_default confluentinc/cp-kafka:7.5.0 bash -c "
echo '{\"hunter\":\"squeeze\",\"ticker\":\"JUNK\",\"price\":3.50,\"volume\":10000,\"relative_volume\":1.2,\"short_float\":22.0,\"timestamp\":\"2026-01-01T12:01:00\"}' \
  | kafka-console-producer --broker-list kafka:29092 --topic raw-events
"
docker logs catalyst_gatekeeper 2>&1 | grep JUNK
```

Pass criteria:

- Gatekeeper logs a drop for `JUNK`.
- No downstream `validated-signals` or `trade-orders` message is created for `JUNK`.

---

## 3. Option A: Local Python Testing (Fast Iteration)

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

## 4. Option B: Docker — Focused Service Runs

Use these when you want narrower Docker runs instead of the full stack.

### Infrastructure Only

```bash
docker compose up -d zookeeper kafka redis timescaledb kafka-ui redisinsight gatekeeper ai-layer persistence engine
```

### Single Hunter Only

```bash
docker compose up -d --build hunter-squeeze
```

### Verify Kafka

1. Open **Kafka UI:** [http://localhost:8080](http://localhost:8080)
2. Check `raw-events` or service-specific topics
3. Confirm messages are appearing

---

## 5. Option C: Java Strategy Engine (`engine/`)

The engine **consumes** `validated-signals` and **produces** `trade-orders`, **persisting** to TimescaleDB table `trade_orders`.

### 5.1 What You Are Verifying

| Check | Pass criteria |
|-------|----------------|
| Consumer | Container starts, connects to Kafka, no crash loop |
| Regime | Logs show periodic SPY / VIX / SMA refresh (or warnings if Yahoo fails) |
| Pipeline | A synthetic `validated-signals` message yields a `trade-orders` message |
| Persistence | Row appears in `trade_orders` with expected ticker and prices |
| Health | `GET /actuator/health` returns `UP` |

### 5.2 Run Engine via Docker Compose

From the **project root**:

```bash
docker compose up -d --build engine kafka timescaledb
```

**Health check:**

```bash
curl -s http://localhost:8081/actuator/health | jq .
```

**Tail logs:**

```bash
docker logs -f catalyst_engine
```

### 5.3 Send a Synthetic `validated-signals` Message

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

### 5.4 Read `trade-orders`

```bash
docker exec -it catalyst_kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic trade-orders \
  --from-beginning \
  --max-messages 5
```

You should see JSON with `limit_price`, `stop_loss`, `target_price`, `recommended_size_usd`, `strategy_used`.

### 5.5 Verify TimescaleDB Persistence

```bash
docker exec -it catalyst_db psql -U catalyst_user -d catalyst_db -c \
  "SELECT ticker, strategy_used, recommended_size_usd, limit_price, stop_loss, target_price, regime_vix, spy_above_200sma
   FROM trade_orders ORDER BY timestamp_utc DESC LIMIT 5;"
```

If the table is missing, check engine logs for **Flyway** migration errors (first startup creates the hypertable).

### 5.6 Trap Signal (Should NOT Produce an Order)

Send `is_trap: true` — engine should **drop** and you should **not** see a new `trade-orders` message for that tick (or check logs for “trap”).

### 5.7 Local Maven Build (Optional, No Docker)

Requires **Java 21** and **Maven** installed:

```bash
cd engine
mvn -q test        # when tests exist
mvn -q package -DskipTests
```

Run the JAR against local Kafka/Postgres (set env vars to match `application.yml` defaults or export `KAFKA_BOOTSTRAP_SERVERS`, `TIMESCALE_*`).

### 5.8 What to Mock / Stub in Unit Tests

| Component | Mock |
|-----------|------|
| `ValidatedSignalConsumer` | `RegimeFilter`, `MarketDataService`, `StrategyRouter`, `KellySizer`, `TradeOrderProducer`, `TradeOrderRepository` |
| `KellySizer` | Pure math — feed fixed `TradeOrder` prices and `ValidatedSignal.convictionScore` |
| `RegimeFilter` | `MarketDataService.getMarketSnapshot()` returning fixed SPY/VIX/SMA |
| Kafka | `@EmbeddedKafka` + `KafkaTemplate` (Spring Boot test slice) |
| Database | `@DataJpaTest` with Testcontainers PostgreSQL/Timescale, or H2 with limitations |

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

- [PIPELINE_EXPLAINED.md](PIPELINE_EXPLAINED.md) — What runs automatically vs what requires market or synthetic events; newbie tips
- [ENGINE.md](ENGINE.md) — Strategy layer concepts and behavior
- [schemas.md](schemas.md) — JSON contracts + DB supplements
- [ARCHITECTURE.md](ARCHITECTURE.md) — Full stack narrative
- [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) — Phases and status
