# Catalyst: Agent Operating Manual & Repository Knowledge Base

> **CRITICAL DIRECTIVE FOR ALL AI AGENTS:**
> This document is the living single source of truth for the Catalyst project architecture, subsystems, workflows, and developer conventions.
> **Whenever you discover new insights, modify or add subsystems/endpoints, update schemas, introduce environment variables, or create new skills/tools, YOU MUST UPDATE THIS DOCUMENT IMMEDIATELY.**
> Never leave undocumented findings or obsolete architecture descriptions behind.

---

## 1. Project Overview & North Star

**Catalyst** is an event-driven market signal discovery and algorithmic recommendation pipeline. Five Python hunters aggregate financial feeds; Redis filters for confluence; Gemini validates catalysts with Google Search; Java 21 sizes recommendations using Half-Kelly and SPY/VIX regime data; TimescaleDB stores results for FastAPI and a Next.js dashboard.

### Current public deployment (October 12, 2026)

- **Public site:** https://d36bndaw2y0rrh.cloudfront.net — read-only Next.js static export, private S3 with CloudFront OAC/HTTPS. Terminal redesign release `bd8dd06` was published October 12; main CI, CodeQL, and AWS publication passed. CI recorded 346 Python + 36 Java + 191 frontend tests = 573. Live verification returned HTTP 200, loaded all 10 JavaScript and two CSS assets, and found all 19 market symbols in the served bundle. The release preserved manifest `20261012T140216Z` (October 12, 10:02 ET): **53 raw events, all five hunters completed**, zero triage/validated events or recommendations. Sources: 20 SEC Insider, 8 Barchart Whale and 25 free pdufa.bio Biotech; Yahoo Squeeze and FMP completed with zero qualifying events. The snapshot includes four benchmark quotes. See [release verification](docs/verification/2026-10-12-trading-terminal-release.json), [CI](https://github.com/Alesiobarquin/catalyst/actions/runs/38299553462), [CodeQL](https://github.com/Alesiobarquin/catalyst/actions/runs/38299552993), and [AWS publication](https://github.com/Alesiobarquin/catalyst/actions/runs/38299553359). The October 11 manual EC2 verification separately confirmed private backup, finite-job/bootstrap logs, staged runtime, and automatic shutdown; see [source repairs](docs/verification/2026-10-11-ec2-daily-repair.json), [startup verification](docs/verification/2026-10-11-ec2-startup-followup.json), and [free-source acceptance](docs/verification/2026-10-11-free-biotech-source.json).
- **Daily worker:** `CatalystPublicDemoStack`, EC2 `i-0597d111f82782b5d`, `m6a.large`, encrypted 40 GiB gp3, SSM management and no ingress. Both schedules are `ENABLED`: 10:00 America/New_York weekday start and independent 11:30 hard stop. October 5–9 scheduled starts and worker stops were observed. Normal completion stops the instance; boot watchdog is 80 minutes. The October 11 manual verification stopped automatically at `2026-10-12T03:44:39Z`; CloudTrail confirms the worker role issued the stop and the instance is stopped. The October 12 scheduled run used the published free-source release; the next weekday scan is October 13 at 10:00 ET. CDK defaults select the public stack and enabled cadence; explicitly override `enableDailyScan=false` to pause and `publicDemo=false` for the legacy stack.
- **Budget:** at most $10/month target, excluding domain/tax, with explicit runtime, AI, image/log retention controls. The $10 account-wide AWS Budget is console-visible and has no email subscription; it is not a hard billing cap. See [operations and cost model](docs/PUBLIC_DEMO_OPERATIONS.md).
- **Provenance:** public strict confluence requires two distinct sources; grounded Gemini 3.8 Flash only, threshold 50, heuristic fallback disabled. Local fallback remains available and is explicitly tagged. PnL is modeled from sampled recommendation prices, not brokerage profit. Public executor/notifier are disabled.
- **Résumé evidence:** the actual Kafka listener task executor uses Java virtual threads (verified by a JVM test), Half-Kelly defaults are a $100k book/25% allocation cap, and VIX >=40 halts sizing. No measured live 50–100 events/min artifact has been established; do not conflate daily scan counts with processing capacity.
- **Accounts:** updated Gemini key passed a real Search-grounded 3.8 Flash request. Google 2.5 Flash rejects new-user inference. AWS Free plan was upgraded via CLI to PAID/ACTIVE because it expired October 21; approximately $75.33 credits were preserved.
- **Legacy:** `i-0194d6c0b8f0e191a` stopped with its 8 GiB root retained. Disk was full and no containers ran. Private repository backup: `backups/legacy-repository-20261004.tgz` in the artifact bucket. Temporary inspection IAM role/profile and SSH allowance were removed; legacy EventBridge schedules remain disabled.

### Public implementation details

Cold-start migration history: Python-created `validated_signals` initially caused Flyway baseline version 1 to skip V1, failing V2 with missing `trade_orders`. Java and public Compose explicitly use baseline 0; the empty failed trade schema was repaired under a `trade_orders`-absent guard via SSM. The temporary service override was removed, restoring automatic shutdown. Historical deployment/theme evidence remains in `docs/verification/`.

**October 11 daily-run investigation:** Live AWS readback and CloudTrail show successful 10:00 ET starts on October 5–9 and worker-initiated stops around 10:04 ET; both weekday schedules remain enabled. The current worker being stopped on Sunday is expected. At the start of this investigation, the latest dataset was `20261009T140408Z`, release `46b72a5`, with a fresh SPY/VIX regime, ten Insider raw events, no triage/validated events, and partial status from Squeeze `RuntimeError` and Whale `TimeoutError`. The October 7–9 private service logs show successful API export and schema startup. Before repair, finite hunter containers used `run --rm`, so their detailed output was absent from archived Compose logs and only exception classes reached public reports. The current repair targets production source acquisition and diagnostic coverage, not local startup or a scheduler failure. See [daily-run repair plan](docs/DAILY_RUN_REPAIR_PLAN.md).

Live SSM probes on the EC2 worker confirmed Finviz HTTP 403 with a Cloudflare verification page, and Barchart's rendered `.bc-datatable` uses a div grid with `role=grid`, `role=row` and `role=columnheader`, so waiting for `table tbody tr` cannot find its options data. BioPharmCatalyst's current PDUFA table has `Ticker`, `Name`, `Price`, `Drug`, and `PDUFA Date` rather than the assumed positional Stage/Catalyst fields; some drug/date cells require signup. The released source repairs parse named fields and expose fixed provider/status/stage errors without URLs or response bodies. The batch repair retains baseline, hunter and exporter output in private logs even after `--rm`, with restrictive file permissions. These changes are published in immutable release `7e5b4de` and verified in a full EC2 batch.

The EC2 Yahoo Finance screener probe returned 155 US candidates matching the price/volume/short-interest query. A separate quote/info probe verified NVAX's actual 28.1% short float, 8.08 days to cover and volume/three-month average ratio above 2; these are source-availability checks, not validated recommendations. The optional `SQUEEZE_PROVIDER=yahoo` collector keeps the original $2–$60, 200k volume, RVOL >=2, short float >=25% and days-to-cover >=3 filters, checks at most the first 40 screener matches, and uses a 55-second isolated process deadline with bounded requests. Source market timestamps and the delayed short-interest reporting date are retained. `finviz` remains the local default; public configuration defaults to Yahoo when no source has previously been selected. Reports expose source attribution, and the public report displays readable provider labels. Barchart grid values are stored in rendered `text-binding` shadow roots, while ordinary `inner_text()` is empty; cells use `role=cell`, and expiry must be read separately from days to expiry.

The repaired source-only EC2 check at `2026-10-12T01:42Z` returned three Yahoo Squeeze candidates in 2.87 seconds and eight Barchart option contracts in 39.15 seconds with correct strike, volume and expiration; BioPharmCatalyst explicitly reported its gated account-access requirement; the original message called it a subscription, but pricing was not verified. These checks made no Kafka writes, AI requests or brokerage calls. The Yahoo quote timestamps were October 9 and short-interest reporting dates September 30; collection time does not make those fields live. Barchart parses the bounded rendered contract rows rather than promising an exhaustive options feed. Public encrypted runtime version 4 selects Yahoo and preserves all other values. Source changes were committed as `e93ac3a` plus formatting `7e5b4de`; the immutable release passed CI, CodeQL and AWS publication on October 11 ET (October 12 UTC). Full EC2 batch verification passed: 31 raw events, four completed hunters, fresh regime, export/backup/log retention and automatic shutdown. At that stage, BioPharmCatalyst account access was the remaining restriction; Phase 58 resolved it with the free pdufa.bio feed. Final wording correction `7bbe2a8` passed CI, CodeQL and AWS publication at 02:05:45 UTC; its full EC2 verification also passed, publishing `20261012T021037Z` with the same 31 raw events and four completed hunters, followed by automatic shutdown at 02:11:18 UTC. No unverified payment claim is made. See [source verification](docs/verification/2026-10-11-ec2-daily-repair.json).

