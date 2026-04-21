# Bookmark: Clerk + Alpaca (finish when you have a focused slot)

**Status:** Code is in the repo (auth middleware, Settings UI, executor service, API routes, DB migrations). **Operational wiring is on you** — Clerk project, env vars, and Alpaca paper keys.

**Why local Timescale is OK:** Clerk never talks to Postgres for login. Your API verifies JWTs against Clerk’s JWKS; Timescale only stores `user_alpaca_keys` and `trade_order_executions`. Same pattern in prod — swap the DB URL for RDS or similar.

---

## When you’re ready — checklist

### 1. Clerk (dashboard)

1. Create / open app at [dashboard.clerk.com](https://dashboard.clerk.com).
2. Add **JWT template** / note **Frontend API** URL (issuer).
3. JWKS URL is usually: `{Frontend API origin}/.well-known/jwks.json` (also shown under **API Keys** / **Advanced** depending on Clerk version).
4. Copy **Publishable key** and **Secret key** into `.env` (see `.env.example`).

**Env (API — FastAPI):**

- `CLERK_ISSUER` — must match the `iss` claim on session tokens (often `https://<subdomain>.clerk.accounts.dev`).
- `CLERK_JWKS_URL` — full URL to JWKS document.

**Env (frontend — Next.js):**

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

Restart `api` and `frontend` after setting these.

### 2. Alpaca paper

1. Open [Alpaca paper dashboard](https://app.alpaca.markets/paper/dashboard/overview) and create **paper** API keys.
2. In the app: sign in with Clerk → **Settings** → paste keys (stored in `user_alpaca_keys` in Timescale).
3. Run **`executor`** (see `docker-compose.yml` service `catalyst_executor`) so `trade-orders` from the engine become paper orders.

### 3. Smoke test

- Sign in → Settings saves without 503 from API (means JWKS + issuer match).
- Place a pipeline trade → executor logs Alpaca response; `GET /executions/me` (with Bearer token) shows rows.

---

## Files to skim before a walkthrough

| Area | Path |
|------|------|
| Clerk middleware | `frontend/src/middleware.ts` |
| Settings page | `frontend/src/app/settings/page.tsx` |
| API JWT verify | `api/auth.py` |
| Keys + executions API | `api/routers/settings.py`, `api/routers/execution.py` |
| Executor | `executor/consumer.py` |
| Schema | `engine/.../migration/V3__user_id_alpaca_executions.sql` |

---

## Optional: run stack without Clerk (dev only)

If keys are unset, the frontend build may still need placeholder env vars; runtime will redirect to sign-in. For **API-only** testing of orders/signals, run FastAPI without `CLERK_*` — `/settings` and `/executions/me` return 503 until Clerk is configured.
