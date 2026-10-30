# Audit Remediation Plan (October 29, 2026)

Shared work plan for fixing the findings of the October 29–30 zero-leads review and full repository audit. Any agent can pick up the next unchecked item. Update the status box, the progress log at the bottom, and `AGENTS.md` when an item lands.

## Why this exists

All 13 published weekday runs (October 12–29) produced 30–53 raw events and **zero** leads. Two causes were confirmed from private logs:

- The Gatekeeper's relative-volume (RVOL) filter is measured 32 minutes after the open against full days.
- Confluence is limited to one 5-minute window.

The audit then found that every stage after the Gatekeeper (AI layer, engine, persistence, resolver, API detail, export) has never processed real data and contains a defect that would lose or misstate the first real lead. Evidence: `AGENTS.md` sections "Zero-triage review" and "Full audit".

## Ground rules for agents

- **Do not** commit, push, deploy, change AWS resources, or run anything against production unless the user explicitly asks. Read-only AWS inspection (S3 logs, snapshots) is fine.
- The working tree already contains **uncommitted work from earlier sessions** (CI simplification, overview UI, docs). Do not revert or reformat those files beyond what an item requires.
- This worktree has no `.venv`. Use the main checkout's interpreter:
  - Python tests: `/Users/alesio/Developer/Projects/catalyst/.venv/bin/python -m pytest -p no:cacheprovider -q`
  - Ruff: `/Users/alesio/Developer/Projects/catalyst/.venv/bin/ruff check .` and `... ruff format --check .`
  - Java: `export JAVA_HOME=/Users/alesio/Library/Java/JavaVirtualMachines/temurin-21.0.11/Contents/Home && cd engine && mvn -B -q test`
  - Frontend: `npm --prefix frontend run test -- --run`, `npm --prefix frontend run typecheck`, `npm --prefix frontend run lint`
- Each fix needs at least one test that fails without it. Prefer the smallest change; delete code where possible.
- Keep production defaults safe: the public profile is grounded-only AI, two-source confluence, no executor.

## Status legend

`[ ]` not started · `[~]` in progress · `[x]` done (tests pass) · `[-]` deliberately skipped (say why in the log)

---

## Must fix (a real lead would be blocked, lost, or misstated)

