# Catalyst Implementation Roadmap

**Purpose:** Single source of truth for implementation priorities, dependencies, and agent reference. Use this document when planning work, estimating effort, or deciding what to build next.

**Last updated:** March 2025

---

## For Agents: How to Use This Doc

- **Current state:** Section 2 describes what works and what's broken.
- **Priorities:** Section 3–6 define phases. Do not start a task until its dependencies are satisfied.
- **Dependencies:** Section 7 shows what blocks what.
- **Estimates:** Times are per task; assume student-level velocity (~6–8h/week).
- **Cut list:** Section 9 lists explicitly deferred items.

---

## 1. Project Goals (North Star)

| Goal | Meaning |
|------|---------|
| **Portfolio quality** | Ship something impressive for recruiting, not a production trading system |
| **Resume staying power** | Include Java Spring Boot engine to demonstrate polyglot + JVM ecosystem experience |
| **Dashboard value** | Track historic recommendations and see where the trade would have gone (performance tracking) |
| **Future automation** | Foundation for Alpaca API paper trading + multi-user accounts via Clerk auth |

---

## 2. Current State

### What Works

| Component | Status | Notes |
|-----------|--------|-------|
| Squeeze Hunter | ✅ Fully working | Finviz scrape → Kafka. Pre-emission filters (price, volume, short float). |
| Gatekeeper | ✅ Fully working | Redis 5-min window, confluence ≥ 2, hard filters (volume, price). |
| AI Layer | ✅ Fully working | Gemini + Search grounding, structured JSON, conviction threshold. |
| End-to-end pipeline | ✅ Verified | Squeeze → Gatekeeper → AI → validated-signals. Tested with synthetic events. |
| Docker Compose | ✅ Working | Kafka, Redis, TimescaleDB, Gatekeeper, AI Layer, hunters, Kafka UI, RedisInsight. |
| Deployment docs | ✅ Complete | DEPLOYMENT.md: EC2 + Lambda scheduling, ~$15/mo. |

### What's Broken or Partial

| Component | Issue | Impact |
|-----------|-------|--------|
| Gatekeeper | `time.sleep()` called but `time` not imported (line 98) | Crashes on Kafka retry path |
| main.py | Imports `drifter_hunter` and `shadow_hunter`; both modules have no `run()` (fully commented) | `python -m hunters.main all` → AttributeError |
| Insider Hunter | Emits without `volume`, `relative_volume`, `price` | Gatekeeper drops 100% of insider events |
| Biotech Hunter | Same liquidity gap | Gatekeeper drops 100% of biotech events |
| Whale / Drifter / Shadow | Stubs only | Not implemented; drifter/shadow break `run all` |

### What Doesn't Exist Yet

| Component | Status |
|-----------|--------|
| Persistence | TimescaleDB in compose; no consumer writes to it |
| Tests | Zero unit or integration tests |
| CI | Placeholder only (echo in GitHub Actions) |
| Java Spring Boot engine | Designed in ARCHITECTURE.md, not implemented |
| API | No HTTP endpoints |
| Dashboard | Not built |
| Alpaca integration | Not built |
| Auth (Clerk) | Not built |

---

## 3. Phase 1: Must Ship (Unblocks Deployment)

**Target:** Fix crashes, make multi-source confluence real, add tests. ~25–30 hours.

| Task | Why | Est. Time | Blocker For | Recruiting Value |
|------|-----|-----------|-------------|------------------|
| Add `import time` to `gatekeeper.py` | Crashes on Kafka retry | 0.5h | Deployment | Low |
| Remove drifter/shadow from `main.py` HUNTERS (or add no-op `run()`) | `run all` crashes | 1h | Deployment | Low |
| Fix Insider/Biotech liquidity gap | Only squeeze works E2E; confluence never fires | 6–8h | Confluence story | **High** |
| Unit tests (Gatekeeper coercers, filters; AI normalize; Squeeze filters) | Zero tests = no credibility | 8–10h | CI | **High** |
| CI: pytest + ruff in GitHub Actions | Placeholder CI = bad signal | 4–5h | — | **High** |
| TimescaleDB persistence consumer | Signals ephemeral; no queryable history | 6–8h | API, Dashboard, Engine | **High** |

**Insider/Biotech fix options:**
- **A (recommended):** Add price/volume lookup per ticker before emission (e.g., yfinance or FMP free tier). ~15 lines per hunter.
- **B:** Gatekeeper bypass for binary-event hunters; score on signal_data quality instead of liquidity.

