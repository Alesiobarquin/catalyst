# Pre-AWS Readiness Checklist

Purpose: finish product/recruiting work before any AWS provisioning.  
This keeps AWS as an enablement step, not a debugging phase.

## 1) Reliability Gates (must be green)

- [x] Track 1 smoke evidence complete: squeeze + biotech recurrence validated (accelerated-interval multi-cycle soak; defaults restored afterward).
  - Evidence: log excerpts + restore-to-defaults note in [VALIDATION_REPORT_2026-04-21.md](VALIDATION_REPORT_2026-04-21.md). Literal 24h-at-defaults wall-clock logs are optional follow-up.
- [x] Track 2 confluence evidence complete: gatekeeper accepts real payloads and Redis shows multi-source sets (`gk:sources:{TICKER}`).
  - Evidence: no `unknown schema` lines in Gatekeeper logs (spot-checked) + Redis `SMEMBERS` for `NVDA` + forwarded log line in [VALIDATION_REPORT_2026-04-21.md](VALIDATION_REPORT_2026-04-21.md).
- [x] `PRODUCT_PRIORITIES.md` checkboxes updated in the same PR as evidence.

## 2) Testing Evidence Pack

- [x] `docker compose up -d --build` stable with no crash loops.
  - Evidence: compose run notes in [VALIDATION_REPORT_2026-04-21.md](VALIDATION_REPORT_2026-04-21.md).
- [x] API health endpoint returns OK.
- [x] Engine health endpoint returns UP.
- [x] Deterministic path proven end-to-end (`raw-events` -> `validated-signals` -> `trade-orders`) using a **real ticker** (`NVDA`) for engine pricing.
  - Evidence: AI publish + engine publish + DB row in [VALIDATION_REPORT_2026-04-21.md](VALIDATION_REPORT_2026-04-21.md).
- [x] Negative-path JUNK rejection proven with no downstream order.
- [x] DB row evidence captured for recent `trade_orders`.

## 3) Recruiting Narrative Readiness

- [x] README reflects current state (Drifter implemented, frontend/API built, deferred items clear).
- [x] Product priorities document matches deployment strategy and deferral gates.
- [x] Cost and cadence story is consistent with `DEPLOYMENT.md`.

## 4) Environment/Tooling Readiness (local)

- [x] Docker daemon running on local machine.
- [x] Python test dependencies installed (`pytest`, `ruff`).
- [x] Required `.env` keys set for chosen hunters (`GEMINI_API_KEY`, optional `FMP_API_KEY`).

## 5) Evidence Artifacts To Save

- [x] Terminal output snippets for health checks and deterministic test flow.
- [x] Screenshot or copy of Redis set check for at least one confluence ticker.
- [x] Query output for latest `trade_orders` rows.
- [x] Short run summary (date/time window, what passed, what failed, follow-ups).

## Exit Criteria

Only move to AWS when all sections above are complete.  
If any item is unchecked, keep work pre-AWS.
