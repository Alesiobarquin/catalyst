# Validation Report (2026-04-21)

This report captures pre-AWS validation progress and blockers from the local machine.

## Environment Checks

- Python virtualenv created at `.venv`.
- Dev dependencies installed from `requirements-dev.txt`.
- Docker daemon was initially unavailable, then started successfully and compose-backed tests were run.

## Test Suite Result

Command:

```bash
.venv/bin/python -m pytest tests/ -v --tb=short
```

Result:

- 47 tests collected and passed.
- 0 failures.
- 1 warning (pandas/pyarrow deprecation warning only).

## Lint/Format Snapshot

Command:

```bash
.venv/bin/python -m ruff check . && .venv/bin/python -m ruff format --check .
```

Result:

- Repo currently has pre-existing Ruff violations in multiple files.
- These findings were not introduced by this validation pass.
- Lint cleanup should be handled as a separate housekeeping task.

## Compose-Backed E2E Status

Command:

```bash
docker compose up -d --build
```

Result:

- Stack started after rebuilding services.
- API initially crash-looped due import shadowing in `api/main.py` and was fixed by aliasing the router import (`settings_router`).
- Health checks succeeded:
  - `GET /health` => `{"status":"ok","service":"catalyst-api"}`
  - Engine actuator => `{"status":"UP", ...}`

## Gatekeeper/Confluence Evidence

- Published deterministic `TEST1` and `TEST2` dual-source events (`squeeze` then `insider`) to `raw-events`.
- Gatekeeper logs showed:
  - `Buffered TEST1 ... confluence=1`
  - `Forwarded TEST1 to triage-priority (confluence=2, ...)`
  - `Buffered TEST2 ... confluence=1`
  - `Forwarded TEST2 to triage-priority (confluence=2, ...)`
- Redis source set proof captured:
  - `SMEMBERS gk:sources:TEST2` => `squeeze`, `insider`

## Negative-Path Evidence

- Injected `JUNK` low-volume event.
- Gatekeeper log confirmed drop:
  - `Dropped JUNK: volume 10000.0 below minimum 50000.0`

## Persistence Evidence

- DB query returned recent `trade_orders` rows:
  - latest observed ticker `HYMC` with strategy/pricing columns populated.

## AI Layer Status (current blocker)

- AI layer consumed from `triage-priority`, but Gemini calls hit transient provider-side capacity errors:
  - `503 UNAVAILABLE ... model is currently experiencing high demand`
- Retries succeeded afterward; see **Follow-up Evidence** below.

## Follow-up Evidence (full stack)

### Deterministic path through AI + engine (real ticker)

Synthetic tickers (`TEST*`) are useful for Gatekeeper/AI, but the Java engine requires a **Yahoo-priced** symbol.

- Injected dual-source events for **`NVDA`** on `raw-events` (`squeeze` then `insider`) to create confluence.
- Gatekeeper forwarded `NVDA` to `triage-priority` (`confluence=2`).
- AI published: `Published validated signal for NVDA with conviction 65`
- Engine produced a trade order and persisted it:
  - Log: `[NVDA] Trade order published to trade-orders...`
  - DB: `trade_orders` row for `NVDA` with `strategy_used=Supernova`

### `validated-signals` snapshot (NVDA)

Captured via `kafka-console-consumer` filtering:

- Includes `ticker=NVDA`, `confluence_sources: ["insider","squeeze"]`, and a `conviction_score` consistent with the AI layer log line for that message (verify exact numeric value against your local topic offset if reproducing).

### Hunter recurrence / interval smoke (accelerated local validation)

To prove the loop is real without waiting hours, hunters were temporarily recreated with short intervals:

- `SQUEEZE_INTERVAL_SECONDS=25`
- `BIOTECH_INTERVAL_SECONDS=35`

Log proof (multiple cycles):

- `squeeze_hunter`: repeated `Next squeeze sweep in 25 seconds`
- `biotech_hunter`: repeated `Next biotech sweep in 35 seconds`

Then hunters were restored to Compose defaults (`900s` / `1800s`).

### Organic multi-source overlap note

In this environment, `raw-events` retained a small number of messages, so **organic** cross-hunter overlap was not observed beyond injected `NVDA` during the short sampling window.

Operational expectation: overlap is **sparse by design**; use longer runs + Kafka retention, or monitor Redis `gk:sources:{TICKER}` during market hours.

## Required Follow-Up (optional hardening)

1. If you want a literal **24h** log at default intervals, rerun the soak with defaults and archive `docker logs` snippets across the day.
2. Add a lightweight “confluence watcher” script if you want automated capture of organic `gk:sources:*` keys with `SCARD>=2`.
