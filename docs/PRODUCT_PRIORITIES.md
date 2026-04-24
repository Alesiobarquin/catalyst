# Product priorities and next steps

**Purpose:** Canonical ordered backlog for **what to build next** — operational reliability first, then signal volume, then UI. Use this doc when planning sprints, agent tasks, or weekly check-ins. Update checkboxes and the “Last updated” line as work completes.

**Last updated:** April 2026 (pre-AWS evidence narrative aligned with validation report; organic confluence called out as stretch)

**See also:** [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) (older phased estimates and recruiting context), [TESTING.md](TESTING.md) (how to verify the stack), [DEPLOYMENT.md](DEPLOYMENT.md) (AWS / scheduling ideas).

---

## How to use this document

1. Work **tracks in order** (Track 1 → 2 → 3). Do not skip Track 1 if the goal is a system that runs without babysitting.
2. After completing a checkbox, mark it `[x]` in this file in the same PR as the code change.
3. If scope changes, edit the checklist here — this file is the source of truth for **priority order**, not individual tickets elsewhere.

---

## Current reality (be honest)

- The **end-to-end pipeline is proven** in Compose: hunters → Kafka → gatekeeper → AI → engine → DB → API → UI, with evidence in [VALIDATION_REPORT_2026-04-21.md](VALIDATION_REPORT_2026-04-21.md) (including **NVDA** through AI + engine + `trade_orders`; synthetic tickers are fine for gatekeeper/AI but the engine needs **Yahoo-priced** symbols for sizing).
- **Track 1 (recurrence):** squeeze and biotech run continuous loops with configurable intervals. **Accepted local proof** is an **accelerated-interval multi-cycle soak** (multiple “next sweep” log lines), then restore default intervals—documented in the validation report. A **literal 24h wall-clock** run at default intervals is optional hardening (archive `docker logs` if you do it); do not claim it without logs.
- **Track 2 (confluence):** **Gatekeeper confluence ≥ 2** is **proven** with **controlled** `raw-events` injection plus Redis `gk:sources:{TICKER}` (and full-stack **NVDA** in the same report). **Organic** overlap (two distinct live hunters hitting the same ticker inside the rolling window without injection) is **sparse by design** and is a **stretch** validation—longer runs, market hours, and AWS-like retention help; it is not required to call Track 2 “implemented.”
- **Drifter** and **whale** are implemented and wired in Compose; **shadow** was dropped (Tradytics paywall, no viable free data source).

---

## Product end goal (POC scope)

**North star:** A reliable, explainable, low-cost signal pipeline that runs unattended on weekdays during high-value market windows.  
This is a portfolio-first system, not a 24/7 production trading platform.

**Success criteria for this phase:**

- Runs unattended for 2-4 weeks on a scheduled weekday cadence.
- Produces auditable validated signals with source-level confluence evidence.
- Demonstrates practical cost control and explicit trade-off decisions (coverage vs spend).
- Keeps auth/broker execution deferred until reliability gates are met.

---

## Operating cadence (recommended happy medium)

Use this cadence for portfolio operations and demos:

- **Weekdays only**
- **07:00 ET:** pre-market warmup run
- **09:30-11:00 ET:** higher-frequency scans (every 10-15 minutes)
- **11:00-15:00 ET:** lower-frequency scans (every 30-60 minutes)
- **15:00-16:00 ET:** moderate-frequency scans (every 15-30 minutes)

Rationale: captures the highest signal-density windows without pretending to be an always-on production system.

---

## Track 1 — Make the pipeline run every day (highest priority)

**Goal:** Hunters that should scan on an interval actually **repeat** without manual `docker compose restart` or one-off runs.

| Status | Task |
|--------|------|
| [x] | **Squeeze:** Add an outer loop (e.g. `while True` + configurable sleep, e.g. 15–30 min) *or* document + implement an external scheduler (cron, ECS scheduled task, Compose `restart: always` with a wrapper script). |
| [x] | **Biotech:** Same — either wrap `run()` in a loop with sleep between sweeps, or external scheduler. Align sleep with BioPharm rate limits (see hunter comments). |
| [x] | **Compose / ops:** Change `restart` policy and/or add a small scheduler service if you choose not to loop in-process. Document the chosen approach in [TESTING.md](TESTING.md) “day-to-day operations”. |
| [x] | **Smoke test:** Prove squeeze/biotech repeat autonomously. **Preferred:** 24h run at default intervals. **Acceptable for local validation:** documented accelerated-interval multi-cycle soak (shows multiple `Next … sweep` log lines) + restore defaults before sharing publicly. |

**Done when:** A fresh `docker compose up -d` produces repeated squeeze/biotech scans over a day with no manual intervention.

**Implemented (April 2026):** [`hunters/squeeze_hunter.py`](../hunters/squeeze_hunter.py) and [`hunters/biotech_hunter.py`](../hunters/biotech_hunter.py) use `while True` + `SQUEEZE_INTERVAL_SECONDS` / `BIOTECH_INTERVAL_SECONDS` from [`hunters/common/config.py`](../hunters/common/config.py). [`docker-compose.yml`](../docker-compose.yml) passes those env vars and sets `restart: always` for squeeze and biotech.

---

## Track 2 — Increase real signal volume (second hunter / confluence)

