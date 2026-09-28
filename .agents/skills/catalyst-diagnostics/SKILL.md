---
name: catalyst-diagnostics
description: >-
  Provides instructions for running the complete verification, testing, and code quality
  suite across Python microservices, FastAPI, and the Next.js frontend.
---

# Catalyst Diagnostics & Quality Suite

Use this runbook to run tests, format checks, linting, and health verifications across the entire Catalyst repository.

## 1. Python Test Suite (pytest)

Run the entire test suite using the project virtual environment:

```bash
# Full test suite (all 197+ tests)
.venv/bin/pytest

# Run tests with verbose output
.venv/bin/pytest -v

# Run specific test modules
.venv/bin/pytest tests/test_ai_layer.py
.venv/bin/pytest tests/test_gatekeeper.py
.venv/bin/pytest tests/test_hunters.py
.venv/bin/pytest tests/test_api.py
.venv/bin/pytest tests/test_executor.py
.venv/bin/pytest tests/test_scripts.py
.venv/bin/pytest tests/test_persistence.py
```

> [!NOTE]
> Always run with `.venv/bin/pytest` or activate the virtualenv (`source .venv/bin/activate`). Do not use global system pytest as dependencies may mismatch.

---

## 2. Python Code Quality & Linting (ruff)

Catalyst enforces PEP 8 and modern Python practices with `ruff`:

```bash
# Check for lint violations
.venv/bin/ruff check .

# Automatically fix fixable issues
.venv/bin/ruff check --fix .

# Check code formatting
.venv/bin/ruff format --check .
```

Configuration is defined in [ruff.toml](file:///Users/alesio/Developer/Projects/catalyst/ruff.toml).

---

## 3. Frontend Diagnostics (Next.js & TypeScript)

The frontend is located in `frontend/` and uses Next.js 16, React 19, and Tailwind CSS 4.

```bash
# TypeScript type checking
npm --prefix frontend run typecheck

# ESLint check (React 19 rules, hooks purity)
npm --prefix frontend run lint

# Production Next.js build
npm --prefix frontend run build
```

> [!IMPORTANT]
> **React 19 Hooks Rules**:
> - Never mutate `ref.current` during render (causes `react-hooks/refs` error). Use `useEffect` or lazy state initializers.
> - Never call `setState` synchronously within the body of an effect (causes `react-hooks/set-state-in-effect`). Initialize state with a function or subscribe to external changes.

---

## 4. Live Health Telemetry

When services are running locally via Docker Compose or standalone:

```bash
# FastAPI health check and DB pool metrics
curl -s http://localhost:8000/health | jq .

# End-to-end pipeline health (API + TimescaleDB + Java Engine)
curl -s http://localhost:8000/health/pipeline | jq .

# Java Spring Boot Strategy Engine Actuator health
curl -s http://localhost:8081/actuator/health | jq .

# Kafka UI
open http://localhost:8080

# RedisInsight
open http://localhost:5540
```