**Follow-up filtering audit:** The retained private log accounts for all 31 events in `20261012T021037Z`: 22 buffered events (three Squeeze and 19 Insider) each had one source; nine were dropped (one Insider price below $2 and eight Whale RVOL values below 1.5). The 18 unique tickers had no overlap between hunters even before filtering. Repeated transactions from one hunter do not satisfy the two-source rule. All arrived within 12 seconds, so the five-minute window did not expire. No schema, processing, commit or forwarding errors were observed. The 20 Insider events include seven purchases and 13 sales; this collector accepts both Form 4 codes P and S. Zero triage was therefore expected for this run.

**Follow-up startup reliability work:** The previous boot wrapper did not publish status or retain private diagnostics until it entered `deploy/batch.sh`. Its release-download retry could accept a previous on-disk pointer after every fresh fetch failed, and archive extraction overlaid the previous release. These were confirmed code paths, with no corresponding failure observed in the repaired batches. The canonical `deploy/run-worker.sh` publishes bootstrap running/failed status with a fixed stage, archives private `logs/bootstrap-*` diagnostics, requires a successful fresh-pointer fetch and stages clean release files. Reports/exports use durable `/opt/catalyst/` directories; Docker named volumes keep the same Compose project. CDK embeds the canonical wrapper in first-boot user data; each batch installs its release's wrapper for the next boot. Release `559cc8a` passed CI/CodeQL/publication; migration run `20261012T025646Z` installed the matching launcher, then a second boot through it published `20261012T030040Z`. SSM verified clean-runtime symlinks, 0600 environment/0700 secret-directory modes, and the matching launcher hash. S3 retained the bootstrap running-stage status and encrypted private log. Both runs published 31 raw events with four completed hunters and stopped themselves; the latest retained logs again account for 22 buffered/9 dropped events. See [follow-up evidence](docs/verification/2026-10-11-ec2-startup-followup.json).

**Optional BioPharmCatalyst session support:** `BIOPHARM_STORAGE_STATE_FILE` selects an explicit provider-only Playwright state for Biotech; the other browser hunter receives no account state. State is limited to 64 KiB and provider domains/origins, with fixed sanitized failures. `scripts/capture_biopharm_session.py` opens a fresh browser for user-owned login and saves a private state only after readable Drug/PDUFA Date cells are observed. `scripts/public_demo.py biopharm-session --session-file PATH` uploads validated state to the private encrypted artifact key `secrets/biopharm-storage-state.json` and sets only `BIOPHARM_STORAGE_STATE_KEY` in existing encrypted SSM runtime; key rotation preserves this selector. The wrapper materializes a 0600 file under `/opt/catalyst/secrets`, mounted read-only only in hunters at `/run/secrets`; a failed optional download removes stale state and lets Biotech report a session failure while other hunters run. `clear-biopharm-session` disables the selector and deletes the current private object; old object versions follow seven-day retention. State files are excluded from Git/Docker contexts. No authenticated session is configured or verified. The user requested a free public source instead of account/subscription dependency; public Biotech now uses pdufa.bio, and legacy account setup is not required or requested. Official login is `/account/login`; `/sign-up` offers “Create a free account” under “Just exploring?”. Free access is limited and does not establish entitlement to every catalyst field.

**Free Biotech replacement:** The user excluded account/subscription dependency. pdufa.bio's documented core JSON API is anonymous and free; Pro export/ICS endpoints are unused. EC2 SSM probe `9f5b690c-ffe6-4192-8b3b-2f671bdf98b3` returned HTTP 200/anonymous tier and 36 records. The released collector probe `9c19f128-a39c-4a20-a2c1-b5eed6dca344` accepted 25 exact-day upcoming source-linked PDUFA events in 0.20 seconds, without Kafka, AI or brokerage writes. `BIOTECH_PROVIDER=pdufa` is the default and encrypted SSM runtime version 5 preserves all other settings. One request is bounded to 25 seconds/512 KiB/40 rows/90 days; estimates, resolved events, unsourced goals and registry completion dates are excluded. Current dates are used instead of dates encoded in stable IDs; source links, date history and provider timestamps are retained. Public attribution links to pdufa.bio. Release `0073de8` passed CI/CodeQL/publication; its full EC2 batch completed all five hunters with 56 raw events, backup/log retention and automatic shutdown. Final Gatekeeper logs account for all 56: 22 buffered at one source and 34 dropped (33 RVOL, one price), no schema/processing errors. The account-access blocker is resolved by this free source. Live attribution assets were checked over HTTPS; visual browser verification was unavailable because CUA had no connected browser. See [free-source evidence](docs/verification/2026-10-11-free-biotech-source.json) and [provider documentation](https://www.pdufa.bio/developers).

`hunters.main --once --report` starts five bounded sweeps concurrently and records sanitized provider failures, elapsed times, and Kafka delivery counts. Strict delivery raises on broker errors; provider scrape errors propagate in the public profile. Blocking liquidity calls run in threads; Finviz traversal is capped at ten pages. FMP uses the stable earnings-calendar endpoint (`epsActual`/`revenueActual` with legacy aliases).

`deploy/compose.batch.yml` declares 12 services: nine processing services, resolver, finite hunter job, and exporter job. Jobs have different lifetimes. Shared Python, browser-hunter, and Java images are immutable ECR commit tags built natively on GitHub. `deploy/constraints.txt` pins release Python/tool versions; frontend uses Node 22, matching type definitions, and Next.js/eslint-config-next 16.3.8. A local-time-dependent NavClock fixture was replaced with UTC instants after Linux CI exposed it; the public clock is labeled New York rather than data freshness.

`deploy/batch.sh` captures pre-sweep Kafka offsets, waits for consumer groups to drain, verifies both hypertables, exports bounded FastAPI responses, uploads immutable JSON and a private database backup, then atomically promotes `/data/manifest.json`. Public snapshots contain at most 200 orders/signals, 12 chart tickers and 30 details, reject secrets and execution data, and disclose per-run counts/source failures. Missing regime data marks a run partial. Failed publication preserves the previous dataset. `/data/status.json` independently records running/failed/completed/partial attempts; the public banner reports newer failed/in-progress attempts without replacing successful results. Price history exports supply the required `from` query and are bounded to 90 days. Worker cleanup removes obsolete ECR image tags from disk while retaining the active release IDs. Private logs have 14-day retention; backup noncurrent versions have seven days. Export counters subtract baseline offsets instead of reporting lifetime offsets.

`NEXT_PUBLIC_DEMO_MODE=snapshot`, `frontend/src/lib/snapshot.ts` and the independent route tree `frontend/public-site/` preserve local API-backed pages while exporting `/`, `/signals`, `/analytics`, `/architecture` publicly. Shared helpers read validated same-origin snapshots; filters, pagination, details, charts, CSV and Kelly simulation remain browser-side. Settings/SSE/API health and trading controls are excluded from public navigation. Collection timestamps are explicit; missing chart history is unavailable rather than synthetic.

AI controls: `AI_ALLOW_HEURISTIC_FALLBACK=false`, `AI_REQUIRE_GROUNDING=true`, `AI_DAILY_REQUEST_LIMIT=2`, persistent `AI_BUDGET_FILE`, `GEMINI_MODEL=gemini-3.8-flash`, `GEMINI_THINKING_LEVEL=low`, `GEMINI_MAX_OUTPUT_TOKENS=2048`, no model fallback, two-attempt limit. A private full-prompt preflight encountered transient Google HTTP 503 responses, then returned valid JSON with conviction 10 and no grounding for an empty triage payload; grounding enforcement correctly rejected it. This was not a validated organic signal. The key separately passed a real Search-grounded request. The public retry limit is now two attempts, still sharing the two-request daily cap. All attempts reserve the persistent UTC-day budget before network access; prompt length is 24,000 characters. `analysis_method`/`analysis_model` are persisted and exposed through the signals API. The counter assumes one AI consumer. `GATEKEEPER_REQUIRE_CONFLUENCE=true` disables the technical single-source exception.

`infra/public_demo_stack.py` is selected by `-c publicDemo=true`, separate from legacy `CatalystStack`; `-c enableDailyScan=true` activates both timezone schedules. The stack owns S3/CloudFront, worker, IAM/SSM, ECR, GitHub main-branch OIDC and budget. `infra/worker_bootstrap.sh` installs the boot/systemd job; runtime keys are an encrypted SSM SecureString `/catalyst/public-demo/runtime`. `scripts/public_demo.py configure` securely rotates local `.env` keys, preserves the database password, and sets GitHub variables. Release CI publishes only verified images/archives and does not replace the data manifest on ordinary releases; documentation-only changes do not rebuild images. Existing EC2 instances do not automatically rerun changed first-boot user data.

Cloud verification exposed a double-encoded `%5EVIX` URL returning 404 while SPY succeeded. MarketDataService now passes an already-encoded URI to RestClient; an HTTP mock regression test verifies VIX retrieval, 200-session SMA, and a fresh snapshot.