**Goal:** Increase **live** signal volume (second hunter) and real-world **confluence opportunities**; **organic** overlap (two distinct hunters, same ticker, no injection) remains **sparse by design** and is a **stretch** metric—Track 2 **implementation** is still judged on Compose + Redis + gatekeeper proof (see **Done when** below).

| Status | Task |
|--------|------|
| [x] | Pick **one** of: **Drifter** (earnings surprise — API-friendly if `FMP_API_KEY` is set), **Whale** (unusual options — scraping/API), or another hunter you will maintain. |
| [x] | Implement `run()`, Kafka publish to **`raw-events`** (and hunter-specific topic if applicable), matching [gatekeeper coercers](../gatekeeper/gatekeeper.py). |
| [x] | Add a **Compose service** for that hunter if it should run in Docker. |
| [x] | Verify gatekeeper accepts payloads (no `unknown schema`), and spot-check Redis `gk:sources:{TICKER}` for two sources when data aligns. |

**Done when:** In Compose, gatekeeper accepts the hunter’s payloads (no `unknown schema`), and you can show **multi-source confluence** for at least one ticker—**including** Redis proof (`gk:sources:{TICKER}` with two distinct hunter sources) and a forwarded `confluence=2` line. Controlled `raw-events` injection for that proof is **in scope**; **organic** multi-hunter overlap without injection is a **stretch** goal for longer runs.

**Implemented (April 2026):** [Drifter hunter](../hunters/drifter_hunter.py) — FMP `earning_calendar` (lookback window), EPS beat vs `epsEstimated` ≥ `DRIFTER_MIN_SURPRISE_PERCENT`, yfinance liquidity, dedupe by `symbol:date`. Compose service `hunter-drifter`; env `FMP_API_KEY` required for live polling (otherwise process sleeps in a loop). Topic: `signal-earnings` + `raw-events`.

---

## Track 3 — UI and product polish (after Tracks 1–2)

**Goal:** Dashboard honesty and scale; not before the pipeline is reliable.

| Status | Task |
|--------|------|
| [x] | **Live badge:** Drive “Pipeline Active” / health from real checks (API `/health`, optional engine actuator), not static copy. |
| [x] | **Price chart:** Surface when history is **synthetic** vs real (avoid silent mock fallback confusing users). |
| [x] | **Pagination:** Wire `page` / `per_page` for `/orders` and `/signals` in the UI. |
| [x] | **Empty states:** Signals table — copy when zero rows; orders list already partially handled. |

---

## Explicitly defer (do not start until Tracks 1–2 are healthy)

| Item | Why defer |
|------|-----------|
| **Alpaca live / paper execution** | Prove signal quality and stability first; execution adds risk and ops burden. |
| **Full observability stack** (Prometheus, Grafana, etc.) | Optional later; a simple alert (webhook / email on new `trade_orders` row) may suffice first. |
| **Auth / multi-user (e.g. Clerk)** | Not needed until the core loop runs daily and reliably. |

**Go/no-go gate for Clerk + Alpaca linking (must all be true):**

- Track 1 smoke-test checkbox is complete with **documented recurrence evidence** (accelerated multi-cycle soak **or** archived literal 24h logs at default intervals).
- Track 2 confluence checkbox is complete with Redis proof (`gk:sources:{TICKER}` for multi-source cases), per [VALIDATION_REPORT_2026-04-21.md](VALIDATION_REPORT_2026-04-21.md).
- Deployment checklist in [DEPLOYMENT.md](DEPLOYMENT.md) is closed for the selected schedule.

**Go/no-go gate for AWS rollout (must all be true):**

- All pre-AWS items in [PRE_AWS_READINESS_CHECKLIST.md](PRE_AWS_READINESS_CHECKLIST.md) are complete.
- Product/recruiting docs are aligned (README + priorities + deployment).
- Activation procedure in [AUGUST_ACTIVATION_CHECKLIST.md](AUGUST_ACTIVATION_CHECKLIST.md) is reviewed and ready.

---

## Quick reference — key files

| Area | Path |
|------|------|
| Compose services | [docker-compose.yml](../docker-compose.yml) |
| Hunter entrypoints | [hunters/main.py](../hunters/main.py) |
| Gatekeeper normalization | [gatekeeper/gatekeeper.py](../gatekeeper/gatekeeper.py) |
| Engine dedup cooldown | [engine/.../ValidatedSignalConsumer.java](../engine/src/main/java/com/catalyst/engine/consumer/ValidatedSignalConsumer.java) |
| Frontend API client | [frontend/src/lib/api.ts](../frontend/src/lib/api.ts) |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-04 | Initial version: Tracks 1–3, defer list, checklists. |
| 2026-04 | Track 1: squeeze/biotech infinite loops + env intervals + Compose `restart: always`. |
| 2026-04 | Track 2: Drifter hunter (FMP earnings calendar) + `hunter-drifter` service. |
| 2026-04 | Track 1/2 smoke + confluence evidence captured in `docs/VALIDATION_REPORT_2026-04-21.md`; pre-AWS checklist closed in `docs/PRE_AWS_READINESS_CHECKLIST.md`. |
| 2026-04 | “Current reality,” Track 2 **Done when**, and Clerk/Alpaca gate wording reconciled with validation evidence (accelerated recurrence soak; controlled injection + Redis + NVDA full stack; organic overlap as optional stretch). |
| 2026-04 | Shadow hunter dropped; frontend refinement + doc/CI/test hardening prioritized before auth/execution work. |