### [x] 1. Volume filter rejects almost everything
- **Files:** `hunters/common/liquidity_lookup.py`, `gatekeeper/gatekeeper.py` (`get_drop_reason`), `gatekeeper/config.py`
- **Problem:** RVOL is computed as today's ~30-minute partial bar divided by a 5-bar mean that includes it. The median is 0.13. NFLX, NOK and ENPH two-source matches were dropped.
- **Change:**
  - **Baseline:** completed sessions only (exclude today's in-progress bar during market hours, America/New_York), using the 20 sessions before the evaluated one.
  - **RVOL:** take the max of:
    - the last completed session's volume ÷ baseline;
    - today's partial volume ÷ (baseline × expected cumulative fraction of daily volume at the elapsed time), computed only after 15 minutes of trading.
  - **Volume:** report the larger of the last completed session's volume and today's volume, so the 50k minimum is meaningful at 10:00.
  - **Exemptions:** add `GATEKEEPER_RVOL_EXEMPT_SOURCES` (default `insider,biotech,drifter`); scheduled or announced events are not volume-confirmed signals. The exemption covers RVOL only: price still applies, and the 50k volume minimum still applies to everything except insider (which was already exempt from it).
- **Tests:** a partial-day bar no longer collapses RVOL; a spike in the prior completed session is detected; exempt sources skip RVOL but not price or volume.
- **Landed:** hunters also emit `relative_volume_basis` (`prior_session` or `intraday_projection`). The intraday curve in `_CUMULATIVE_VOLUME` is an approximation, not fitted to data.

### [x] 2. Insider hunter sees only the newest page of filings
- **Files:** `hunters/insider_hunter.py`, `hunters/common/config.py`
- **Change:**
  - **Paging:** page the EDGAR current feed (`count=100`, `start=0,100,…`) until entries are older than `INSIDER_LOOKBACK_HOURS` (default 24), capped at `INSIDER_MAX_PAGES` (default 4).
  - **Filtering:** dedupe by accession, and skip non-`4` categories.
  - **Fetching:** drop the extra Range "peek" request, and fetch filings with bounded concurrency under 8 requests/second.
  - **Errors:** a failing filing is counted and skipped, not fatal to the sweep.
- **Tests:** pagination stops at the cutoff; a per-filing HTTP error does not abort the sweep.
- **Landed:** 4 concurrent filings, 0.125 s minimum spacing between SEC requests, liquidity lookups run 4 at a time. If every filing fails, the sweep raises `ProviderError("sec", "source_unavailable")`. At most about 400 filings (≈800 requests, ≈2 minutes) per sweep; insider events now arrive later in the run, which narrows the 5-minute confluence window (see S1).

### [x] 3. One bad AI reply uses up the whole day's AI budget
- **Files:** `ai_layer/ai_service.py`, `ai_layer/request_budget.py`, `ai_layer/prompt_builder.py`
- **Change:**
  - **Retries:** only transient errors (`google.genai.errors.ServerError`, httpx timeouts and transport errors) are retried.
  - **Budget:** exhaustion raises a dedicated exception and stops immediately, with no sleep or retry.
  - **Low scores:** a parsed score below `MIN_CONVICTION_SCORE` returns without the grounding check and without a retry.
  - **Grounding:** an ungrounded score of 50 or more is dropped without a retry.
  - **Prompt:** scores of 50 or more require cited search results; otherwise score below 50 and say so.
  - **Logging:** log the final failure cause.
  - **Budget day:** use America/New_York, not UTC.
  - **Prompt length:** truncate the signal-data block, not the whole prompt, so the output schema is never cut.
- **Tests:** a budget-exhausted call makes no model request and does not sleep; an ungrounded high score is not retried; a low score is accepted without grounding; a 503 is retried once; a long signal list keeps the OUTPUT SCHEMA.

### [x] 4. Bearish or unclassified setups become BUY orders
- **Files:** `ai_layer/prompt_builder.py`, `ai_layer/ai_service.py` (`normalize_analysis`), `engine/.../model/ValidatedSignal.java`, `engine/.../consumer/ValidatedSignalConsumer.java`, `engine/.../strategy/StrategyRouter.java`, `StrategyRouterTest`
- **Change:**
  - **Prompt:** conviction means "a long position reaches its target"; bearish setups score below 50.
  - **AI layer:** coerce `catalyst_type` to {SUPERNOVA, SCALPER, FOLLOWER, DRIFTER, UNKNOWN}.
  - **Engine:** read `news_sentiment` and skip `bearish`. The router returns no order for unknown types; delete `buildFallback`.
- **Tests:** UNKNOWN produces no order; bearish is skipped; an unrecognized catalyst string becomes UNKNOWN.

### [x] 5. Trades are never resolved in production
- **Files:** `deploy/compose.batch.yml` (resolver command), `resolver/trade_resolver.py` (`json.dumps(..., default=str)`)
- **Tests:** every `python -m X` command in `deploy/compose.batch.yml` targets a module with a `__main__` guard; the real serializer handles a `datetime`.

### [x] 6. Order detail fails for every real order
- **Files:** `api/routers/orders.py` (`$2::timestamptz` in both signal lookups; `sig_row.get("id")`), `tests/test_orders_api.py` (remove the mocked `id`)
- **Tests:** a signal row without `id` returns 200; the SQL text contains `::timestamptz`.

### [x] 7. One bad message can block every later publication
- **Files:**
  - `engine/.../config/KafkaConfig.java`: `ErrorHandlingDeserializer`.
  - `persistence/consumer.py`: seek back and retry the same message, give up after N attempts with an error log, then commit.
  - `gatekeeper/gatekeeper.py`: `to_float` returns the default for non-finite values.
  - `ai_layer/ai_service.py`: serialize with `allow_nan=False` after sanitizing.
- **Tests:** NaN never reaches serialized output; a persistence failure retries the same offset, then commits after the cap; a Java consumer factory test with a NaN record does not throw.

### [x] 8. A failed save loses the order with no retry
- **Files:** `engine/.../consumer/ValidatedSignalConsumer.java`
- **Change:** save before sending, and record the cooldown only after a successful save.
- **Tests:** a repository failure leads to a second save attempt on redelivery, and the producer is not called on failure.

## Should fix

### [x] 9. Two different rules decide whether a trade won
- **Files:** `resolver/trade_resolver.py`, `api/routers/performance.py`, `frontend/src/components/dashboard/TradeList.tsx`
- **Change:**
  - **Resolver:** walk daily high/low bars from the session after entry; check the stop before the target on each bar; resolve at the stop or target price; expire after 14 calendar days.
  - **Performance route:** skip the entry-day bar, and use the same 14-day expiry as the resolver.
  - **Frontend:** in snapshot mode, show the database status.

### [x] 10. Insider filings are misread
- **Files:** `hunters/insider_hunter.py`
- **Change:**
  - Aggregate rows per (accession, code).
  - Read all reporting owners.
  - Match titles by substring or `isOfficer`.
  - Add `transaction_date`, `document_type`, and `is_10b5_1` (from `aff10b5One` or a footnote).
  - Skip 4/A filings and trades older than 5 days.

### [x] 11. One company can get different tickers
- **Files:** a new shared helper in `hunters/common/` used by the whale hunter, the insider hunter, `gatekeeper.normalize_ticker`, the drifter symbol filter, `engine MarketDataService` (`.`→`-`), and the resolver price lookup.
- **Change:** map `BRK.B` and `BRK/B` to `BRK-B`; reject unknown foreign suffixes instead of stripping them (`T.TO` must not become `T`).

### [x] 12. Failures look like quiet days
- **Files:** `hunters/common/liquidity_lookup.py` and the hunters' skip logs, `hunters/main.py` report, `gatekeeper.py` and `ai_service.py` sends
- **Change:**
  - Log skipped lookups as warnings, and add a `liquidity_skipped` count to the hunter report.
  - Use `.get(timeout=30)` on Kafka sends in the Gatekeeper and AI layer.

### [x] 13. Hunters skip the fields and candidates that matter
- **Files:** `hunters/whale_hunter.py`, `hunters/common/yahoo_screener.py`
- **Change:**
  - **Whale:** map `Open Int`, `Vol/OI` and `Last Trade` (verify the binding names against a live page or saved fixture).
  - **Screener:** request 250 rows and keep the 40 `get_info()` enrichment cap.

### [x] 14. The uncommitted CI change can silently skip a release
- **Files:** `.github/workflows/ci.yml`
- **Change:** diff against the commit recorded in the last published release (or the last successful main CI run), and publish if that lookup fails. Also handle a force push without failing.

### [x] 15. Failed runs are hard to diagnose
- **Files:** `deploy/batch.sh`, `deploy/run-worker.sh`
- **Change:**
  - `trap 'exit 143' TERM INT`.
  - Append the bootstrap log to the uploaded batch log.
  - Install the next launcher only after publication.
  - `rm -f reports/*.json exports/*.json` at start.
  - `compose pull --policy missing`.

### [~] 16. SEC requests carry another contributor's personal email
- **Files:** `hunters/insider_hunter.py`, `scripts/public_demo.py`, `.env.example`, docs
- **Change:** require `SEC_USER_AGENT`. The user must supply the address; never invent one.
- **Code landed:** the hard-coded address is removed. Without `SEC_USER_AGENT`, `--once` raises `ProviderError("sec", "missing_configuration")` and loop mode idles. `public_demo.py configure` refuses to run without it.
- **Blocking user action before the next release:** add `SEC_USER_AGENT="Catalyst <your monitored email>"` to the local `.env` and run `scripts/public_demo.py configure`. Otherwise the next EC2 run reports Insider as failed.

### [~] 17. The release job can read your private database backup
- **Files:** `infra/public_demo_stack.py`
- **Change:** limit the publisher to `releases/*` and `release.json`.
- **Deployment:** needs `cdk deploy`, which requires user approval.
- **Code landed:** `artifacts.grant_put(publisher, "releases/*")` and `"release.json"` replace `grant_read_write`. Offline synth (no AWS calls) shows the publisher policy has only put/abort actions on those two artifact paths. **Remaining:** `cdk deploy -c publicDemo=true` after this work is committed. The 2026-10-29 read-only `cdk diff` also showed that the worker's `latest_amazon_linux2023()` image had moved (`ami-03c3da4cfa8e8943a` → `ami-07ad3ac74660c86c1`), so any deploy would have **replaced the worker** and its database volumes. The image is now pinned (`WORKER_AMI`, override with `-c workerAmi=`). The diff still updates the worker's UserData (it embeds `deploy/run-worker.sh`), which CloudFormation may apply by stopping and starting the instance, and booting it runs a scan. Deploy outside the 10:00–11:30 ET window and check the worker is stopped afterwards.

### [x] 18. CSV exports lose outcome data
- **Files:** `api/routers/orders.py` (select the resolution columns), `frontend/src/lib/snapshot.ts` (guard text values only)

## Nice to have

### [x] 19. Live stream holds a database connection per open tab (local only)
- **Files:** `api/routers/signals.py`
- **Change:** acquire per poll; minimum poll interval 1 second; delete the dead `__iter__` branch.

### [~] 20. Leftover code
- **Code landed:** everything except the legacy stack, which waits for the user's confirmation.
- **Change:**
  - Delete `persistence/schema.sql`, `MODEL_ALIASES`, the unused `application.yml` Kafka consumer/producer blocks, and the dead frontend mock branches.
  - The legacy `infra/catalyst_stack.py`, `deploy/lambda_*.py` and `scripts/ec2-bootstrap.sh` need the user's confirmation before deletion, because the legacy instance still exists.

---

## Strategic follow-ups from the zero-leads review

- [~] **S1 Multi-day confluence:** keep per-ticker source evidence for 5–10 trading days, with decay, in TimescaleDB rather than a 300-second Redis TTL. Landed as a 7-day Redis window (`GATEKEEPER_ROLLING_WINDOW_SECONDS=604800`) with AOF persistence on the batch volume. Decay and a TimescaleDB store are not built.
- [x] **S2 Direction-aware confluence:** insider sales and put flow count as bearish; only same-direction sources confirm each other. Bearish evidence is stored for the AI and does not count toward confluence. Neutral biotech evidence still counts.
- [ ] **S3 Replay harness:** rebuild raw events from retained private logs or exported raw events, and count how many triage payloads each rule set produces. Private logs expire after 14 days; persist raw events (for example, a private `raw_events` export) to make replays durable.
- [ ] **S4 Funnel diagnostics:** in the public scan report, add drop counts by reason and same-ticker near misses.
- [ ] **S5 Scan timing:** evaluate an after-close scan (it sees the full day's volume and Form 4s; recommendations would then be for the next open).

## Smaller findings backlog

**AI layer and Gatekeeper**
- [x] B1 Gatekeeper dedupe hides late evidence: a third source arriving after forwarding never reaches the AI. The sent marker stores the forwarded source count, so a new confirming source is forwarded again.
- [x] B2 Traps can never be persisted (the prompt says below 40, the threshold is 50). A trap is published below 50. The engine still refuses to size it.
- [ ] B5 `float_shares` and `market_cap` are always null in the prompt.

**Engine**
- [x] B6 Regime fetch failure at startup halts the first signals; refresh once before halting on stale data.
- [x] B7 `KellySizer` returns a 1% floor instead of 0 when risk or reward is not positive.
- [ ] B8 Duplicate orders across engine restarts; add a unique (ticker, signal timestamp).
- [x] B9 The SMA includes today's partial bar; `toMinutes() > 15` accepts 15:59. The last close is left out from 9:30 to 16:05 ET on weekdays. Freshness uses the full duration, so 15 minutes 59 seconds is stale.

**Resolver**
- [ ] B11 Orders without a price never expire; the stale-cache fallback is unbounded; failures are logged at debug.

**Deploy**
- [x] B13 Kafka offset retention combined with `earliest` can replay old events after a long pause; set `KAFKA_OFFSETS_RETENTION_MINUTES` (43200, 30 days) on the batch broker.
- [x] B14 A `head-object` failure of any kind overwrites the live manifest; only initialize on 404. Any other error fails the release.
- [~] B15 The hunters job and S3 calls have no deadline; use `timeout -k 30 600`.
- [~] B17 EventBridge start/stop have no retries; use 3 retries and a 900-second event age. Code sets both. Takes effect on `cdk deploy`.
- [x] B18 Local compose publishes ports on all interfaces; bind to `127.0.0.1`.
- [x] B19 `scripts/public_demo.py configure` can switch the public worker to Finviz from a local `.env`. Configure now always writes Yahoo and pdufa.bio.
- [x] B21 No tests for `pipeline_counts`; CI has no `bash -n` on the deploy scripts. `ci.yml` runs `bash -n` on `deploy/*.sh`, and pytest does the same. `pipeline_counts` still has no direct test.

**Hunters**
- [~] B23 Drifter dedupe is in-memory; add `days_since_earnings`. The age field is on each event. Dedupe is still in memory and resets every process.
- [x] B24 Tiny EPS estimates inflate the surprise percentage; use a floor such as 0.05.
- [ ] B25 One event per contract or drug instead of per ticker (TSLA ×6, RHHBY ×3).
- [x] B26 One malformed PDUFA record fails the sweep; add a truncation flag and `days_until_event`. A bad record is skipped. A payload whose every record is malformed still fails. `calendar_truncated` is set when the response exceeds 40 records.
- [x] B27 FMP `HTTPStatusError` is chained into the logs with the API key; use `from None`.
- [ ] B28 No tests for `parse_pdufa_response`, `liquidity_lookup` or `KafkaClient` delivery counts.
- [ ] B29 Dead hunter config: `KAFKA_TOPIC_INSIDER` in `config.py`, `FINVIZ_URL`, `FINVIZ_SQUEEZE_URL`, `KafkaClient._instance`.

**API and frontend**
- [x] B30 Export quotes are collected only for order tickers; add signal tickers. Signal tickers fill the existing 12-ticker cap after order tickers.
- [ ] B31 The fallback analysis panel ignores `resolved_price` and `pnl_percent`.
- [x] B32 Local dashboard pagination drops `date_range=all`. Only the local default, 30d, is omitted from the page links.
- [ ] B33 `/orders` exposes any user's execution through the lateral join (local/legacy only).
- [ ] B34 The testing inject endpoint is always on and broken inside Docker (no `kafka_bootstrap_servers` setting).
- [ ] B35 Signal IDs are row numbers and change between snapshots.
- [x] B36 Modeled PnL totals exclude EXPIRED orders. Expired orders are included in the realized total and average.
- [ ] B37 Date filters assume a UTC database session.
- [ ] B38 Daily-volume labels merge the same date across years.
- [ ] B39 Public date filters use the viewer's clock instead of the snapshot's `as_of`.
- [ ] B40 Bounded export counts disagree with full-database stats.
- [x] B41 One NaN close from yfinance fails the whole performance batch. Non-finite bars are dropped, and one failed order no longer fails the batch.
- [x] B42 `/market/overview` accepts unlimited symbols. The cap is 25, above the 19-symbol tape.
- [ ] B43 The VIX label thresholds and "14 sessions" wording disagree between the API, frontend and resolver.
- [ ] B44 Win rate is computed in four places.

---

## Progress log

Newest first. One line per landed item: date, item, files, tests run.

- 2026-10-30: Backlog pass. S2 and a Redis form of S1 (7-day window, AOF volume; no decay store). B1 re-forwards when a new source arrives. B2 persists traps below 50. B6 refreshes a stale regime once before halting. B9 drops the in-progress SPY bar and treats 15:59 as stale. B13 offset retention 30 days. B14 manifest init only on 404. B17 schedule retries in code, not deployed. B18 localhost port binds. B19 public configure always writes Yahoo and pdufa.bio. B21 `bash -n` in CI. B23 `days_since_earnings` (dedupe still in memory). B24 EPS estimate floor 0.05. B26 PDUFA skip/truncation/days. B27 FMP errors do not chain the keyed URL. B30 signal tickers in the quote export. B32 local pagination keeps `date_range=all`. B36 expired orders in the modeled total. B41 a NaN bar does not fail the performance batch. B42 overview cap 25. Tests: Python 419, Java 43. `SEC_USER_AGENT` is in the local `.env`; `configure` was not run, so the worker runtime does not have it yet.

- 2026-10-29: Deployment safety. A read-only `cdk diff` (no deploy) showed that any deploy would replace the public worker because its AMI followed the latest Amazon Linux 2023 image. `infra/public_demo_stack.py` pins `WORKER_AMI = "ami-03c3da4cfa8e8943a"` (the AMI the instance runs). Re-running the diff confirmed `ImageId` no longer changes. Item 17 is not deployed; see its note.

- 2026-10-29: Item 20 (except the legacy stack).
  - Deleted `persistence/schema.sql` (unused; its `id`-only key conflicts with the hypertable); `docs/schemas.md` and `docs/DEEP_TECHNICAL_GUIDE.md` now point at `init_schema()` in `persistence/consumer.py`.
  - Deleted `MODEL_ALIASES`/`resolve_model_name`: they silently replaced newer names with older models (`gemini-3-flash` ran `gemini-2.5-flash`). `GEMINI_MODEL` and `GEMINI_FALLBACK_MODEL` are now used as written.
  - Deleted the engine's `spring.kafka.consumer`/`producer` blocks; `KafkaConfig`'s explicit factories replace the auto-configured ones, so only `bootstrap-servers` was read.
  - Frontend: deleted `USE_MOCK` branches and `MOCK_ORDERS`/`MOCK_SIGNALS`/`MOCK_STATS`. Kept `generateMockPriceBars`: the local chart still uses it, labelled synthetic.
  - Full suites: Python 402, Java 41, Vitest 186; typecheck, lint and ruff clean.
  - Legacy stack kept (the user delegated the choice): `infra/catalyst_stack.py`, `deploy/lambda_*.py` and `scripts/ec2-bootstrap.sh` are the only code managing the stopped legacy instance `i-0194d6c0b8f0e191a`. Delete them together with that instance and its retained volume.

- 2026-10-29: Item 19. `/signals/stream` takes a connection with `anext()` and closes the provider generator after each query (the old `async for … break` left it suspended, holding the pooled connection through the sleep); `poll_interval` minimum is 1 second; the dead sync `__iter__` branch is gone. The surviving query had lost `confluence_count`, which only the dead branch selected; the shared `STREAM_SQL` restores it. Tests: `test_api.py` (connection released before the event is delivered, sub-second polling rejected); 44 passed.

- 2026-10-29: Item 17 code. Publisher gets put-only access to `releases/*` and `release.json` (the only artifact keys `public-demo.yml` writes; it never reads that bucket). Checked by synthesizing `CatalystPublicDemoStack` offline with `CDK_CONTEXT_JSON` and reading the `GitHubPublisher` policy. Not deployed.

- 2026-10-29: Item 14. `ci.yml` release-path check diffs against the head SHA of the last successful `main` CI run (`gh run list --status success`; the `frontend-ci` job gains `actions: read`). Publishes when the lookup fails, returns nothing, or the base commit is missing (force push); no `git fetch` of an unreachable commit. Verified locally by running the extracted step against a scratch repository with a stubbed `gh`: failed code push then docs push → publish; docs-only after a green run → skip; empty lookup, failed lookup, missing base and manual dispatch → publish. Hosted run still unverified. AGENTS.md CI paragraph updated.

- 2026-10-29: Item 13.
  - Screener: requests 250 rows (the yfinance maximum) and filters them on quote fields with no extra requests; `get_info()` enrichment stays capped at 40. Its relative-volume test had the item-1 flaw (30 minutes of volume against a full-day average), so during the session the average is now scaled by `expected_volume_fraction` at the quote's own `regularMarketTime`; events carry `relative_volume_basis` and `screener_rows_requested`.
  - Whale: maps `Open Int`, `Vol/OI` and `Last Trade` to `open_interest`, `vol_oi_ratio` (the Gatekeeper's existing field name) and `last_trade`. Their text-binding names are unverified, so these optional cells read the first rendered binding instead of a guessed name. **Still to verify on the next EC2 run:** the fields are populated in the retained hunter log.
  - Tests: `test_yahoo_screener.py` (250-row request, rows beyond the enrichment cap, intraday projection) and the recorded production header fixture in `test_provider_errors.py`. Python 401 passed; ruff clean.

- 2026-10-29: Item 11. New `hunters/common/tickers.py` `canonical_ticker`: Yahoo form (`BRK.B`/`BRK/B` → `BRK-B`), exchange prefixes and `:US`/`.US` stripped, any suffix outside US share classes/warrants/units rejected (`T.TO`, `SHEL.L`, `7203.T` → None), `NONE`/`N/A` rejected.
  - Used by `GatekeeperService.normalize_ticker` (the one point every downstream ticker passes through: AI, engine, database and resolver take the ticker from the triage payload, so the engine and resolver need no change), the whale hunter (no longer deletes the class separator: `BRK.B` was `BRKB`), the biotech table parser (replaces `_clean_ticker`, which stripped foreign suffixes), the PDUFA parser, the drifter (foreign FMP symbols are skipped before any liquidity lookup) and the insider parser.
  - `gatekeeper/Dockerfile` and `deploy/Dockerfile.pipeline` copy `hunters/common/tickers.py`; a deployment test guards both.
  - Tests: new `tests/test_tickers.py`; Gatekeeper expectations updated. Python 399 passed; ruff clean.

- 2026-10-29: Item 9; part of B11 and item 20.
  - New `resolver/outcome.py` holds the one rule: walk unadjusted daily bars from the session after entry (New York dates), stop before target on each bar, fill at the stop/target or at the open on a gap, expire at the last close after `MAX_HOLDING_DAYS` (14).
  - `resolver/trade_resolver.py` fetches daily bars once per ticker (`fetch_daily_bars`) and calls `resolve_from_bars`; the unbounded stale price cache is gone and failed fetches log a warning (B11's remaining part: orders whose bars never arrive still never expire).
  - `api/routers/performance.py` uses the same function and expiry for ACTIVE orders; modeled P&L uses the fill price.
  - `TradeList.tsx` shows the stored resolver status in snapshot mode. Deleted the unused frontend `deriveStatus`/`derivePnlPct` (a third rule).
  - Tests: `test_trade_resolver.py` (14), `test_performance_api.py` (17), `TradeList.test.tsx` snapshot case. Full suites: Python 380 passed, Vitest 186 passed, typecheck, lint and repo-wide ruff clean.

- 2026-10-29: Items 12 and 15; parts of B15 and B21.
  - Item 12: `liquidity_lookup.skipped_counts` (per hunter, via `CURRENT_HUNTER`) and a warning per failed lookup; hunter report gains `liquidity_skipped`; Gatekeeper and AI sends wait for the broker ack (`.get(timeout=30)`).
  - Item 15: `trap 'exit 143' TERM INT`; stale `reports/*.json` and `exports/*.json` removed at start; hunters job wrapped in `timeout --kill-after=30s 900s`; next launcher installed only after manifest promotion; the launcher exports `BOOTSTRAP_LOG` and the batch appends it to the uploaded log (takes effect from the second run after release, because the first run uses the previously installed launcher). Skipped `compose pull --policy missing`: the worker's Compose version is unverified and an unknown flag would fail every run.
  - Tests: `bash -n` on every `deploy/*.sh` and launcher-ordering test in `test_public_deployment.py`. S3 calls still have no deadline (rest of B15); CI still has no `bash -n` step (rest of B21, covered by pytest instead).
- 2026-10-29: Items 3, 4, 7, 8 and B7.
  - AI layer: `BudgetExhaustedError` (America/New_York budget day); only `ServerError`/timeouts/transport errors retried; grounding checked only for scores at or above the threshold; final cause logged; prompt keeps the schema by truncating only signal data at 16,000 characters; prompt states long-only conviction and grounding requirement; catalyst and sentiment allowlists; `serialize_signal` replaces NaN/inf and uses `allow_nan=False`. `MODEL_ALIASES` still present (item 20).
  - Gatekeeper `to_float` returns the default for non-finite values.
  - Persistence: `decode_message` never raises; `process_message` seeks back to the failed offset and commits past it after `MAX_PERSIST_ATTEMPTS` (3).
  - Engine: `ErrorHandlingDeserializer`; `news_sentiment` field, bearish skipped; `StrategyRouter.route` returns `Optional` and the BUY fallback is deleted; save before send, cooldown after save; Kelly returns 0 for wrong-side stop/target. New `ValidatedSignalConsumerTest` (4) and Kafka deserializer test. Java: 41 passed.
  - Tests: `test_ai_layer.py`, `test_public_deployment.py`, `test_gatekeeper.py`, `test_persistence.py`.
- 2026-10-29: Items 5, 6 and 18. Resolver compose command is `resolver.main`; `serialize_resolution` uses `default=str`; order detail casts `$2::timestamptz` and reads `sig_row.get("id")`; orders CSV selects the four resolution columns; public CSV guard applies to strings only. Tests: `test_public_deployment.py`, `test_trade_resolver.py`, `test_orders_api.py`, frontend `snapshot.test.ts`.
- 2026-10-29: Items 2, 10 and the code part of 16. `hunters/insider_hunter.py` rewritten (feed paging, rate limit, per-filing errors, row aggregation, all owners, title substrings, 4/A and old-trade skip, 10b5-1 flag); `SEC_USER_AGENT` in `config.py`, `public_demo.py`, `.env.example`, `docker-compose.yml`; `sec` added to `provider_errors`. Tests: `tests/test_hunters.py`, `tests/test_liquidity_lookup.py`, `tests/test_gatekeeper.py` (110 passed); repo-wide ruff clean.
- 2026-10-29: Item 1. `liquidity_lookup.py` rewritten; `relative_volume_basis` added to whale, biotech and drifter payloads; `GATEKEEPER_RVOL_EXEMPT_SOURCES`. New `tests/test_liquidity_lookup.py` (6) and Gatekeeper exemption tests.
- 2026-10-29: Plan created from the audit.