Final CI exposed an intermittent Next.js 16.3.8 Turbopack Google Fonts loader error (`next/font/google queries have exactly one entry`) in the static build. Inter and JetBrains Mono are now bundled as unmodified variable TTF files under `frontend/src/app/fonts/`, with their SIL OFL 1.1 licenses, pinned official Google Fonts source revisions, and SHA-256 hashes. Both layouts share `next/font/local`; builds no longer download Google Fonts. Validate both the ordinary build and public static build after changes to their shared layout.

Java `GET /market-state` is private and reports actual regime acquisition/freshness. Yahoo calls have connect/read deadlines. Initial regime values are zero; sizing halts on missing/stale data or insufficient 200-session SMA, with no latest-price substitution. Persistence's standalone primary key includes time to satisfy hypertable constraints. Docker build contexts exclude local secrets and data.

---

## 2. System Architecture & Event Topology

```mermaid
graph TD
    subgraph Layer 1: Ingestion
        H1[Squeeze Hunter] -->|Yahoo screener or Finviz| RE[Kafka: raw-events]
        H2[Biotech Hunter] -->|pdufa.bio core calendar| RE
        H3[Insider Hunter] -->|SEC EDGAR Form 4| RE
        H4[Whale Hunter] -->|Barchart Options| RE
        H5[Drifter Hunter] -->|FMP Earnings| RE
    end

    subgraph Layer 2: Confluence & Filtering
        RE --> GK[Gatekeeper Service]
        GK <-->|Rolling 5m Window| RD[(Redis: gk:sources_zset / gk:signals)]
        GK -->|Confluence >= 2 or Tech Score >= 70| TP[Kafka: triage-priority]
    end

    subgraph Layer 3: AI Validation
        TP --> AI[AI Layer: Gemini]
        AI <-->|Grounding| GS[Google Search API]
        AI -->|Conviction >= 50| VS[Kafka: validated-signals]
    end

    subgraph Layer 4: Execution & Persistence
        VS --> PS[Persistence Service]
        PS --> DB[(TimescaleDB: validated_signals)]
        VS --> ENG[Strategy Engine: Java 21]
        ENG <-->|Regime / Pricing| YF[Yahoo Finance]
        ENG --> TO[Kafka: trade-orders]
        ENG --> DB2[(TimescaleDB: trade_orders)]
        TO --> EXEC[Alpaca Executor]
    end

    subgraph Layer 5: Presentation
        DB --> API[FastAPI Read Layer]
        API --> UI[Next.js 16 Dashboard]
        API -->|SSE Stream /signals/stream| UI
    end
```

### Kafka Topics Reference

| Topic Name | Purpose | Producers | Consumers | Payload Schema |
|---|---|---|---|---|
| `raw-events` | Central hub for all raw scraped market events | Hunters (`squeeze`, `biotech`, `insider`, `whale`, `drifter`) | `gatekeeper` | Raw hunter-specific JSON with `ticker`, `price`, `volume` |
| `signal-squeeze` | Hunter-specific archive for squeeze signals | Squeeze Hunter | Diagnostics / UI | Normalized squeeze event |
| `signal-biotech` | Hunter-specific archive for clinical catalyst signals | Biotech Hunter | Diagnostics / UI | Normalized biotech event |
| `signal-insider` | Hunter-specific archive for Form 4 filings | Insider Hunter | Diagnostics / UI | Form 4 transaction event |
| `signal-whale` | Hunter-specific archive for unusual options activity | Whale Hunter | Diagnostics / UI | Contract type, strike, option volume and expiration |
| `signal-earnings` | Hunter-specific archive for earnings beats | Drifter Hunter | Diagnostics / UI | Earnings surprise metrics |
| `triage-priority` | Coalesced events that passed confluence/technical checks | Gatekeeper | AI Layer | Triage payload with accumulated signals & liquidity |
| `validated-signals` | Analysis outputs with conviction score $\ge 50$; includes tagged heuristic fallback locally; public profile requires grounding | AI Layer | Persistence, Strategy Engine, Notifier | Structured analysis JSON (catalyst type, entry, stop, risks) |
| `trade-orders` | Quantitative orders sized via Half-Kelly and regime | Java Engine | Executor (Alpaca) | Trade order with position size, Kelly fraction, regime |
| `trade-resolutions` | Resolved recommendation events | Trade Resolver | Available for downstream analytics; no consumer wired in the current notifier | Resolution status, reference price, modeled PnL |

### Redis Key & Cache Schema

| Key Pattern | Data Type | TTL | Purpose |
|---|---|---|---|
| `gk:sources_zset:{TICKER}` | Sorted Set | 300s (5 min) | Per-hunter Gatekeeper receipt timestamps for the sliding window; expired scores are pruned before counting distinct hunter sources. These are not original quote, filing or reporting dates. |
| `gk:sources:{TICKER}` | Set | 300s (5 min) | Compatibility copy and fallback when the sorted set is unavailable or empty; its TTL is refreshed by arriving events. |
| `gk:signals:{TICKER}` | List | 300s (5 min) | Raw JSON signal payloads collected for this ticker during the window. |
| `gk:sent:{TICKER}` | String | 300s (5 min) | Timestamp of when ticker was forwarded to `triage-priority`. Prevents duplicate forwarding. |
| `gk:baseline_vol:{TICKER}` | String / Hash | 7 Days | 20-day historical volume baseline used for relative volume calculation when upstream hunter lacks RVOL. |

---

## 3. Subsystems Deep Dive

### 3.1 Hunters (`hunters/`)
Independent agents that scan disparate financial data sources and publish to Kafka:
- **Squeeze Hunter (`hunters/squeeze_hunter.py`)**: Uses the bounded Yahoo screen publicly, or optional Finviz locally, for high short interest (>=25%), high relative volume (>=2.0x), price ($2–$60), volume (>=200k), and days to cover (>=3.0). Emits to `signal-squeeze` and `raw-events` with source attribution.
- **Biotech Hunter (`hunters/biotech_hunter.py`)**: Defaults to the anonymous pdufa.bio core API for source-linked exact-day upcoming PDUFA events in a bounded 90-day/40-row window. It does not infer trial readout dates from registry completion estimates. Optional `BIOTECH_PROVIDER=biopharm` retains the legacy calendar parser/account-access reporting; the public free branch opens no browser and loads no account state. Enrichment caches liquidity per ticker.
- **Insider Hunter (`hunters/insider_hunter.py`)**: Parses SEC EDGAR Form 4 XML filings for purchases and sales (`transaction_code` P or S), retaining `is_buy` and `is_sell` direction. Requires custom SEC User-Agent header.
- **Whale Hunter (`hunters/whale_hunter.py`)**: Uses Playwright to parse Barchart unusual options activity from rendered grid cells and text-binding shadow roots, retaining contract type, strike, volume and expiration. It reads bounded rendered rows; this is contract activity, without identification of institutions or transaction-level sweeps.
- **Drifter Hunter (`hunters/drifter_hunter.py`)**: Queries FMP earnings calendar API for post-earnings announcements with EPS surprise $\ge 5.0\%$. Caches seen earnings in an in-memory set to prevent duplicate emissions.
- **CLI Orchestrator (`hunters/main.py`)**: Runs hunters on-demand, in parallel, or sequentially with `--timeout` protection:
  ```bash
  python -m hunters.main all --timeout 30
  ```

### 3.2 Gatekeeper (`gatekeeper/`)
The noise filter protecting the AI Layer from costly API query floods:
- **Normalization**: Robust ticker normalization strips dollar signs (`$TSLA` $\to$ `TSLA`), uppercase conversion, strips exchange prefixes (`NASDAQ:AAPL` $\to$ `AAPL`), strips newlines, and drops Canadian/foreign suffixes (`BIIB.TO` $\to$ `BIIB`).
- **Confluence Rule**: Requires $\ge 2$ distinct hunter sources from `gk:sources_zset:{TICKER}` within the rolling 5-minute window OR a single signal with technical score $\ge 70$. A compatibility set fallback is retained. `GATEKEEPER_REQUIRE_CONFLUENCE=true` disables the technical exception for the public worker.
- **Hard Filters**: Dropped if volume $< 50,000$, RVOL $< 1.5\times$, or price outside $\$2.00$–$\$500.00$.
- **Deduplication**: `SET NX EX` reserves `gk:sent:{TICKER}` atomically for 300 seconds; downstream dispatch failure clears the reservation.