---

## 4. Phase 2: Core Value (Resume-Strength)

**Target:** Java engine, API, dashboard with historic recommendations + trade performance. ~55–75 hours.

### 4.1 Java Spring Boot Strategy Engine

**Resume staying power:** Demonstrates polyglot design, JVM ecosystem, Kafka consumer, and algorithmic risk management.

| Task | Why | Est. Time | Blocker For |
|------|-----|-----------|-------------|
| Spring Boot 3.2+ project, Java 21 | Base for engine | 4h | — |
| Kafka consumer for `validated-signals` | Ingest from pipeline | 4–6h | — |
| Regime filter (SPY 200 SMA, VIX thresholds) | Kill switch per ARCHITECTURE | 4–6h | — |
| Kelly Sizer (Half-Kelly from conviction_score) | Position sizing | 4–6h | — |
| Strategy Router (Supernova, Scalper, Follower, Drifter) | Catalyst-type-specific exit logic | 8–10h | — |
| Producer for `trade-orders` topic | Output actionable blueprints | 2–4h | Dashboard, Alpaca |
| Persist trade-orders to TimescaleDB | For dashboard history | 4–6h | Dashboard |

**Total: ~30–40h** for full engine.

**Input:** `validated-signals` (see `docs/schemas.md`).  
**Output:** `trade-orders` (ticker, action, limit_price, stop_loss, target_price, recommended_size_usd, strategy_used, rationale).

### 4.2 API Layer

| Task | Why | Est. Time | Blocker For |
|------|-----|-----------|-------------|
| FastAPI app: `GET /signals`, `GET /signals/{ticker}`, `GET /health` | Queryable signals, demo-ability | 6–8h | Dashboard |
| Endpoints for trade-orders (historic recommendations) | Dashboard data source | 4–6h | Dashboard |

### 4.3 Dashboard (Next.js)

**Goal:** Track historic recommendations and see where the trade would have gone.

| Task | Why | Est. Time | Blocker For |
|------|-----|-----------|-------------|
| Next.js 14 + Tailwind + shadcn/ui | Base UI | 4–6h | — |
| Historic recommendations list | Show past trade-orders with conviction, rationale | 6–8h | — |
| Trade performance view | For each recommendation: entry, stop, target vs actual price over time | 10–15h | Requires price history (e.g., Alpaca or yfinance) |
| Charts (TradingView Lightweight Charts or similar) | Visualize "where the trade would be" | 6–8h | — |

**Total: ~26–37h** for dashboard.

**Key UX:** User sees "We recommended BUY XYZ at $105.50, stop $98, target $125" and can see how price evolved: did it hit target? stop? drift sideways?

---

## 5. Phase 3: Multi-User & Automation

**Target:** Auth, user-linked Alpaca accounts, paper trading. Build after Phase 2 is stable.

### 5.1 Auth (Clerk)

| Task | Why | Est. Time | Blocker For |
|------|-----|-----------|-------------|
| Clerk integration (Next.js) | Login, signup, session | 4–6h | — |
| User → Alpaca credentials mapping (DB) | Each user links own account | 4–6h | Alpaca execution |
| Protect dashboard routes | Only logged-in users see their data | 2–4h | — |

### 5.2 Alpaca Integration

| Task | Why | Est. Time | Blocker For |
|------|-----|-----------|-------------|
| Alpaca paper trading API | Execute trade-orders in paper mode | 8–12h | — |
| Store Alpaca API keys per user (encrypted) | Users link accounts | 4–6h | — |
| Order placement from trade-orders | BUY/SELL with limit, stop, size | 6–10h | — |
| Optional: Live trading (separate toggle) | Paper vs live; careful gating | 4–6h | — |

**Note:** Alpaca supports paper trading without real capital. Start with paper only.

### 5.3 Dashboard Enhancements for Multi-User

| Task | Why | Est. Time |
|------|-----|-----------|
| "Link Alpaca Account" flow | User adds API keys via Clerk-protected settings | 4–6h |
| Per-user trade history | Filter by user_id | 2–4h |
| Paper trade execution status | Show filled / pending / rejected | 4–6h |

---

## 6. Phase 4: Future / Backlog

