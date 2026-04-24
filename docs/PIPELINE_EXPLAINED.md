# Pipeline Explained: What Actually Happens When You Run the Stack

This page is for **new contributors** who have run `docker compose up` and wonder why a ticker did not magically travel hunter → filter → Gemini → engine → trade in one shot. It complements [ARCHITECTURE.md](ARCHITECTURE.md) (big picture), [TESTING.md](TESTING.md) (commands), and [ENGINE.md](ENGINE.md) (Java strategy details).

---

## 1. One command starts services — it does not “push one stock through”

`docker compose up -d --build` does **not** orchestrate a single end-to-end demo. It **starts** every container (hunters, Kafka, Redis, TimescaleDB, gatekeeper, AI layer, persistence, Java engine, UIs, etc.) and connects them with environment variables and the Docker network.

After that, the system is **event-driven**: each service reacts to **messages on Kafka** (and Redis for the gatekeeper) as they appear. There is no central “run this ticker through the pipeline” job.

**In plain terms:**

- **Yes:** One command brings up the **full chain** so data *can* flow from hunters to `trade-orders`.
- **No:** That same command does **not** guarantee that **one** stock will traverse every stage without you waiting for market conditions or running **extra** steps (like synthetic events in [TESTING.md](TESTING.md)).

---

## 2. The happy-path data flow (when messages exist)

Rough order of topics and responsibility:

| Stage | Who | Kafka topics (typical) | Notes |
|-------|-----|------------------------|--------|
| 1 | **Hunters** (Python) | Publish to `raw-events` (and often hunter-specific topics) | Scrapers run on their own schedule; output depends on live sites and filters. |
| 2 | **Gatekeeper** | Consumes `raw-events` → may produce `triage-priority` | **Not every** `raw-events` message is forwarded. See §4. |
| 3 | **AI layer** | Consumes `triage-priority` → produces `validated-signals` | Calls **Gemini** (needs API key). May drop low-conviction signals. |
| 4 | **Java engine** | Consumes `validated-signals` → produces `trade-orders` | Regime filter, strategies, Kelly sizing — see [ENGINE.md](ENGINE.md). |
| 5 | **Persistence** (Python) | Consumes `validated-signals` → writes DB | Table `validated_signals` (not the same as engine’s `trade_orders`). |

So the **logical** chain is:

`raw-events` → (gatekeeper) → `triage-priority` → (Gemini) → `validated-signals` → (engine) → `trade-orders` (+ Timescale `trade_orders`).

---

## 3. Kafka in this project (every topic and who touches it)

Kafka is the **backbone** between services: producers append JSON messages to **topics**; consumers read with **consumer groups** so each service can track its own progress. Nothing “calls” another service directly for the main pipeline—**topics are the API**.

### 3.1 How to read Kafka UI (or `kafka-topics --list`)

- **Number of messages** on a topic is a **count of records ever retained** (subject to retention policy). High counts on `raw-events` but **zero** on `triage-priority` usually means the **gatekeeper never forwarded** (filters, confluence, or dedupe)—not that Kafka is broken.
- **`__consumer_offsets`** is an **internal** Kafka topic (consumer progress). You normally ignore it unless debugging lag or rebalances.
- Topics are typically **auto-created** when the first producer or consumer connects (dev-friendly; production often pre-creates topics with explicit settings).

### 3.2 Bootstrap addresses (repeat because mistakes here look like “Kafka is down”)

| Where the client runs | Bootstrap server |
|----------------------|------------------|
| Your laptop, or `docker exec` **inside** the `catalyst_kafka` container | `localhost:9092` |
| Any **other** Compose service, or `docker run --network <compose_network>` | `kafka:29092` |

Same broker, two advertised listeners—pick the one that matches **where the client runs**.

### 3.3 Application topics (main pipeline)

These are the topics the app uses for the **signal → trade** story. Names default from env vars; see `hunters/common/topics.py`, `gatekeeper/config.py`, `ai_layer/ai_config.py`, `persistence/config.py`, `engine` `application.yml`.