### 3.3 AI Layer (`ai_layer/`)
Synthesizes market signals into structured investment theses using Gemini (public model 3.8 Flash):
- **SDK**: Uses `google-genai` SDK (`from google import genai`).
- **Search Grounding**: Injects Google Search tool (`types.Tool(google_search=types.GoogleSearch())`) to ground conviction in real-time SEC filings and breaking news.
- **Model Aliases & Fallbacks**: Maps model names with fallback resilience (`GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`, e.g., falling back to `gemini-2.5-flash` or `gemini-2.5-pro`).
- **Resilient JSON Parser**: Extracts structured JSON even when wrapped in markdown code fences (````json ... ````) or conversational prefix/suffix prose.
- **Threshold**: Drops signals with `conviction_score < 50`.
- **Heuristic fallback**: `process_event()` synthesizes a deterministic score of 75/82/88 after Gemini analysis failure. That output is tagged `analysis_method=heuristic`; public mode disables it with `AI_ALLOW_HEURISTIC_FALLBACK=false`.

### 3.4 Strategy Engine (`engine/`)
Java 21 Spring Boot 3.4 microservice that handles quantitative risk and sizing:
- **Market Regime**: Uses SPY versus its 200-day SMA and VIX to classify `PASS`, `PASS_BEARISH`, `SCALPER_ONLY` (default VIX $\ge 30$), or `HALT` (default VIX $\ge 40$). MarketDataService starts with unavailable zero values; RegimeFilter halts until a valid snapshot exists and also halts when it is older than 15 minutes.
- **Half-Kelly Sizing**: Uses conviction/100 as a probability proxy and reward/risk from strategy prices. Defaults are a $100,000 book and a 25% per-order capital allocation cap; `PASS_BEARISH` halves the allocation. This is not an implemented 2% loss-risk cap or an aggregate per-ticker exposure limit.
- **Virtual threads**: Spring Boot's virtual-thread property is enabled. The custom Kafka listener factory uses concurrency 1 with an explicit virtual-thread SimpleAsyncTaskExecutor. A JVM test verifies the configured executor launches a virtual thread, and callbacks log their runtime thread type.
- **Live Price Fetching**: Fetches live quotes from Yahoo Finance. **CRITICAL:** Synthetic tickers (e.g., `TEST1`) cannot be sized and will be skipped; always use real tickers (e.g., `NVDA`) for end-to-end engine sizing tests.
- **Persistence**: Writes generated orders directly into the TimescaleDB `trade_orders` table.

### 3.5 Persistence Service (`persistence/`)
Python background consumer:
- Consumes `validated-signals` and persists records into TimescaleDB `validated_signals` table.
- Indexed on `catalyst_type` and `ticker`.
- Sanitizes incoming payload values and commits Kafka offsets even when skipping malformed payloads to avoid infinite consumer retry loops.

### 3.6 Executor (`executor/`)
Autonomous paper execution bridge:
- Consumes `trade-orders` and submits day limit orders for users with credentials in `user_alpaca_keys`. Frontend Clerk and credential setup remain operationally deferred.
- Rate-limiting protection: Handles HTTP 429 with exponential backoff.
- Circuit breaker: Halts automatic execution after consecutive failed orders.
- Order safety cap: Enforces maximum order notional (default $100,000). No maximum-open-position check is implemented in the current consumer. Public daily demo deployment excludes the executor.

### 3.7 FastAPI Read Layer (`api/`)
Exposes read-optimized endpoints and streaming for the frontend:
- **SSE Stream**: `GET /signals/stream` — Real-time Server-Sent Events broadcasting new validated signals to connected browser clients with keepalive pings.
- **Signals**: `GET /signals` (with `catalyst_type`, `min_conviction`, `is_trap`, `ticker`, and `date_range`), `GET /signals/{id}`, `GET /signals/stats` (KPI aggregations), `GET /signals/export/csv`.
- **Orders & Executions**: `GET /orders` (with lateral join to Alpaca paper executions), `GET /orders/export/csv`, `GET /executions`.
- **Market**: `GET /market/search?q={query}` (auto-complete), `GET /market/quote/{ticker}`, `GET /market/history/{ticker}`, `GET /market/overview`.
- **Health & Telemetry**: `GET /health` (API & DB pool), `GET /health/pipeline` (Aggregate status: API + TimescaleDB + Redis + Java Engine), `GET /metrics` (Prometheus gauge metrics for API uptime, DB pool connections, and Redis status `catalyst_redis_up`).
- **Testing & Diagnostics**: `POST /testing/inject` (Developer synthetic catalyst signal injection into `raw-events`).
- **Settings**: `POST /settings/alpaca/validate` (credential pre-flight testing).
- **Security Middleware**: Enforces `nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection`, and `Referrer-Policy`.

### 3.8 Frontend Dashboard (`frontend/`)
Public static deployment excludes `/settings`; local pages below retain API-backed operation.

**UI Theme & Visual Refresh (October 5, 2026):** Implemented [UI_THEME_IMPLEMENTATION_PLAN.md](docs/UI_THEME_IMPLEMENTATION_PLAN.md) delivering light-first default, persistent accessible theme toggle, neutral typographic branding, semantic color token architecture, and in-place chart canvas theming. Phase 54 added a concise public scan status, factual metric labels and stop/target denominators, a reusable responsive signal table with mobile field labels, clearer charts and empty states, removed repeated trade-card tags and unsupported source claims, 44px filter controls, compact mobile filter summaries with an active count and clear action, prioritized the unfiltered empty state, and moved market benchmarks below recommendations so mobile readers reach results sooner. Reviewed against an editorial research-dashboard direction: neutral surfaces, a restrained blue interaction accent, outcome colors for performance, legible hierarchy, and compact freshness.
- **Follow-up design refinement (deployed October 5 as `46b72a5`):** Public views now lead with their title and purpose, followed by `SnapshotStatus` collection metadata and a visibly expandable hunter-sweep report. `EmptyResults` provides report/navigation actions; empty analytics omits redundant KPI/chart cards but retains the calculator. Benchmark cards separate price/change from labeled day-low/high fields. Public signal quotes identify their collection time and suppress live-refresh controls; KPI statuses say "at scan." The Half-Kelly calculator is explicitly illustrative, exposes probability as an assumption, preserves its existing math, and discloses that Java portfolio/regime caps are additional. Architecture copy uses a bounded reading width and consistent blue pipeline icons; unsupported fixed growth/drawdown claims were removed. Keyboard fixes add a skip link, disabled pagination semantics, distinct row action names, and architecture disclosure state. Public route titles are unique. Dashboard date filters now respect the public `all` default (local remains `30d`) and use the same compact mobile disclosure as signals; snapshot pagination clamps invalid/stale page queries and removes copied page parameters when linking to page one. No pipeline, schedule, hosting, or published dataset changes are involved.
- **Theme mechanics:** Default is light mode on initial visit before JavaScript execution or hydration (`data-theme="light"` on `<html>`, pre-paint inline script reading `localStorage.getItem("catalyst-theme")` with try/catch fallback). Theme storage key is `catalyst-theme`. No OS dark-mode sniffing override on initial visit. Client state uses `useSyncExternalStore` in `theme-store.ts` with cross-tab `StorageEvent` sync and blocked-storage resilience.
- **Switch:** Accessible `<button type="button" role="switch" aria-label="Dark mode" aria-checked={theme === "dark"}>` with permanent "Light" and "Dark" labels in `ThemeSwitcher.tsx`, accessible via click, Space, and Enter, styled with 44px hit-target and visible focus rings. Thumb transition disabled under `prefers-reduced-motion: reduce`.
- **Branding & identity:** Replaced orange lightning logo and Zap/Bolt icons with title-case Inter typographic wordmark **Catalyst** and sentence-case subtitle. Neutral favicon SVG with dark square and white letter C placed at both `frontend/src/app/icon.svg` and `frontend/public-site/app/icon.svg` (old `favicon.ico` removed).
- **Semantic palette:** Centralized CSS variables in `globals.css` using Tailwind CSS `@theme static` with `html[data-theme="dark"]` overrides. Zero inline hex/rgb literals in UI components; all surfaces, borders, text, status indicators, and badges use semantic tokens (`--color-bg-page`, `--color-bg-card`, `--color-bg-row`, `--color-text-primary`, `--color-link`, `--color-profit`, `--color-loss`, `--color-warning`, etc.).
- **Chart canvas theming:** TradingView Lightweight Charts canvas colors resolved dynamically from CSS variables via `getChartTheme()` in `chartTheme.ts` (supporting 6-digit hex, 3-digit hex, and rgb/rgba). Updated in-place on theme switch via `chart.applyOptions`, `series.applyOptions`, and `priceLine.applyOptions` without recreating the chart instance or resetting zoom/range.
- **Verification & evidence:** The October 12 main release passed 191 frontend tests across 33 files, 346 Python tests, and 36 Java tests (573 total). The Phase 54 readability release passed 179 tests. Automated Playwright browser verification covered first visit OS dark defaults to light, saved dark reload without flash, all 4 public routes in both themes, mobile 390px and 320px in both themes with zero horizontal overflow, 200% zoom-equivalent viewport, populated dashboard/signals/analytics/chart preview, blocked storage resilience, reduced motion, keyboard activation, route persistence, and cross-tab sync. Local populated UI review also covered 1440px, 390px, and 320px. The readability release rechecked live CloudFront at 390px and 320px; the partial-run status, compact filter state, switch, and priority empty state worked without page errors or horizontal overflow. The manifest then remained `20261005T140402Z`. The 320px public status-filter overflow found in production was fixed in Phase 53. 22 theme screenshots are recorded in `docs/verification/screenshots/`. See [current release checks](docs/verification/2026-10-12-trading-terminal-release.json).
- **Terminal interface (October 12, 2026):** Header and sidebar surfaces follow the selected page theme. The top market tape supports 19 ETFs/indexes, with a timestamp for quote collection separate from the scan timestamp. Each quote shows its instrument name and units; indexes use points and ETFs use USD. Hover/focus and manual interaction pause movement; Play, arrows, keyboard navigation, and reduced-motion preferences are supported. `SnapshotStatus` reads the provider recorded per hunter so changing feeds such as Yahoo Finance and pdufa.bio are attributed accurately. The bounded exporter requests all 19 instruments on subsequent scans and records optional `benchmarks_as_of`. The latest pre-release snapshot `20261012T140216Z` contains four core ETFs; release CI preserves that dataset, so the expanded tape populates after the next scheduled scan.
- Local design verification: 191 Vitest tests, both Next.js builds, TypeScript, lint, 72 public route/theme/viewport checks, eight local fixture cases, 13 carousel interaction checks and 11 scoped public-deployment Python tests passed. The October 12 main release independently passed 346 Python + 36 Java + 191 Vitest = 573; see [release verification](docs/verification/2026-10-12-trading-terminal-release.json) and [UI evidence](docs/verification/2026-10-11-theme-carousel.json).
Next.js 16 (App Router) + React 19 + Tailwind CSS 4:
- **Pages**:
  - `/`: Executive KPI overview and recent activity.
  - `/signals`: Interactive signals table, KPI ribbon (`/signals/stats`), CSV export, date range filters, and signal detail drawer.
  - `/analytics`: Portfolio performance, win rate, equity curve, regime breakdown.
  - `/architecture`: Engineering narrative with 5-stage pipeline visualization, expandable Architectural Decision Records, test coverage breakdown, "What I Learned" reflections, and full tech stack grid.
  - `/settings`: Alpaca API key validation form, real-time pipeline telemetry card (`/health/pipeline`), and developer synthetic signal injection test panel.
