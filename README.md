# Catalyst: Event-Driven Market Catalyst Discovery & Algorithmic Trading Pipeline

[![Python](https://img.shields.io/badge/Python-3.12-blue.svg)](https://www.python.org/)
[![Java](https://img.shields.io/badge/Java-21%20(LTS)-orange.svg)](https://adoptium.net/)
[![Next.js](https://img.shields.io/badge/Next.js-16%20App%20Router-black.svg)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688.svg)](https://fastapi.tiangolo.com/)
[![Tests](https://img.shields.io/badge/Tests-331%20Passing-emerald.svg)](https://github.com/Alesiobarquin/catalyst)
[![License](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)

**Catalyst** is an event-driven quantitative trading and market signal discovery platform. It ingests volatile market events across disparate financial feeds (scrapers, SEC EDGAR Form 4 filings, unusual options flow, earnings surprises), filters them through a stateful Redis confluence gatekeeper, validates theses in real-time via Gemini 2.5 with Google Search grounding, sizes orders via a Java Spring Boot quantitative engine (Half-Kelly criterion and SPY/VIX regime filtering), executes paper orders via Alpaca Markets, tracks closed-loop lifecycle PnL via an autonomous resolver daemon, broadcasts real-time alerts to Discord/Slack/Telegram, and provides an executive analytics dashboard built on Next.js 16 and FastAPI.

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
        TP --> AI[AI Layer: Gemini 2.5]
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
        RES <-->|Order Status & Fills| ALP
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
| **AI Layer** (`ai_layer/`) | Python 3.12, Google GenAI SDK | ✅ Active | Synthesizes catalysts using Gemini 2.5 with Google Search grounding. Generates structured JSON (catalyst type, conviction score, stop loss, profit target, trap indicators). Drops signals with conviction $< 50$. |
| **Strategy Engine** (`engine/`) | Java 21, Spring Boot 3.4, JPA, Spring Kafka | ✅ 33 Tests | Quantitative risk engine. Assesses SPY 50/200 SMA and VIX to classify market regime (`PASS`, `SCALPER_ONLY`, `PASS_BEARISH`, `HALT`). Calculates position sizing via Half-Kelly criterion ($f^* = (bp - q) / 2b$) capped at 2% account equity. Routes to 4 specialized strategies (Supernova, Scalper, Drifter, Follower). |
| **Persistence** (`persistence/`) | Python 3.12, TimescaleDB / PostgreSQL 16 | ✅ Active | Consumes `validated-signals` and persists records into TimescaleDB hypertables with catalyst indexing and non-blocking offset commits on corrupt payloads. |
| **Executor** (`executor/`) | Python 3.12, Alpaca REST API | ✅ Active | Consumes `trade-orders` and dispatches paper orders with exponential backoff on HTTP 429, execution circuit breakers, and notional trade caps. |
| **Trade Resolver** (`resolver/`) | Python 3.12, TimescaleDB, Yahoo Finance | ✅ Active | Autonomous order resolution daemon polling pending orders, querying Alpaca order fills, tracking real-time price against stop/target levels, and persisting closed-loop realized PnL (`RESOLVED_WIN`, `RESOLVED_LOSS`, `EXPIRED`). |
| **Notification Dispatcher** (`notifier/`) | Python 3.12, Webhooks, HTTPX | ✅ Active | Real-time multi-channel notification engine consuming `validated-signals` and dispatching rich alerts to Discord embeds, Slack Block Kit, and Telegram HTML for high-conviction events ($\ge 70$). |
| **FastAPI Read Layer** (`api/`) | Python 3.12, FastAPI, asyncpg, Redis | ✅ Active | Asynchronous REST and Server-Sent Events (SSE) streaming API (`/signals/stream`). Exposes KPI statistics (`/signals/stats`, `/orders/stats`), CSV exports, market quotes, pipeline health (`/health/pipeline`), and Prometheus metrics (`/metrics`). |
| **Frontend Dashboard** (`frontend/`) | Next.js 16, React 19, Tailwind CSS 4, Vitest | ✅ 49 Tests | Real-time dashboard featuring SSE `LiveStreamBanner` with Web Audio synthesized chimes, TradingView `PriceChart` with full-width Entry/Stop/Target lines, `KellySimulator` quantitative risk tool, and accessible keyboard-navigable filters. |

---

## 3. Test Coverage & Quality Gates

The codebase maintains rigorous multi-stack automated testing with **331 passing tests** across 3 language ecosystems:

```text
================================ TEST SUITE SUMMARY ================================
✅ Python Microservices (Pytest):   249 tests passed (0 failures, 100% pass rate)
✅ Java Quantitative Engine (JUnit 5): 33 tests passed (0 failures, 100% pass rate)
✅ Next.js Frontend (Vitest):        49 tests passed (0 failures, 100% pass rate)
------------------------------------------------------------------------------------
TOTAL VERIFIED AUTOMATED TESTS:      331 tests passing across stack
====================================================================================
```

### Running the Test Suites

#### 1. Python Test Suite (247 tests)
```bash
.venv/bin/pytest
.venv/bin/ruff check .
```

#### 2. Java Strategy Engine Suite (33 tests)
```bash
export JAVA_HOME=/Users/alesio/Library/Java/JavaVirtualMachines/temurin-21.0.11/Contents/Home
cd engine && mvn -B test && cd ..
```

#### 3. Frontend Vitest Suite (35 tests)
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
docker compose up -d zookeeper kafka redis timescaledb gatekeeper ai-layer persistence catalyst-api resolver notifier

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

Designed as a cost-effective POC (~$3–8/month) running on an AWS EC2 `t3.medium` instance during high-probability market hours (06:50 to 16:10 ET):
- **Automated Lifecycle**: AWS EventBridge rules trigger Lambda functions to start the EC2 instance at 06:50 ET and gracefully stop it at 16:10 ET (20:10 UTC).
- **Infrastructure as Code**: Provisioned via AWS CDK in `infra/catalyst_stack.py`.
- **Runbook**: See [docs/AWS_DEPLOY_RUNBOOK.md](docs/AWS_DEPLOY_RUNBOOK.md) for step-by-step instructions.

---

## 7. Documentation & Architecture Reference

- **[AGENTS.md](AGENTS.md)**: Master living architectural specification and knowledge base for developers and AI agents.
- **[CONTRIBUTING.md](docs/CONTRIBUTING.md)**: Developer guide for setup, linting, testing, and PR conventions.
- **[ENGINE.md](docs/ENGINE.md)**: Java strategy engine formulas, regime filter bounds, and Half-Kelly position sizing.
- **[PIPELINE_EXPLAINED.md](docs/PIPELINE_EXPLAINED.md)**: In-depth event ingestion and confluence logic.