| Topic | Who **produces** | Who **consumes** | What it is |
|-------|-------------------|-------------------|------------|
| **`raw-events`** | All hunters (each emission is also sent here) | **Gatekeeper** | Unified stream for confluence and filtering. This is what the gatekeeper actually reads. |
| **`triage-priority`** | **Gatekeeper** | **AI layer** | Batches / enriched payloads for tickers that passed the gate (confluence or technical score). **Gemini only runs downstream of this topic.** |
| **`validated-signals`** | **AI layer** (after Gemini + rules) | **Java engine**, **Python persistence** | Structured “approved” signals; engine input and DB copy for `validated_signals`. |
| **`trade-orders`** | **Java engine** | Nothing in-repo yet (commentary: dashboard / future broker) | Sized orders after regime + strategy + Kelly. |

Logical chain in topics only:

`raw-events` → `triage-priority` → `validated-signals` → `trade-orders`

### 3.4 Hunter-specific topics (parallel “tap” on the wire)

Each hunter also publishes to its **own** topic for debugging or future consumers. Defaults from `hunters/common/topics.py`:

| Topic | Typical producer |
|-------|------------------|
| **`signal-squeeze`** | Squeeze hunter |
| **`signal-insider`** | Insider hunter |
| **`signal-biotech`** | Biotech hunter |
| **`signal-whale`** | Whale hunter |
| **`signal-earnings`** | Drifter hunter |

The **gatekeeper does not subscribe to these individually**—it only consumes **`raw-events`**. So seeing identical message counts on e.g. `raw-events` and `signal-insider` often means **each event was written twice** (hunter topic + `raw-events`), not that data “flowed through” an extra stage.

### 3.5 Consumer groups (why replaying topics is subtle)

Each service uses its **own consumer group** (see env defaults like `GATEKEEPER_CONSUMER_GROUP`, `PERSISTENCE_CONSUMER_GROUP`, Spring Kafka group for the engine). That means:

- **Engine** and **persistence** can both read **`validated-signals`** without stealing messages from each other (same topic, different groups → each gets a copy of the stream).
- Resetting offsets or using **`--from-beginning`** in a console consumer is for **debugging**; it does not change how the app services behave unless you change group ids or reset committed offsets.

### 3.6 What to expect when “only hunters ran”

If **`raw-events`** (and hunter topics) show traffic but **`triage-priority`** is **empty**, the pipeline stopped at the **gatekeeper** by design: events were dropped, buffered, or never met confluence. **`validated-signals`** will stay empty until **`triage-priority`** has messages the AI can process.

---

## 4. Why the gatekeeper often “does nothing visible” for one hunter

The gatekeeper **buffers** signals per ticker in Redis and only forwards to `triage-priority` when it is confident there is enough signal quality. In the default configuration, forwarding happens when **either**:

- **Confluence** — at least **two different hunter sources** have seen the **same ticker** within a **rolling time window** (see `GATEKEEPER_CONFLUENCE_THRESHOLD` and rolling window in `gatekeeper/config.py`), **or**
- **Technical score** — a high enough internal score (see `TECHNICAL_SCORE_THRESHOLD`).

If only **one** hunter emits for a ticker and the technical bar is not met, the event may be **logged as buffered** and **not** sent to Gemini. That is intentional: it reduces noise and API cost.

**Newbie takeaway:** Seeing activity in `raw-events` does **not** mean Gemini or the engine will see anything yet.

---

## 5. What has to be true for Gemini to run

- **`GEMINI_API_KEY`** must be set (for example via `.env` loaded by Compose). Without it, the AI layer cannot validate signals.
- There must be messages on **`triage-priority`**. No triage message → no Gemini call for that path.
- The AI layer applies **conviction and quality rules**; it may **drop** events and never write to `validated-signals`.

---

## 6. What has to be true for the Java engine to emit a trade

The engine only consumes **`validated-signals`**. Even with a valid message, the engine may **skip** producing `trade-orders` when:

- **Regime / VIX** — e.g. halt or scalper-only mode (see [ENGINE.md](ENGINE.md) and `docker-compose.yml` env for thresholds).
- **Catalyst type** — some types are filtered by strategy rules.
- **Kelly or sizing** — zero or negative size after risk math.
- **Market data** — if price or snapshot fetch fails, the signal may be skipped.

So **`validated-signals` activity** is necessary but not sufficient for **`trade-orders`**.

---

## 7. Why the testing guide uses “synthetic” Kafka messages

Live hunters depend on **the market** and **multiple sources** aligning. That is hard to rely on during a short debugging session.

The **recommended full-stack flow** in [TESTING.md](TESTING.md) injects **controlled JSON** into `raw-events` so you can **deterministically** prove:

1. Gatekeeper buffering vs confluence,
2. AI output on `validated-signals`,
3. Engine output on `trade-orders`,
4. Database rows.

Treat synthetic tests as the **receipt** that the plumbing works; treat live scrapers as the **real-world** stress test.

---

## 8. Newbie essentials (read this before filing “it’s broken”)

### Commands and layout

- Run Compose and Python module commands from the **repository root** unless a doc says otherwise.
- **`docker compose`** (v2) is used in docs; older `docker-compose` (hyphen) may still work if installed.

### Environment

- Copy **`.env.example`** → **`.env`** and set **`GEMINI_API_KEY`** for the AI layer.
- DB passwords in Compose are for **local dev** only — do not reuse in production.

### Kafka addresses (easy to get wrong)

- From your **Mac / host** (e.g. `kafka-console-producer` **inside** the `catalyst_kafka` container using `localhost:9092`): use **`localhost:9092`** as advertised.
- From **other containers** on the Compose network: use **`kafka:29092`** (see `KAFKA_ADVERTISED_LISTENERS` in `docker-compose.yml`).

If you connect to the wrong listener, you will see **connection refused** or confusing broker metadata errors.

### Default URLs and ports (local)

| What | URL / port |
|------|------------|
| Kafka UI | [http://localhost:8080](http://localhost:8080) |
| RedisInsight | [http://localhost:5540](http://localhost:5540) |
| Engine health | [http://localhost:8081/actuator/health](http://localhost:8081/actuator/health) |
| Postgres / Timescale | `localhost:5432` (see Compose for user/db) |

### Docker network for one-off `docker run` tests

Examples in [TESTING.md](TESTING.md) and the README use **`--network catalyst_default`** so a throwaway Kafka client can reach **`kafka:29092`**. If your project name differs, run `docker network ls` and substitute the network your Compose stack created.

### Logs

Use **`docker logs <container>`** (and `-f` to follow). Typical containers: `hunter_squeeze`, `catalyst_gatekeeper`, `catalyst_ai_layer`, `catalyst_engine`, `catalyst_kafka`.

### Two different “persistence” ideas

- **Python `persistence` service:** writes **`validated_signals`** (from `validated-signals` topic).
- **Java engine:** writes **`trade_orders`** when it creates orders.

Same database server, different tables and owners — do not confuse them when querying.

### Hunters and production realism

Scrapers can return **zero rows** (anti-bot, site changes, after-hours). That is not necessarily a broken pipeline — check hunter logs and [TESTING.md](TESTING.md) troubleshooting.

---

## 9. Where to go next

- **Hands-on:** [TESTING.md](TESTING.md) — full-stack command and step-by-step verification.
- **Kafka CLI (list topics, console consumer):** [kafka/README.md](../kafka/README.md).
- **Contracts:** [schemas.md](schemas.md) — JSON shapes for Kafka and DB.
- **Strategy math and regime:** [ENGINE.md](ENGINE.md).
- **Deployment story:** [DEPLOYMENT.md](DEPLOYMENT.md).

---

## Document Map

- [ARCHITECTURE.md](ARCHITECTURE.md) — narrative architecture
- [TESTING.md](TESTING.md) — runbooks and verification
- [ENGINE.md](ENGINE.md) — Java engine behavior
- [schemas.md](schemas.md) — payloads
- [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) — project phases