- **Components**:
  - `LiveStreamBanner`: Real-time SSE alert banner with connection status, auto-refresh toggle, and Web Audio API synthesized alert chime.
  - `PipelineStatus`: Live status indicator in navbar reflecting API, DB, Redis, and Java Engine health with interactive tooltip diagnostics.
  - `TickerSearchInput`: Keyboard-navigable ticker auto-complete dropdown.
  - `PriceChart`: TradingView Lightweight Charts component with live vs. synthetic history indicator and full-width Entry/Stop/Target price lines.
  - `SignalFilterBar`: Interactive catalyst, conviction, trap, and date range pills (`7D`, `30D`, `90D`, `All Time`).
  - `KellySimulator`: Interactive quantitative risk and position sizing calculator matching Half-Kelly criteria.

### 3.9 Trade Resolution Daemon (`resolver/`)
Recommendation resolution microservice:
- Polls `trade_orders` with status `ACTIVE`, by default every 300 seconds.
- Fetches Yahoo Finance prices with a 60-second in-memory cache and stale-cache fallback; evaluates BUY and SELL reference prices against stop/target thresholds.
- Updates status to `HIT_TARGET`, `HIT_STOP`, or `EXPIRED` after a default maximum holding period of 14 calendar days. It persists `resolved_at`, `resolved_price`, `pnl_percent`, and `realized_pnl_usd`, and emits `trade-resolutions` events.
- PnL is modeled from the recommended allocation and reference prices. This daemon does not query Alpaca fills, submit closing orders, or measure realized brokerage PnL. A daily scan can miss intraday stop/target crossings; public analytics must disclose that limitation.

### 3.10 Notification Dispatcher (`notifier/`)
Multi-channel real-time catalyst alerting service:
- Consumes Kafka `validated-signals` topic for catalysts with conviction score $\ge 70$.
- Dispatches alerts sequentially across configured Discord, Slack, and Telegram channels. Discord colors follow conviction: emerald for $\ge 85$, blue for $\ge 70$, otherwise amber; trap status does not currently change that color.
- Resilient retry logic with exponential backoff on HTTP 429 rate limits and error suppression to avoid consumer crash loops.

---

## 4. Platform Upgrades & Evolution (Phases 1–56)