| Item | When | Notes |
|------|------|-------|
| Whale hunter (Barchart + Playwright) | After Phase 2 | Cloudflare bypass; fragile |
| Drifter hunter (FMP earnings) | After Phase 2 | Needs FMP key; 250 calls/day limit |
| Shadow hunter (Tradytics dark pool) | After Phase 2 | Data source research |
| ECS + MSK production deployment | When budget allows | ~$200+/mo |
| WebSocket live feed for trade-orders | After dashboard stable | Real-time updates |

---

## 7. Dependencies

```
Phase 1 (bugs, tests, persistence)
    │
    ├── Fix bugs ────────────────────────────→ Everything
    ├── Insider/Biotech liquidity ───────────→ Confluence works
    ├── Unit tests ──────────────────────────→ CI
    └── Persistence ─────────────────────────→ API, Dashboard, Engine
              │
              ▼
Phase 2 (Engine, API, Dashboard)
    │
    ├── Java engine ─────────────────────────→ trade-orders → Dashboard, Alpaca
    ├── API ─────────────────────────────────→ Dashboard
    └── Dashboard ───────────────────────────→ Phase 3 (auth, Alpaca)
              │
              ▼
Phase 3 (Auth, Alpaca)
    │
    ├── Clerk ───────────────────────────────→ Per-user Alpaca
    └── Alpaca ──────────────────────────────→ Paper trading, execution status
```

**Critical path:** Phase 1 → Persistence → Java Engine → API → Dashboard → Phase 3.

---

## 8. Effort Summary

| Phase | Scope | Est. Hours |
|-------|-------|------------|
| Phase 1 | Bugs, liquidity, tests, CI, persistence | 25–30h |
| Phase 2 | Java engine, API, dashboard | 55–75h |
| Phase 3 | Clerk, Alpaca, multi-user dashboard | 35–50h |
| **Total to "portfolio complete"** | Phase 1 + Phase 2 | **80–105h** |
| **Total to "multi-user + paper trading"** | Phase 1 + 2 + 3 | **115–155h** |

**8-week timeline at ~8h/week:** Phase 1 + most of Phase 2 (engine + API + basic dashboard). Phase 3 fits in a second semester or post-graduation.

---

## 9. Explicitly Deferred

| Item | Reason |
|------|--------|
| Whale / Drifter / Shadow hunters in main.py | Remove or gate; implement only when data sources are viable |
| Terraform / IaC | EC2 + Docker Compose + Lambda is sufficient for student scope |
| 24/7 deployment | Market-hours-only is correct trade-off per DEPLOYMENT.md |
| Live (non-paper) Alpaca trading | Start paper only; add live as explicit Phase 3+ feature |
| Python-only strategy engine | Java chosen for resume; Python fallback exists if scope slips |

---

## 10. Recruiting Angles (Top Items)

| Item | Story |
|------|-------|
| **Multi-source confluence** | "Three independent signal sources converge through a stateful aggregation layer—Squeeze, Insider, Biotech—each with different data sources and schemas." |
| **Java Spring Boot engine** | "Polyglot pipeline: Python for ingestion and AI, Java for strategy and risk. Demonstrates JVM ecosystem, Kafka consumer, Kelly criterion, and regime filtering." |
| **Tests + CI** | "Unit tests on core pipeline, CI running on every PR. Hiring managers check GitHub Actions first." |
| **TimescaleDB persistence** | "Full data lifecycle: ingest → process → store → query. Time-series storage for signals and trade performance." |
| **Dashboard: historic + performance** | "Not just live signals—users see past recommendations and where the trade would have gone. Performance tracking over time." |
| **Alpaca + Clerk (Phase 3)** | "Multi-user auth, per-user Alpaca linking, paper trading. Foundation for a real product, not just a demo." |

---

## 11. Schema Reference

- **raw-events, validated-signals, trade-orders:** `docs/schemas.md`
- **Architecture:** `docs/ARCHITECTURE.md`
- **Deployment:** `docs/DEPLOYMENT.md`

---

## 12. Quick Reference: File Locations

| What | Path |
|------|------|
| Hunter entrypoint | `hunters/main.py` |
| Gatekeeper (Kafka retry bug) | `gatekeeper/gatekeeper.py` |
| AI Layer | `ai_layer/ai_service.py` |
| Docker Compose | `docker-compose.yml` |
| Lambda startup/shutdown | `deploy/lambda_startup.py`, `deploy/lambda_shutdown.py` |
| CI workflow | `.github/workflows/ci.yml` |
| Schemas | `docs/schemas.md` |
