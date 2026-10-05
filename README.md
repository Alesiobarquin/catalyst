# Catalyst: Event-Driven Market Catalyst Discovery & Algorithmic Trading Pipeline

[![Python](https://img.shields.io/badge/Python-3.12-blue.svg)](https://www.python.org/)
[![Java](https://img.shields.io/badge/Java-21%20(LTS)-orange.svg)](https://adoptium.net/)
[![Next.js](https://img.shields.io/badge/Next.js-16%20App%20Router-black.svg)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688.svg)](https://fastapi.tiangolo.com/)
[![Tests](https://img.shields.io/badge/Tests-516%20Passing-emerald.svg)](https://github.com/Alesiobarquin/catalyst)
[![License](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)

**Catalyst** is an event-driven quantitative trading and market signal discovery platform. It ingests volatile market events across disparate financial feeds (scrapers, SEC EDGAR Form 4 filings, unusual options flow, earnings surprises), filters them through a stateful Redis confluence gatekeeper, validates theses in real-time via Gemini with Google Search grounding, sizes orders via a Java Spring Boot quantitative engine (Half-Kelly criterion and SPY/VIX regime filtering), executes paper orders via Alpaca Markets, tracks closed-loop lifecycle PnL via an autonomous resolver daemon, broadcasts real-time alerts to Discord/Slack/Telegram, and provides an executive analytics dashboard built on Next.js 16 and FastAPI.

## Public demo

**[Open Catalyst](https://d36bndaw2y0rrh.cloudfront.net)** · [How it works](https://d36bndaw2y0rrh.cloudfront.net/architecture/) · [Deployment operations](docs/PUBLIC_DEMO_OPERATIONS.md)

The portfolio dashboard is available continuously. To keep costs below the $10/month target, the full AWS Docker/Kafka pipeline collects once each weekday at 10:00 AM New York time, exports its FastAPI results, and shuts down. Collection timestamps and per-source run outcomes are displayed; zero qualifying signals and unavailable sources are reported honestly. The public profile uses strict two-source confluence, grounded Gemini 3.8 Flash, Java 21 virtual threads, Half-Kelly sizing, and TimescaleDB persistence. The static dashboard stays available between scans. Its PnL reflects modeled recommendations checked at sampled prices; public brokerage execution and notification dispatch are disabled.

The latest published organic AWS scan is October 5: three of five hunters completed, while Squeeze failed and Whale timed out. It produced no qualifying recommendations, which the dashboard reports alongside the partial-run status and collection time. The worker stopped automatically. See the [verification record](docs/verification/2026-10-05-theme-verification.json) and [deployment operations](docs/PUBLIC_DEMO_OPERATIONS.md). The local API-backed development experience and optional execution services remain available in the repository.

## Why Catalyst?

**Catalyst began as a learning experiment**: What would it take to build a production-grade, event-driven trading pipeline that spans multiple languages, integrates real-time AI reasoning, and maintains institutional-grade risk controls — all while keeping cloud costs under $10/month?

The answer turned into a polyglot distributed system: Python microservices for rapid data ingestion and AI integration, a Java Spring Boot engine for deterministic quantitative math, and a Next.js 16 dashboard for real-time visualization. Every architectural decision — from Redis Sorted Set confluence windows to Half-Kelly position sizing to scheduled EC2 shutdowns — was driven by a specific engineering trade-off worth understanding.

Explore the [How It Works](https://d36bndaw2y0rrh.cloudfront.net/architecture/) page in the dashboard for an interactive deep-dive into the design decisions.

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
| **Hunters** (`hunters/`) | Python 3.12, Playwright, BeautifulSoup, HTTPX | ✅ 5 Active | Autonomous scrapers scanning Finviz (Squeeze), BioPharmCatalyst (FDA readouts), SEC EDGAR (Form 4 insider buys), Barchart (unusual options flow), and FMP (post-earnings beats). |
| **Gatekeeper** (`gatekeeper/`) | Python 3.12, Redis 7, Kafka | ✅ Hardened | Stateful noise filter using Redis Sorted Sets (`gk:sources_zset:{ticker}`) for sliding 5-min confluence ($\ge 2$ sources) and atomic `SET NX EX` deduplication. Enforces volume ($\ge 50\text{k}$), RVOL ($\ge 1.5\times$), and price bounds. |
| **AI Layer** (`ai_layer/`) | Python 3.12, Google GenAI SDK | ✅ Active | Synthesizes catalysts using Gemini with Google Search grounding. Generates structured JSON (catalyst type, conviction score, stop loss, profit target, trap indicators). Drops signals with conviction $< 50$. |
| **Strategy Engine** (`engine/`) | Java 21, Spring Boot 3.4, JPA, Spring Kafka | ✅ 36 Tests | Quantitative risk engine. Assesses SPY versus its 200-day SMA and VIX to classify market regime (`PASS`, `SCALPER_ONLY`, `PASS_BEARISH`, `HALT`). Calculates position sizing via Half-Kelly criterion ($f^* = (bp - q) / 2b$), capped at 25% of a $100,000 book per recommendation by default. Routes to 4 specialized strategies (Supernova, Scalper, Drifter, Follower). |
| **Persistence** (`persistence/`) | Python 3.12, TimescaleDB / PostgreSQL 16 | ✅ Active | Consumes `validated-signals` and persists records into TimescaleDB hypertables with catalyst indexing and non-blocking offset commits on corrupt payloads. |
| **Executor** (`executor/`) | Python 3.12, Alpaca REST API | ✅ Active | Consumes `trade-orders` and dispatches paper orders with exponential backoff on HTTP 429, execution circuit breakers, and notional trade caps. |
| **Trade Resolver** (`resolver/`) | Python 3.12, TimescaleDB, Yahoo Finance | ✅ Active | Resolves `ACTIVE` recommendations against sampled Yahoo prices and a 14-calendar-day holding limit. Persists modeled recommendation PnL and `HIT_TARGET`, `HIT_STOP`, or `EXPIRED`; this daemon does not query broker fills or close positions. |
| **Notification Dispatcher** (`notifier/`) | Python 3.12, Webhooks, HTTPX | ✅ Active | Real-time multi-channel notification engine consuming `validated-signals` and dispatching rich alerts to Discord embeds, Slack Block Kit, and Telegram HTML for high-conviction events ($\ge 70$). |
| **FastAPI Read Layer** (`api/`) | Python 3.12, FastAPI, asyncpg, Redis | ✅ Active | Asynchronous REST and Server-Sent Events (SSE) streaming API (`/signals/stream`). Exposes KPI statistics (`/signals/stats`, `/orders/stats`), CSV exports, market quotes, pipeline health (`/health/pipeline`), and Prometheus metrics (`/metrics`). |
| **Frontend Dashboard** (`frontend/`) | Next.js 16, React 19, Tailwind CSS 4, Vitest | ✅ 179 Tests | Read-only public daily snapshot plus API-backed local dashboard, responsive labeled signal table, clear collection freshness and partial-run status, readable chart summaries, accessible keyboard-navigable filters, and persistent light/dark themes. |

---

## 3. Test Coverage & Quality Gates

The codebase maintains rigorous multi-stack automated testing with **516 passing tests** across 3 language ecosystems:

```text
================================ TEST SUITE SUMMARY ================================
✅ Python Microservices (Pytest):   301 tests passed (0 failures, 100% pass rate)
✅ Java Quantitative Engine (JUnit 5): 36 tests passed (0 failures, 100% pass rate)
✅ Next.js Frontend (Vitest):        179 tests passed (0 failures, 100% pass rate)
------------------------------------------------------------------------------------
TOTAL VERIFIED AUTOMATED TESTS:      516 tests passing across stack
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

#### 3. Frontend Vitest Suite (179 tests)
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
- Node.js 20+
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

The current hosting target is a **public read-only dashboard available 24/7**, refreshed by **one weekday pipeline run**, for **at most $10/month** excluding domain registration. The proposed public mode uses private S3 + CloudFront for HTTPS and an EC2 Docker worker for collection, validation, sizing, and FastAPI snapshot export. It is **not yet implemented or published**.

The [Public Demo Deployment Plan](docs/PUBLIC_DEMO_DEPLOYMENT_PLAN.md) records the AWS inventory, an estimated $6–$9 combined operating cost under bounded usage, implementation gaps, and the evidence needed for the résumé claims. The site will display actual collection timestamps and distinguish live-source, heuristic, and controlled test results. Processing-rate measurements describe active runs rather than continuous collection.

The existing [CDK stack](infra/catalyst_stack.py) provides legacy EC2 start/stop functions and disabled UTC EventBridge rules. Stopping that same instance would take an instance-hosted dashboard offline; the new design separates public availability from worker runtime. Older market-hours runbooks describe the previous target.

---

## 7. Documentation & Architecture Reference

- **[AGENTS.md](AGENTS.md)**: Master living architectural specification and knowledge base for developers and AI agents.
- **[CONTRIBUTING.md](docs/CONTRIBUTING.md)**: Developer guide for setup, linting, testing, and PR conventions.
- **[ENGINE.md](docs/ENGINE.md)**: Java strategy engine formulas, regime filter bounds, and Half-Kelly position sizing.
- **[PIPELINE_EXPLAINED.md](docs/PIPELINE_EXPLAINED.md)**: In-depth event ingestion and confluence logic.