| Phase | Core Deliverable | Key Details |
|---|---|---|
| **Phase 1** | Repository upgrades & async performance | Refactored API database pool, signal detail API, Docker setup, and base test suite. |
| **Phase 2** | Robust JSON parsing & font optimization | Code fence stripping in AI Layer, Finviz hunter table parsing, local font caching. |
| **Phase 3** | Market quote API & daemon reconnect | `/market/quote/{ticker}` endpoint via yfinance, auto-reconnect backoff for Kafka daemons. |
| **Phase 4** | Hunter HTTP retry resilience | Exponential backoff for HTTP requests, execution telemetry, and signal filters. |
| **Phase 5** | UI slide reset & analytics enhancements | Refined UI cards, equity curve charts, and dark theme consistency. |
| **Phase 6** | Dashboard filters & rollback hardening | Executive KPI cards, biotech ticker sanitization, DB consumer rollback on errors (150 tests). |
| **Phase 7** | Market overview bar & health telemetry | Global market bar (SPY, QQQ, VIX), `/health/pipeline` endpoint, Finviz pagination fix (153 tests). |
| **Phase 8** | CSV data export engine | Streaming CSV downloads for `/signals/export/csv` and `/orders/export/csv`, settings UI (155 tests). |
| **Phase 9** | SSE real-time signal stream | `GET /signals/stream` SSE endpoint with keepalive pings and async connection warmup (156 tests). |
| **Phase 10** | Security headers & ticker auto-complete | `GET /market/search`, HTTP security headers middleware (nosniff, DENY) (157 tests). |
| **Phase 11** | TickerSearchInput component | Reusable UI search component with keyboard navigation (Up/Down/Enter/Escape). |
| **Phase 12** | Alpaca rate limits & circuit breaker | Exponential backoff on HTTP 429, execution circuit breaker, max order constraints (167 tests). |
| **Phase 13** | Performance fast_info fallback | Resilient financial data extraction using yfinance `fast_info` with defensive guards (175 tests). |
| **Phase 14** | LiveStreamBanner SSE component | Client-side SSE consumer with automatic exponential backoff reconnection. |
| **Phase 15** | Persistence catalyst indexing | Index on `catalyst_type`, offset commits on malformed payloads to prevent consumer stall (177 tests). |
| **Phase 16** | Redis baseline volume TTL | Added 7-day TTL on `gk:baseline_vol:{ticker}` keys to prevent Redis memory exhaustion. |
| **Phase 17** | Timestamp & source hunter normalization | Gatekeeper normalizes source and time fields. Current Insider events omit `timestamp_utc` and receive UTC receipt time; optional Finviz events retain a legacy naive timestamp. Yahoo, Whale, Biotech and Drifter emit UTC collection timestamps. |
| **Phase 18** | Market history test coverage | Added unit tests for `/market/history/{ticker}` empty handling and success paths (179 tests). |
| **Phase 19** | Alpaca credential pre-validation | `POST /settings/alpaca/validate` endpoint and frontend credential verification form (183 tests). |
| **Phase 20** | Web Audio API chime in live stream | Pure browser synthesized audio alert chime (no external mp3 asset required) and auto-sync toggle. |
| **Phase 21** | AI Layer fallback model mechanism | `GEMINI_FALLBACK_MODEL` integration with retry and alias normalization (186 tests). |
| **Phase 22** | Signals statistics endpoint & KPI ribbon | `GET /signals/stats` endpoint and real-time statistics ribbon on the Signals page (187 tests). |
| **Phase 23** | Hunter orchestrator telemetry & timeouts | CLI orchestrator (`hunters/main.py`) with `--timeout` flag, duration tracking, and test suite (191 tests). |
| **Phase 24** | Gatekeeper ticker normalization | Strips `$`, exchange prefixes (`NASDAQ:`), newlines, and foreign suffixes (`.TO`) (191 tests). |
| **Phase 25** | Utility scripts & full diagnostics suite | Added `confluence_watcher.py`, `inject_synthetic_signals.py`, React 19 hook purity fixes, and 4 agent skills (197 tests). |
| **Phase 26** | Execution parity, Prometheus metrics & date filters | Order executions lateral join, signals date range filtering (`7d`/`30d`/`90d`), `POST /testing/inject`, `GET /metrics`, Next.js 16 `proxy.ts` (203 tests). |
| **Phase 27** | Redis health telemetry, schedule parity & verification probe | Redis async health check in API (`ping_redis()`), aggregate `/health/pipeline` (`api`, `database`, `redis`, `engine`, `ready`), Prometheus `catalyst_redis_up` gauge, EventBridge shutdown alignment (16:10 ET / 20:10 UTC), and automated `scripts/verify_pipeline_health.py` CLI probe (211 tests). |
| **Phase 28** | Critical bug fixes, Java engine tests & Frontend test suite | Fixed 11 critical bugs (SSE DB pool starvation, TradeList execution wipe, Gatekeeper/AI Kafka offset commits, negative price checks, dual-class tickers `.A`/`.B`/`.C`/`.WS`, settings `isConnected` state, AudioContext leak, CDK `t3.medium`/30GB sizing, Prometheus active pool metric). Added 33-test Java engine JUnit 5 suite (Lombok 1.18.34, strategies, RegimeFilter, KellySizer). Added 31-test frontend Vitest + Testing Library suite (276 total automated tests across stack). |
| **Phase 29** | Trade Resolution Daemon & Closed-Loop PnL | Implemented autonomous trade resolution daemon (`resolver/trade_resolver.py`), V4 TimescaleDB migration for `resolved_at`/`resolved_price`/`pnl_percent`/`realized_pnl_usd`, API statistics integration (`expired_count`, `realized_pnl_percent`, `total_realized_pnl_usd`), Java entity mapping, docker-compose service, and frontend resolution badges (290 tests across stack: 226 Python, 33 Java, 31 Vitest). |
| **Phase 30** | Error hardening, Redis pooling & hypertable pruning | Eliminated memory leak in `insider_hunter` via synchronized accession deque, narrowed broad exception blocks across services, managed Redis client via FastAPI lifespan, bound `validated_signals` hypertable query to 2-hour window, added regex/Path validation to ticker and order ID inputs, and returned HTTP 503 on Kafka offline in synthetic inject (294 tests across stack: 230 Python, 33 Java, 31 Vitest). |
| **Phase 31** | Half-Kelly Risk Simulator & TradingView Price Lines | Built interactive `KellySimulator.tsx` quantitative risk tool on `/analytics`, rendered full-scale `createPriceLine` Entry/Stop/Target overlays in `PriceChart.tsx`, added ARIA accessibility labels to `SignalFilterBar.tsx`, and expanded Vitest test suite with interactive component tests (298 tests across stack: 230 Python, 33 Java, 35 Vitest). |
| **Phase 32** | Real-Time Notification Microservice | Built standalone multi-channel alert dispatcher (`notifier/`) consuming `validated-signals`, delivering formatted alerts to Discord embeds, Slack Block Kit, and Telegram HTML for high-conviction catalysts ($\ge 70$), with HTTP 429 rate limit backoff and Docker Compose service integration (308 tests across stack: 240 Python, 33 Java, 35 Vitest). |
| **Phase 33** | Gatekeeper Sliding Window & Atomic Dedup | Hardened Gatekeeper state management using Redis Sorted Sets (`gk:sources_zset:{ticker}`) for millisecond-precision sliding window confluence pruning (`zremrangebyscore`), atomic lock deduplication via `SET NX EX` on `gk:sent:{ticker}` to prevent race conditions during signal bursts, and reservation rollback (`clear_sent`) on downstream dispatch failure (315 tests across stack: 247 Python, 33 Java, 35 Vitest). |
| **Phase 34** | Strict Path Validation, Confluence ZSET Watcher & Expanded Frontend Tests | Standardized regex `Path` validation on `/signals/{ticker}` and `/orders/{ticker}`, upgraded `confluence_watcher.py` to inspect and prune `gk:sources_zset:*` keys alongside legacy sets, and added comprehensive Vitest component test suites for `SignalFilterBar` and `PipelineStatus` (326 tests across stack: 249 Python, 33 Java, 44 Vitest). |
| **Phase 35** | TradeCard Component Testing & Realized PnL Field Exposure | Exposed `realized_pnl_usd` across API models, queries, and CSV exports, expanded `TradeStatus` union with lifecycle states (`RESOLVED_WIN`, `RESOLVED_LOSS`, `SUBMITTED`), made `getStatusConfig` defensively resilient against undefined statuses, and built Vitest unit test suite for `TradeCard` (331 tests across stack: 249 Python, 33 Java, 49 Vitest). |
| **Phase 36** | Performance API Terminal Resolution Fast-Path, Orders CSV Resolution Exports & Real-Time / Search Test Suite | Hardened `/performance` and `/performance/batch` with terminal resolved fast-path (`RESOLVED_WIN`, `RESOLVED_LOSS`, `HIT_TARGET`, `HIT_STOP`, `EXPIRED`) skipping redundant yfinance queries, added CSV resolution column tests, and built comprehensive Vitest component test suites for `LiveStreamBanner` (SSE, audio chime, auto-sync), `TickerSearchInput` (debounced search, keyboard navigation), `StatsBar` (KPI cards, zero-state win rate), and `SignalRow` (expand, quotes, risks) (361 tests across stack: 255 Python, 33 Java, 73 Vitest). |
| **Phase 37** | Closed-Loop Realized Dollar PnL, Hunter Sweeper & CLI Tests, and Dashboard Component Suite | Calculated and persisted `realized_pnl_usd` in `trade_resolver.py`, aggregated portfolio dollar PnL in `/orders/stats`, integrated `RESOLVED_WIN`/`RESOLVED_LOSS` in hit counts, tested hunter orchestrator CLI + Biotech/Drifter sweeps, added `aria-label` accessibility to FilterBar, and built Vitest suites for `FilterBar`, `MarketOverviewBar`, and `Navbar` (383 tests across stack: 260 Python, 33 Java, 90 Vitest). |
| **Phase 38** | SignalDetailPanel, TradeList & Analytics Vitest Expansion, Ruff Alignment & Trade Resolution Audit Skill | Built Vitest suites for `SignalDetailPanel` (portal modal, ESC/close handlers, scroll lock, chart history, risk scenarios), `TradeList` (performance enrichment, fallback banner), `Charts` (StrategyBreakdown, ConvictionHistogram, SignalTimeline, PerformanceSummary), `DashboardHeader`, and `NavClock` (live tick timers); auto-fixed Ruff import alignments; authored `.agents/skills/trade-resolution-audit/SKILL.md` runbook (405 tests across stack: 260 Python, 33 Java, 112 Vitest across 19 test files). |
| **Phase 39** | Market Overview Batch API, Quote/History Route Aliases, SignalDetail Resolution Mapping & Vitest Suite | Implemented `GET /market/overview` batch endpoint for concurrent index quotes via `asyncio.gather`, added dual REST URL aliases (`/market/quote/{ticker}` and `/market/history/{ticker}`), mapped `RESOLVED_WIN`/`RESOLVED_LOSS` in `signalDetailUtils.ts`, upgraded frontend `getMarketBenchmarks` to use overview batch, and built unit test suite for `signalDetailUtils` (424 tests across stack: 263 Python, 33 Java, 128 Vitest across 20 test files). |
| **Phase 40** | Full App Router Page-Level Vitest Suite & TypeScript Strict Alignments | Created complete page-level unit test suites for Next.js App Router pages: `DashboardPage` (benchmarks, stats, order list, pagination, and filter queries), `SignalsPage` (empty state, active filter resets, table rendering, and risk breakdown), `AnalyticsPage` (KPI strip, charts, Kelly simulator, and catalyst distribution), `SettingsPage` (telemetry health, Alpaca form states, synthetic injection), and `NotFound` (404 navigation) with 100% TypeScript typecheck compliance (438 tests across stack: 263 Python, 33 Java, 142 Vitest across 25 test files). |
| **Phase 41** | Whale Hunter Scraper & Sweep Unit Suites, Dual Ticker Route URL Aliases & Pytest Expansion | Implemented unit test suites for Whale Hunter Playwright scraping (`TestWhaleScraper`) and Kafka emission sweeps (`TestWhaleSweep`), added dual REST URL aliases (`/signals/ticker/{ticker}` and `/orders/ticker/{ticker}`), and verified across all test suites (445 tests across stack: 270 Python, 33 Java, 142 Vitest across 25 test files). |
| **Phase 42** | Multi-Catalyst Synthetic Injection Scenarios, Testing Router Expansion & Frontend Simulator Options | Expanded `scripts/inject_synthetic_signals.py` and `POST /testing/inject` with event builders (`create_whale_event`, `create_biotech_event`, `create_drifter_event`) and deterministic test scenarios (`triple`, `biotech`, `whale`, `drifter`), upgraded Frontend Settings scenario selector with all 5 hunter catalysts, and expanded script/API unit test suites (450 tests across stack: 275 Python, 33 Java, 142 Vitest across 25 test files). |
| **Phase 43** | Performance Router Short/Sell Resolution, Order Detail Resolution Integration & Persistence Recovery | Added bidirectional (SELL/short) support to performance calculation (`High >= stop_loss`, `Low <= target_price`, inverted PnL), integrated resolution metrics (`resolved_price`, `pnl_percent`, `RESOLVED_WIN`, `RESOLVED_LOSS`) in `get_order_detail`, fixed `conn.closed` reconnection in persistence consumer, and expanded unit tests (459 tests across stack: 284 Python, 33 Java, 142 Vitest across 25 test files). |
| **Phase 44** | Gatekeeper Source Alias Normalization & Defensive AI Prompt Signal Formatting | Introduced `SOURCE_ALIASES` dictionary mapping scraper sources (`barchart_unusual`, `biopharm_catalyst`, `edgar_api_json`, `fmp_earnings`, `finviz`) to canonical hunter types in Gatekeeper, hardened AI prompt builder to accept string JSON arrays or single objects, and expanded unit tests (461 tests across stack: 286 Python, 33 Java, 142 Vitest across 25 test files). |
| **Phase 45** | Trade Order Realized PnL Flyway Migration, In-Memory Resolver Price Caching & Notifier Bidirectional R:R | Added Flyway `V5__add_realized_pnl_usd_to_trade_orders.sql` and JPA `@Column` mapping in `TradeOrderEntity.java`, built TTL-based in-memory price caching with stale fallback in `TradeResolver`, upgraded multi-channel `notifier` with bidirectional SELL/short risk-to-reward ratio formatting, and expanded unit test suites (465 tests across stack: 290 Python, 33 Java, 142 Vitest across 25 test files). |
| **Phase 46** | Validated Signal Confluence Count Exposure, Multi-Source Confluence Filtering & Multiplier Badge | Exposed `confluence_count` across API models, queries, SSE streaming, and CSV export; added `min_confluence` query parameter filter to `/signals` and `/signals/export/csv`; added confluence multiplier badge (`2x`, `3x`) in `SignalRow.tsx`; and expanded API and Vitest component test suites (466 tests across stack: 290 Python, 33 Java, 143 Vitest across 25 test files). |
| **Phase 47** | Market Quote In-Memory TTL Caching, Unchanged Price Precision & Overview Error Fallback | Built thread-safe 15-second in-memory quote cache with `clear_quote_cache()`, fixed falsy evaluation bug where unchanged stocks (`change == 0.0`) incorrectly evaluated `change_percent` as `None` instead of `0.0`, added cached fallback resilience to `market_overview`, and expanded unit test suite (468 tests across stack: 292 Python, 33 Java, 143 Vitest across 25 test files). |
| **Phase 48** | Local Multi-Service Preview, AI Fallback Synthesis & Fast-Path, Maven Exclude Fix, Notifier Packaging & Pipeline Simulation | Fixed Maven Spring Boot repackage plugin `<exclude>` version error in `engine/pom.xml`, decoupled `notifier/requirements.txt` from monolithic dev requirements, added `./api:/app/api` volume mount to Docker compose, implemented deterministic heuristic fallback analysis in `ai_layer` with instant fast-path rejection on invalid API keys, ran end-to-end multi-catalyst simulation producing live orders and signals across TimescaleDB, and verified all 4 frontend routes returning 200 (470 tests across stack: 294 Python, 33 Java, 143 Vitest across 25 test files). |
| **Phase 49** | Signals Table Column Alignment, Min-Width & MarketOverviewBar Hydration Hardening | Resolved Signals page table text collision by expanding `Catalyst` column from 120px to 210px, adding 16px column gap, ellipsis truncation, and 900px min-width across header, rows, and loading skeleton; eliminated React hydration error and ESLint `set-state-in-effect` on `MarketOverviewBar` via `suppressHydrationWarning` and direct state initialization (470 tests across stack: 294 Python, 33 Java, 143 Vitest across 25 test files). |
| **Phase 50** | Recruiter-Ready Portfolio Presentation Overhaul | Created `/architecture` page with 6-section engineering narrative (Hero/Why, 5-Stage Pipeline Visualization, Architectural Decision Records with expandable cards, Engineering Quality & 470-test breakdown, "What I Learned" reflections, Tech Stack grid); restored real `PipelineStatus` telemetry in `Navbar.tsx` replacing static LIVE dot; added "How It Works" nav link; fixed `NavClock` timezone to use `America/New_York`; removed dead buttons from `TradeCard.tsx` and `SignalDetailPanel.tsx`; hardened `README.md` (test counts, sanitized JAVA_HOME, added `engine`/`executor` to quickstart, added "Why Catalyst?" section); synced outdated `docs/ARCHITECTURE.md`, `docs/CONTRIBUTING.md`, and `docs/IMPLEMENTATION_ROADMAP.md`; added `frontend/package.json` metadata; created root `CONTRIBUTING.md` redirect (480 tests across stack: 294 Python, 33 Java, 153 Vitest across 26 test files). |
| **Phase 52** | Light-First Theme Switch, Typographic Branding & Canvas Chart Theming | Built persistent `catalyst-theme` store, pre-paint bootstrap script, accessible switch, neutral wordmark & C favicon, migrated 740+ color literals to semantic tokens, in-place TradingView canvas options updates, and Playwright verification suite with 22 screenshots (511 tests across stack: 301 Python, 36 Java, 174 Vitest across 31 test files). |
| **Phase 53** | Production Mobile Filter Wrapping & Live Theme Verification | Fixed a 39px overflow in the public dashboard status-filter row at 320px by wrapping its label and pills below 480px; production browser verification now reports zero overflow at 320px and 390px in both themes. Published theme commit `a28fc1c` and responsive fix `f140886`; CI, CodeQL, and AWS release passed, and the organic manifest still references `20261005T140402Z` (511 tests across stack: 301 Python, 36 Java, 174 Vitest). |
| **Phase 54** | Dashboard Readability & Responsive Signal Presentation | Applied an expert UX review to KPI terminology and denominators, public scan freshness and partial status, responsive signal table labels, chart context and empty states, evidence-based trade cards, and filter hit targets. Adds a compact mobile filter summary, active count, and clear action; surfaces the unfiltered empty state before controls when no recommendations exist and moves benchmarks below recommendations in the public mobile flow. Added shared `SignalTable` and component coverage; deployed as `df3338d` after CI, CodeQL, and AWS release passed; live route, theme, and responsive checks passed with the organic manifest preserved (516 tests across stack: 301 Python, 36 Java, 179 Vitest across 32 test files). |
| **Phase 55** | Page Hierarchy, Useful Empty Views & Keyboard Refinement | Leads public routes with their purpose; extracts quiet `SnapshotStatus` and actionable `EmptyResults`; removes redundant empty analytics; lays out market quote price/change and low/high fields separately; consolidates populated analytics; clarifies the illustrative Kelly model; improves architecture reading width, disclosure semantics and labels. Adds compact recommendation filters, correct public date defaults, clamped pages, real disabled pagination, saved quote provenance, skip navigation, distinct row actions, unique route titles, and eight regression tests. Local verification: 187 Vitest across 33 files, lint/type checking, both production builds, and 24 Playwright route/theme/viewport checks with no errors or overflow. Interactions verify report focus, skip navigation, public date reset, page clamping, query retention and saved quote provenance. See [design refinement evidence](docs/verification/2026-10-05-design-refinement.json). Published as `46b72a5` with CI, CodeQL and AWS release green; 20 live CloudFront checks at 1440px, 390px and 320px confirm light-first default, both themes, saved dark reload, report focus, unique titles and unclipped navigation, with no page errors or horizontal overflow. Organic manifest `20261005T140402Z` is preserved (524 tests: 301 Python + 36 Java + 187 Vitest). |
| **Phase 56** | EC2 Daily Source Recovery & Retained Job Diagnostics | Verified weekday scheduling was healthy; restored Squeeze through a bounded Yahoo screen and Whale through named div-grid/shadow-root fields. Added safe provider details, account-gated biotech reporting, FMP response/retry fixes, explicit source attribution, and private finite-job log retention. Released `7bbe2a8`; two repaired EC2 batches each published 31 raw events with four completed hunters, fresh regime, backup and automatic shutdown. BioPharmCatalyst was gated at that stage; Phase 58 replaced the public source with pdufa.bio. GitHub CI passed 342 Python + 36 Java + 188 Vitest = 566; no local test run was used as repair acceptance. |
| **Phase 57** | EC2 Startup Diagnostics & Private Biotech Session Support | Released `559cc8a` with fresh-pointer guards, clean staging, durable reports/exports, early failure handling and private bootstrap logs. Two EC2 runs published 31 raw events and stopped automatically; canonical-launcher readback and bootstrap status/log retention passed. Added explicit provider-only session capture/upload, disabled until an entitled account is supplied. The user declined subscription/account dependency; Phase 58 replaced it with a verified free public source. Existing GitHub checks again passed 566 tests and both builds; legacy authenticated source acceptance is unused by the public profile. |
| **Phase 58** | Free Biotech Feed & Completed Five-Hunter EC2 Run | Replaced public account-gated Biotech with the documented anonymous pdufa.bio core API, requiring exact-day upcoming source-linked goals and visible attribution. Source-only EC2 collector accepted 25 events; release `0073de8` passed CI/CodeQL/publication. Full run `20261012T034358Z` completed five hunters, published 56 raw events, saved backup/job/bootstrap logs and stopped itself at 03:44:39 UTC. All events were accounted for (22 single-source buffered, 34 filtered); no recommendations qualified. No user action, provider account or paid subscription remains required. |

