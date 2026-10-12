# Catalyst

Catalyst collects market events from five financial feeds, checks whether independent sources agree, and produces structured research recommendations. Python handles ingestion and Gemini analysis, Redis tracks source confluence, Java applies market-regime checks and Half-Kelly sizing, and TimescaleDB stores results for a Next.js dashboard.

**[Open the public dashboard](https://d36bndaw2y0rrh.cloudfront.net)** · [Engineering notebook](https://d36bndaw2y0rrh.cloudfront.net/architecture/) · [Operations and cost model](docs/PUBLIC_DEMO_OPERATIONS.md)

## What you can inspect

The public site is a read-only daily snapshot. An AWS worker collects once each weekday at 10:00 AM New York time, publishes bounded API results, and shuts down. S3 and CloudFront keep the dashboard available between scans. Collection times, source failures, and zero-result scans are shown explicitly.

The public profile requires two distinct hunter sources, Search-grounded Gemini analysis, and a conviction score of at least 50. Java checks SPY/VIX regime data before sizing; missing or stale data halts recommendations. Public brokerage execution and notification dispatch are disabled. Outcome figures model recommendation allocations at sampled prices, rather than broker fills or realized trading profit.

The local application retains API-backed pages, streaming updates, optional Alpaca paper execution, and configured notifications. Those capabilities are separate from the public daily demonstration.

## Engineering questions

This project explores the mechanics of a pipeline that spans provider scraping, durable event delivery, AI validation, deterministic sizing, and finite cloud operation. Useful places to start:

- [Confluence filtering](gatekeeper/gatekeeper.py) and its [tests](tests/test_gatekeeper.py): count distinct sources within a five-minute window and reserve duplicate dispatches atomically.
- [AI validation](ai_layer/ai_service.py) and the [persistent request budget](ai_layer/request_budget.py): require grounding in the public profile and reserve requests before network access.
- [Market data regression tests](engine/src/test/java/com/catalyst/engine/service/MarketDataServiceTest.java): verify VIX retrieval, the 200-session average, and freshness after a URL-encoding failure found in cloud verification.
- [Publication sequence](deploy/batch.sh): upload the immutable dataset and private backup before promoting the manifest, preserving the prior dataset when a newer attempt fails.

The [October 5 release verification](docs/verification/2026-10-05-design-refinement.json) records 524 automated tests. This is a dated check of controlled behavior. There is no measured live 50–100 events/minute artifact or demonstrated predictive edge. A daily price sample can miss intraday stop/target crossings.

---

## 1. System Architecture & Event Topology

```mermaid
graph TD
    subgraph Layer 1: Ingestion
        H1[Squeeze Hunter: Finviz] -->|signal-squeeze| RE[Kafka: raw-events]
        H2[Biotech Hunter: BioPharmCatalyst] -->|signal-biotech| RE
        H3[Insider Hunter: SEC Form 4] -->|signal-insider| RE
        H4[Whale Hunter: Barchart Options] -->|signal-whale| RE
        H5[Drifter Hunter: FMP Earnings] -->|signal-earnings| RE
    end

    subgraph Layer 2: Confluence & Filtering
        RE --> GK[Gatekeeper Service]
        GK <-->|Rolling 5m ZSET Window| RD[(Redis: gk:sources_zset / gk:sent)]
        GK -->|Confluence >= 2 or Tech Score >= 70| TP[Kafka: triage-priority]
    end

    subgraph Layer 3: AI Validation
        TP --> AI[AI Layer: Gemini]
        AI <-->|Real-Time Grounding| GS[Google Search API]
        AI -->|Conviction >= 50| VS[Kafka: validated-signals]
    end

    subgraph Layer 4: Execution, Sizing & Resolution
        VS --> PS[Persistence Service]
        PS --> DB[(TimescaleDB: validated_signals)]
        VS --> NT[Notification Service]
        NT -->|Webhook Alerts| DC[Discord / Slack / Telegram]
        VS --> ENG[Strategy Engine: Java 21 Spring Boot]
        ENG <-->|Regime / Pricing| YF[Yahoo Finance]
        ENG --> TO[Kafka: trade-orders]
        ENG --> DB2[(TimescaleDB: trade_orders)]
        TO --> EXEC[Alpaca Executor]
        EXEC <-->|Paper Orders| ALP[Alpaca Markets API]
        RES[Trade Resolver Daemon] <-->|Lifecycle & PnL| DB2
        RES <-->|Sampled Prices| YF
    end

    subgraph Layer 5: Presentation & Telemetry
        DB2 --> API[FastAPI Read Layer]
        DB --> API
        API --> UI[Next.js 16 Dashboard]
        API -->|SSE Stream /signals/stream| UI
        API -->|Prometheus /metrics| PR[Prometheus / Grafana]
    end
```

---

## 2. Core Subsystems

| Subsystem | Tech Stack | Status | Primary Responsibility |
|---|---|---|---|
| **Hunters** (`hunters/`) | Python 3.12, Playwright, BeautifulSoup, HTTPX | 5 hunters | Bounded sweeps scanning Finviz (Squeeze), BioPharmCatalyst (FDA readouts), SEC EDGAR (Form 4 insider buys), Barchart (unusual options flow), and FMP (post-earnings beats). |
| **Gatekeeper** (`gatekeeper/`) | Python 3.12, Redis 7, Kafka | Implemented | Stateful noise filter using Redis Sorted Sets (`gk:sources_zset:{ticker}`) for sliding 5-min confluence ($\ge 2$ sources) and atomic `SET NX EX` deduplication. Enforces volume ($\ge 50\text{k}$), RVOL ($\ge 1.5\times$), and price bounds. |
| **AI Layer** (`ai_layer/`) | Python 3.12, Google GenAI SDK | Implemented | Synthesizes catalysts using Gemini with Google Search grounding. Generates structured JSON (catalyst type, conviction score, stop loss, profit target, trap indicators). Drops signals with conviction $< 50$. |
| **Strategy Engine** (`engine/`) | Java 21, Spring Boot 3.4, JPA, Spring Kafka | 36 recorded tests | Quantitative risk engine. Assesses SPY versus its 200-day SMA and VIX to classify market regime (`PASS`, `SCALPER_ONLY`, `PASS_BEARISH`, `HALT`). Calculates position sizing via Half-Kelly criterion ($f^* = (bp - q) / 2b$), capped at 25% of a $100,000 book per recommendation by default. Routes to 4 specialized strategies (Supernova, Scalper, Drifter, Follower). |
| **Persistence** (`persistence/`) | Python 3.12, TimescaleDB / PostgreSQL 16 | Implemented | Consumes `validated-signals` and persists records into TimescaleDB hypertables with catalyst indexing and non-blocking offset commits on corrupt payloads. |
| **Executor** (`executor/`) | Python 3.12, Alpaca REST API | Implemented | Consumes `trade-orders` and dispatches paper orders with exponential backoff on HTTP 429, execution circuit breakers, and notional trade caps. |
| **Trade Resolver** (`resolver/`) | Python 3.12, TimescaleDB, Yahoo Finance | Implemented | Resolves `ACTIVE` recommendations against sampled Yahoo prices and a 14-calendar-day holding limit. Persists modeled recommendation PnL and `HIT_TARGET`, `HIT_STOP`, or `EXPIRED`; this daemon does not query broker fills or close positions. |
| **Notification Dispatcher** (`notifier/`) | Python 3.12, Webhooks, HTTPX | Implemented | Optional local multi-channel notification consumer consuming `validated-signals` and dispatching rich alerts to Discord embeds, Slack Block Kit, and Telegram HTML for high-conviction events ($\ge 70$). |
| **FastAPI Read Layer** (`api/`) | Python 3.12, FastAPI, asyncpg, Redis | Implemented | Asynchronous REST and Server-Sent Events (SSE) streaming API (`/signals/stream`). Exposes KPI statistics (`/signals/stats`, `/orders/stats`), CSV exports, market quotes, pipeline health (`/health/pipeline`), and Prometheus metrics (`/metrics`). |
| **Frontend Dashboard** (`frontend/`) | Next.js 16, React 19, Tailwind CSS 4, Vitest | 187 recorded tests | Read-only public daily snapshot plus API-backed local dashboard, responsive labeled signal table, clear collection freshness and partial-run status, readable chart summaries, accessible keyboard-navigable filters, and persistent light/dark themes. |

---

## 3. Test Coverage & Quality Gates

The October 5, 2026 release recorded **524 passing automated tests** across three suites. Counts below describe that release, not a fresh run of the current checkout:

```text
================================ TEST SUITE SUMMARY ================================
✅ Python Microservices (Pytest):   301 tests passed (0 failures, 100% pass rate)
✅ Java Quantitative Engine (JUnit 5): 36 tests passed (0 failures, 100% pass rate)
✅ Next.js Frontend (Vitest):        187 tests passed (0 failures, 100% pass rate)
------------------------------------------------------------------------------------
TOTAL VERIFIED AUTOMATED TESTS:      524 tests passing across stack
====================================================================================
```

### Running the Test Suites

#### 1. Python Test Suite (301 tests)
```bash
.venv/bin/pytest
.venv/bin/ruff check .
```

#### 2. Java Strategy Engine Suite (36 tests)
```bash
# macOS: export JAVA_HOME=$(/usr/libexec/java_home -v 21)
# Linux: export JAVA_HOME=/usr/lib/jvm/temurin-21-jdk
cd engine && mvn -B test && cd ..
```

#### 3. Frontend Vitest Suite (187 tests)
```bash
npm --prefix frontend run test
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
```

---

## 4. Quick Start

### Prerequisites
- Docker & Docker Compose
- Python 3.12+
- Node.js 22
- Java 21 (Temurin)

### Environment Configuration
```bash
cp .env.example .env
```
Fill in your credentials:
```ini
GEMINI_API_KEY=your_gemini_api_key
FMP_API_KEY=your_fmp_api_key
ALPACA_API_KEY=your_alpaca_key
ALPACA_SECRET_KEY=your_alpaca_secret
```

### Start the Infrastructure & Microservices
```bash
# Launch core services via Docker Compose
docker compose up -d

# Launch the Next.js frontend
cd frontend && npm install && npm run dev
```

The frontend will be accessible at [http://localhost:3000](http://localhost:3000) and the FastAPI swagger documentation at [http://localhost:8000/docs](http://localhost:8000/docs).

---

## 5. End-to-End Pipeline Verification

Verify pipeline event flow end-to-end using the automated health probe:
```bash
python scripts/verify_pipeline_health.py
```

Or inject synthetic catalyst events into Kafka `raw-events` to test confluence and AI validation:
```bash
python scripts/inject_synthetic_signals.py --ticker NVDA --sources squeeze,insider --tech-score 75
```

---

## 6. AWS Deployment & Cost Efficiency

The public demo is deployed as a static Next.js export on private S3 with CloudFront HTTPS. A scheduled EC2 Docker worker runs the Kafka/Python/Java pipeline and exports results once each weekday. The worker stops after publication, with independent shutdown deadlines for failed runs. Public hosting and worker runtime are separate.

The operating target is at most $10/month excluding domain registration and tax, under bounded runtime, AI requests, and retention. The account-wide AWS Budget is a tracking threshold, not a hard billing cap, and has no email subscription. The [operations record](docs/PUBLIC_DEMO_OPERATIONS.md) documents the assumptions, schedules, infrastructure and limitations. The [original deployment plan](docs/PUBLIC_DEMO_DEPLOYMENT_PLAN.md) is historical planning material.

Use the [public CDK stack](infra/public_demo_stack.py) for the current deployment. The [legacy stack](infra/catalyst_stack.py) and its older market-hours instructions are retained separately; their schedules are disabled.

---

## 7. Documentation & Architecture Reference

- **[AGENTS.md](AGENTS.md)**: Master living architectural specification and knowledge base for developers and AI agents.
- **[CONTRIBUTING.md](docs/CONTRIBUTING.md)**: Developer guide for setup, linting, testing, and PR conventions.
- **[ENGINE.md](docs/ENGINE.md)**: Java strategy engine formulas, regime filter bounds, and Half-Kelly position sizing.
- **[PIPELINE_EXPLAINED.md](docs/PIPELINE_EXPLAINED.md)**: In-depth event ingestion and confluence logic.
