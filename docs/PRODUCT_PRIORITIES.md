# Product priorities and next steps

**Purpose:** Canonical ordered backlog for **what to build next** — operational reliability first, then signal volume, then UI. Use this doc when planning sprints, agent tasks, or weekly check-ins. Update checkboxes and the “Last updated” line as work completes.

**Last updated:** April 2026

**See also:** [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) (older phased estimates and recruiting context), [TESTING.md](TESTING.md) (how to verify the stack), [DEPLOYMENT.md](DEPLOYMENT.md) (AWS / scheduling ideas).

---

## How to use this document

1. Work **tracks in order** (Track 1 → 2 → 3). Do not skip Track 1 if the goal is a system that runs without babysitting.
2. After completing a checkbox, mark it `[x]` in this file in the same PR as the code change.
3. If scope changes, edit the checklist here — this file is the source of truth for **priority order**, not individual tickets elsewhere.

---

## Current reality (be honest)

- The **end-to-end pipeline works** (hunters → Kafka → gatekeeper → AI → engine → DB → API → UI) when the stack is up and data flows.
- **Squeeze** and **biotech** hunters are effectively **one-shot per process** (clean exit → Docker `restart: on-failure` does not reschedule them). **Insider** is the main long-running hunter.
- **Confluence ≥ 2 sources** is hard to hit organically without repeating squeeze/biotech or adding another continuous source.
- **Whale / shadow / drifter** hunters are stubs or not wired in Compose; gatekeeper schemas exist but producers do not.

---

## Track 1 — Make the pipeline run every day (highest priority)

**Goal:** Hunters that should scan on an interval actually **repeat** without manual `docker compose restart` or one-off runs.

| Status | Task |
|--------|------|
| [x] | **Squeeze:** Add an outer loop (e.g. `while True` + configurable sleep, e.g. 15–30 min) *or* document + implement an external scheduler (cron, ECS scheduled task, Compose `restart: always` with a wrapper script). |
| [x] | **Biotech:** Same — either wrap `run()` in a loop with sleep between sweeps, or external scheduler. Align sleep with BioPharm rate limits (see hunter comments). |
| [x] | **Compose / ops:** Change `restart` policy and/or add a small scheduler service if you choose not to loop in-process. Document the chosen approach in [TESTING.md](TESTING.md) “day-to-day operations”. |
| [ ] | **Smoke test:** After deploy, confirm `docker compose ps` shows squeeze/biotech cycling or scheduled as intended over 24h. |

**Done when:** A fresh `docker compose up -d` produces repeated squeeze/biotech scans over a day with no manual intervention.

**Implemented (April 2026):** [`hunters/squeeze_hunter.py`](../hunters/squeeze_hunter.py) and [`hunters/biotech_hunter.py`](../hunters/biotech_hunter.py) use `while True` + `SQUEEZE_INTERVAL_SECONDS` / `BIOTECH_INTERVAL_SECONDS` from [`hunters/common/config.py`](../hunters/common/config.py). [`docker-compose.yml`](../docker-compose.yml) passes those env vars and sets `restart: always` for squeeze and biotech.

---

## Track 2 — Increase real signal volume (second hunter / confluence)

**Goal:** Raise the odds of **organic** gatekeeper confluence (two distinct `source_hunter` values for the same ticker within the rolling window).

| Status | Task |
|--------|------|
| [x] | Pick **one** of: **Drifter** (earnings surprise — API-friendly if `FMP_API_KEY` is set), **Whale** (unusual options — scraping/API), or another hunter you will maintain. |
| [x] | Implement `run()`, Kafka publish to **`raw-events`** (and hunter-specific topic if applicable), matching [gatekeeper coercers](../gatekeeper/gatekeeper.py). |
| [x] | Add a **Compose service** for that hunter if it should run in Docker. |
| [ ] | Verify gatekeeper accepts payloads (no `unknown schema`), and spot-check Redis `gk:sources:{TICKER}` for two sources when data aligns. |

**Done when:** Production-like Compose runs show occasional confluence without synthetic Kafka injections.

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