---

**First cloud publication:** `20261004T230637Z`, commit `2d1ecdb`, 30 organic raw events (29 insider/1 drifter), three successful sweeps, Finviz HTTP failure, Barchart timeout, zero triage/validated signals/orders. Both hypertables were verified, API export and private backup completed, manifest promoted, and the worker stopped automatically. Regime was correctly unavailable/HALT due to the now-fixed VIX encoding bug. Full-stack observed container usage included ~860 MiB hunter job, ~373 MiB Kafka, ~278 MiB Java and ~99 MiB API, with several GiB system headroom. External scraping limitations are shown rather than disguised as live successes.

**Phase 51 — Public daily AWS deployment:** Static export and snapshot adapter, strict batch hunters, grounded-only AI with persistent request limits, explicit Kafka virtual threads, fresh-market halt, private CloudFront/S3 hosting, encrypted worker/SSM configuration, GitHub OIDC immutable releases, watchdogs and timezone scheduling. Provisioned and verified October 4; organic scans published and stopped automatically, with enabled weekday schedules and disclosed provider failures. Public HTTPS and production assets passed HTTP checks; interactive visual/browser QA was unavailable. See `docs/PUBLIC_DEMO_OPERATIONS.md`. Current tests verified in GitHub CI: 342 Python + 36 Java + 188 Vitest = 566.

