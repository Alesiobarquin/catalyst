# Contributing to Catalyst

Thank you for contributing to Catalyst! This document provides guidelines for environment setup, code style, testing requirements, and contribution workflows.

---

## 1. System Requirements & Toolchain

To develop across all layers of the Catalyst platform, ensure you have the following installed:

- **Python**: `3.12+` with virtual environment support (`venv`)
- **Node.js**: `v20+` or `v22+` with `npm`
- **Java**: `Java 21 (LTS)` (Eclipse Temurin recommended) with `mvn 3.9+`
- **Docker & Docker Compose**: `Docker Engine 24+` / `Docker Desktop`
- **Git**: For version control

---

## 2. Repository Structure

```text
catalyst/
├── ai_layer/          # Gemini 2.5 LLM validation service with Google Search grounding
├── api/               # FastAPI read-layer, SSE streaming, stats, and telemetry
├── engine/            # Java 21 Spring Boot 3.4 quantitative strategy & Half-Kelly engine
├── executor/          # Alpaca paper trading autonomous execution bridge
├── frontend/          # Next.js 16 (App Router) + React 19 + Tailwind CSS 4 dashboard
├── gatekeeper/        # Stateful confluence gatekeeper, Redis ZSET rolling window & filters
├── hunters/           # Financial scrapers (Squeeze, Biotech, Insider, Whale, Drifter)
├── infra/             # AWS CDK infrastructure definition (EC2 + EventBridge + Lambda)
├── notifier/          # Multi-channel webhook alert dispatcher (Discord, Slack, Telegram)
├── persistence/       # TimescaleDB background ingestion consumer
├── resolver/          # Order lifecycle resolution & closed-loop PnL tracking daemon
├── scripts/           # Diagnostics, synthetic signal injection, and health verification
├── tests/             # Python pytest test suite (247 tests)
└── AGENTS.md          # Single source of truth architecture manual (MUST keep updated)
```

---

## 3. Local Development Setup

### Python Microservices Setup
```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -r api/requirements.txt
pip install -r tests/requirements.txt
```

### Next.js Frontend Setup
```bash
cd frontend
npm install
cd ..
```

### Environment Configuration
Copy `.env.example` to `.env` and fill in necessary keys:
```bash
cp .env.example .env
```
Key environment variables:
- `GEMINI_API_KEY`: Required for AI Layer signal validation.
- `FMP_API_KEY`: Required for Drifter Hunter earnings surprises.
- `ALPACA_API_KEY` & `ALPACA_SECRET_KEY`: Required for paper trade execution and resolution.
- `DISCORD_WEBHOOK_URL` / `SLACK_WEBHOOK_URL` / `TELEGRAM_BOT_TOKEN`: Optional for real-time notifications.

---

## 4. Running the Test Suites

Catalyst enforces rigorous multi-stack testing with **over 315 automated tests**. All tests must pass before submitting changes.

### 4.1 Python Unit & Integration Tests (Pytest)
```bash
.venv/bin/pytest
```
- Tests are located in `tests/`.
- All tests must pass with zero errors.

### 4.2 Code Style & Linting (Ruff)
```bash
.venv/bin/ruff check .
```
- Follow PEP 8 guidelines.
- Use explicit type annotations for all function and method signatures.
- Prefer `pathlib.Path` over `os.path`.

### 4.3 Java Strategy Engine Tests (JUnit 5 + Maven)
```bash
export JAVA_HOME=/Users/alesio/Library/Java/JavaVirtualMachines/temurin-21.0.11/Contents/Home
cd engine
mvn -B test
cd ..
```
- Tests cover Supernova, Scalper, Drifter, Follower strategies, StrategyRouter, RegimeFilter, and KellySizer.
- Requires `JAVA_HOME` pointing to Java 21.

### 4.4 Frontend Tests & Type Checking (Vitest + TypeScript)
```bash
# Run unit & component tests
npm --prefix frontend run test

# Run TypeScript typecheck
npm --prefix frontend run typecheck

# Run Next.js linting
npm --prefix frontend run lint

# Verify production build
npm --prefix frontend run build
```

---

## 5. Coding Principles & Guidelines

### Clean Code Principles
1. **DRY (Don't Repeat Yourself)**: Extract reusable logic into helper utilities.
2. **KISS (Keep It Simple, Stupid)**: Favor simple, readable implementations over excessive indirection.
3. **Defensive Programming**: Validate inputs early, handle timeouts, and implement exponential backoff on external API calls.
4. **Kafka Offsets**: Always commit offsets in consumer loops, even when dropping invalid or filtered payloads, to prevent poison-pill retry deadlocks.
5. **TimescaleDB Queries**: Always bound time-series hypertable queries to explicit time windows (`INTERVAL '...'`) to avoid multi-chunk full-table scans.

### React 19 & Next.js 16 Rules
- Never mutate ref values (`ref.current = value`) during rendering. Use `useEffect` or lazy state initializers.
- Never call `setState()` synchronously in the root of a `useEffect` hook.
- Use `src/proxy.ts` for route interception instead of deprecated `middleware.ts`.
- Ensure all interactive controls have accessible ARIA roles and keyboard navigation.

---

## 6. Critical Documentation Rule

> **CRITICAL RULE FOR ALL DEVELOPERS AND AI AGENTS:**
> `AGENTS.md` is the living single source of truth for the Catalyst project.
> Whenever you add new endpoints, update schemas, introduce environment variables, add microservices, or fix architectural bugs, **YOU MUST UPDATE `AGENTS.md` IMMEDIATELY**.
> Never leave undocumented findings or obsolete architecture descriptions behind.

---

## 7. Pull Request Checklist

Before submitting a Pull Request, verify:
- [ ] `.venv/bin/pytest` passes (247+ tests).
- [ ] `.venv/bin/ruff check .` passes with zero warnings.
- [ ] `cd engine && mvn -B test` passes (33+ tests).
- [ ] `npm --prefix frontend run test` passes (35+ tests).
- [ ] `npm --prefix frontend run typecheck` succeeds.
- [ ] `npm --prefix frontend run build` succeeds without build errors.
- [ ] `AGENTS.md` is updated with the changes and new test metrics.