**Previous-session cleanup:** The working tree was clean at the initial audit. Two historical Git stashes were reviewed: the older frontend implementation's performance/order APIs, seed fixtures, hunter timestamps, and schema work are already implemented and superseded in current main. Its older code was not reapplied. The other stash's useful Compose-versus-test and frontend-readiness clarifications were incorporated into `docs/TESTING.md`. Both stashes remain available as recovery copies; public data never uses the local seed fixtures.

## 5. Developer & Agent Guidelines

### 5.1 Python Environment & Testing
- **Virtual Environment**: Always use `.venv/bin/pytest` and `.venv/bin/ruff` (Python 3.12).
- **Running Pytest**:
  ```bash
  .venv/bin/pytest
  ```
  *Current status: 342 passing tests in GitHub CI.*
- **Linting & Code Style**:
  ```bash
  .venv/bin/ruff check .
  ```
  Follow PEP 8, use strict type hints (`from typing import ...`), prefer `pathlib.Path` over `os.path`.

### 5.2 Frontend Environment & Testing
- **Location**: `frontend/` directory.
- **Unit & Component Testing (Vitest)**:
  ```bash
  npm --prefix frontend run test
  ```
  *October 12 main release: 191 passing tests across 33 frontend files; complete CI passed 346 Python + 36 Java + 191 frontend tests = 573 total.*
- **Type Checking**:
  ```bash
  npm --prefix frontend run typecheck
  ```
- **Linting**:
  ```bash
  npm --prefix frontend run lint
  ```
- **Production Build**:
  ```bash
  npm --prefix frontend run build
  ```

### 5.3 Java Strategy Engine Testing
- **Location**: `engine/` directory.
- **Java Version**: Java 21 (Temurin).
- **Running Tests**:
  ```bash
  export JAVA_HOME=/Users/alesio/Library/Java/JavaVirtualMachines/temurin-21.0.11/Contents/Home && cd engine && mvn -B test
  ```
  *Current status: 36 passing tests (0 failures).*

- **React 19 & Next.js 16 Rules**:
  - Never mutate ref values (`ref.current = value`) during rendering. Use `useEffect` or lazy state initializers.
  - Never call `setState()` synchronously in the root of a `useEffect` hook.
  - Use `src/proxy.ts` for route interception and proxying instead of deprecated `middleware.ts`.

### 5.4 Working with Docker Compose
- Start infrastructure only:
  ```bash
  docker compose up -d zookeeper kafka redis gatekeeper ai-layer persistence catalyst-api
  ```
- Start all services:
  ```bash
  docker compose up -d --build
  ```
- Inspect logs:
  ```bash
  docker logs -f catalyst_gatekeeper
  docker logs -f catalyst_ai_layer
  docker logs -f catalyst_engine
  ```

---

## 6. Workspace Skills Catalog

The repository provides specialized agent skills in `.agents/skills/`:

1. **`pipeline-e2e-testing`** ([SKILL.md](file:///Users/alesio/Developer/Projects/catalyst/.agents/skills/pipeline-e2e-testing/SKILL.md)):
   - Complete guide for injecting synthetic signals (`scripts/inject_synthetic_signals.py`) into Kafka `raw-events` and verifying Gatekeeper confluence, Redis caching, AI validation, and Java engine order sizing.
2. **`hunter-management`** ([SKILL.md](file:///Users/alesio/Developer/Projects/catalyst/.agents/skills/hunter-management/SKILL.md)):
   - Operational guide for running, configuring, and testing market hunters via `python -m hunters.main`, managing scraper rate limits, and implementing new hunters.
3. **`catalyst-diagnostics`** ([SKILL.md](file:///Users/alesio/Developer/Projects/catalyst/.agents/skills/catalyst-diagnostics/SKILL.md)):
   - Comprehensive test runner, ruff linting, TypeScript typechecking, and health telemetry verification instructions.
4. **`aws-catalyst-deployment`** ([SKILL.md](file:///Users/alesio/Developer/Projects/catalyst/.agents/skills/aws-catalyst-deployment/SKILL.md)):
   - Current public AWS CDK (`infra/public_demo_stack.py`), SSM/bootstrap, GitHub OIDC releases and weekday batch scheduling; legacy EC2/Lambda instructions are separately labeled.
5. **`trade-resolution-audit`** ([SKILL.md](file:///Users/alesio/Developer/Projects/catalyst/.agents/skills/trade-resolution-audit/SKILL.md)):
   - Operational runbook for evaluating, auditing, and executing closed-loop trade resolutions across TimescaleDB, the Trade Resolution Daemon (`resolver/trade_resolver.py`), Kafka `trade-resolutions` events, Alpaca execution tracking, and FastAPI performance analytics.

---

## 7. Operational Troubleshooting & Gotchas

1. **Synthetic Tickers & Java Engine**:
   - `TEST*` or synthetic tickers injected into Kafka will pass through Gatekeeper and AI Layer without issue.
   - However, the Java Strategy Engine calls Yahoo Finance to get market price and calculate historical volatility for Kelly position sizing.
   - For non-existent tickers, the engine skips sizing and will NOT create a `trade_order`.
   - **Fix**: When testing the full pipeline through to `trade_orders`, always use real tickers (e.g., `NVDA`, `AAPL`, `MSFT`).
2. **Redis Memory Protection**:
   - `gk:sources:*` and `gk:signals:*` keys expire automatically after 300 seconds.
   - `gk:baseline_vol:*` keys expire after 7 days.
   - If Redis becomes cluttered during testing: `redis-cli FLUSHDB`.
3. **Kafka Consumer Offset Commit on Skipped Payloads**:
   - Both Gatekeeper and Persistence services commit offsets even when a payload is dropped or invalid to prevent endless poison-pill reprocessing loops.
4. **AWS Deployment Cost Controls**:
   - Legacy EventBridge rules are disabled. New timezone-aware schedules are controlled by CDK `enableDailyScan` context; read the current operations record before changing them.
   - Always verify Lambda execution manually before enabling automated weekday schedules.

### Frontend accessibility and public route metadata (October 5, 2026)
- Pagination uses a labeled navigation landmark, exposes the current page, and renders unavailable previous/next actions as non-focusable text while preserving active-link query parameters.
- Architecture disclosure cards expose expanded state and their controlled panel, retain a 44px minimum trigger height, and use 14px body text. Public dashboard, signals, and analytics routes define distinct titles and descriptions for daily snapshot content.

### Public terminal workspace and market tape (October 12, 2026)
- Public chrome uses page theme tokens for the header and navigation. The reusable `MarketTape` renders a bounded 19-symbol ETF/index universe; index levels are points and ETF prices are USD.
- Quotes remain captured observations: optional `benchmarks_as_of` marks quote retrieval independently from scan publication time, while optional `MarketQuote.price_date` labels daily bars. `deploy/export_snapshot.py` asks the existing market-overview API for these 19 symbols at collection. Snapshot publication and the original market scan remain separate operations; release CI does not rewrite the active manifest.
- The live manifest at `20261012T140216Z` still contains the original four core benchmark quotes. Its four-card row may fit at desktop sizes until a later worker scan publishes the expanded universe.
- Auto-scroll is 24 px/second and loops through inert duplicate content. Hover/focus pause it; touch and manual movement pause; explicit Play resumes while focused; reduced motion disables auto-scroll while manual controls remain. Browser verification includes touch, focus, and boundary behavior.
