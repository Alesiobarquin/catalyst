# EC2 daily-run diagnosis and repairs — October 11, 2026

Scope: the scheduled production batch on `i-0597d111f82782b5d` in `us-east-1`. Verification must use AWS execution evidence; local application startup is outside this task.

## Observed failures

- EventBridge successfully started the worker at 10:00 ET every weekday October 5–9. The worker published snapshots and stopped itself around 10:04 ET. Both schedules are enabled.
- Latest snapshot `20261009T140408Z` used release `46b72a5`: ten raw Insider events, zero triage/validated events, fresh market regime. Squeeze failed with `RuntimeError`; Whale with `TimeoutError` after 99 seconds.
- Archived Compose logs omit the removed finite hunter container. Public reports retain exception types without the provider/status/stage that explains a failure.
- Whale selects numeric cells without identifying the strike and volume headers, which can corrupt source payloads when scraping succeeds.

## Work allocation

| Task | Agent | Dependencies | Work | Status |
| --- | --- | --- | --- | --- |
| Schedule and release audit | `ec2_schedule_audit` | None | Verify Scheduler, CloudTrail, release pointer and boot safeguards | Scheduler confirmed healthy |
| Production Java audit | `java_engine` | Production logs | Check schema and market-data errors without loosening HALT | No engine failure observed |
| Free short-interest source | `java_engine` | EC2 source probe | Add bounded Yahoo screener with unchanged Squeeze thresholds and explicit attribution | EC2 collector returned three matching candidates |
| Source acquisition | `python_ingestion` | EC2 provider evidence | Diagnose source failures, repair parsing and publish safe error details | EC2 parsed eight Barchart contracts; locked biotech data reported explicitly |
| Integration and EC2 verification | Coordinator | Findings and patches | Retain private job logs, deploy necessary repairs, run a finite batch, verify publication and automatic shutdown | Passed; both repaired EC2 releases published and stopped automatically |

## Execution plan

1. Inspect recent snapshots, private logs, schedule events and deployed release.
2. Start the worker for bounded SSM diagnostics. Capture provider HTTP/schema failures and the full batch journal without exposing keys or publishing synthetic data.
3. Repair confirmed collection and reporting defects. Preserve two-source confluence, grounded AI limits, fresh-market HALT, private execution and the shutdown safeguards.
4. Deploy the repaired runtime through an immutable release. Verify on EC2 that all intended source requests are attempted, failures are explicit, the pipeline drains, a snapshot and backup are published, and the worker stops.
5. Record remaining external provider restrictions with their evidence. An organic run can correctly publish zero recommendations when no ticker meets confluence.

No local test results are acceptance evidence for this task. Production verification details will be appended when completed.

## Live provider evidence

SSM browser probes used the deployed x86 hunter image on the EC2 worker:

- Finviz returned HTTP 403 with a Cloudflare verification page. The repair does not bypass it; Yahoo's documented equity screener is an available alternative on EC2.
- Barchart returned HTTP 202 and rendered a div grid, not an HTML table. Its data cells have `role=cell`; quote values live in the open shadow roots of `text-binding` elements, so `inner_text()` is empty. Actual ABR/TSLA option prices, strikes, volume and expiration were visible in those rendered values.
- BioPharmCatalyst returned HTTP 200 with a PDUFA calendar whose headers differ from the old positional parser. Drug/date details can be locked behind provider signup. Locked records must remain unavailable rather than be emitted as catalysts.
- Yahoo's supported short-interest query returned 155 candidates. NVAX's quote/info supplied all existing Squeeze inputs; the production collector uses a bounded first-40 subset with the same filters and preserve source timestamps. This probe establishes feed access, not AI validation or profitability.

## Collector acceptance and release

SSM check `57de431b-61ae-4bfa-87be-a6f4bbc4aeed` ran the repaired source on the EC2 worker against real feeds, with no Kafka writes or trading. Yahoo returned three matching candidates in 2.87 seconds; Barchart returned eight real contracts in 39.15 seconds, including correct strike, option volume and expiration. Biotech returned the fixed subscription error. A transient Barchart verification page was observed in an earlier check; legitimate access restrictions remain visible rather than bypassed. Challenge detection uses rendered text and does not treat dormant script markers as an active failure.

Encrypted SSM runtime version 4 selects `SQUEEZE_PROVIDER=yahoo`; existing credentials, database password and other settings are preserved. Repair `e93ac3a` and formatting correction `7e5b4de` are on main. The initial release stopped at its formatting gate before publishing. The corrected release passed GitHub CI, CodeQL and AWS publication at 01:47:58 UTC on October 12 (October 11 ET). Remote verification passed 342 Python, 36 Java and 188 frontend tests (566 total), lint/format/types and both Next.js builds. The full repaired EC2 batch published `20261012T015207Z`: 31 raw events, four completed hunters, fresh regime, saved backup and logs, and automatic shutdown at 01:52:48 UTC. CloudFront serves the matching manifest. Final access wording was published as `7bbe2a8` at 02:05:45 UTC because the signup gate does not establish whether payment is required; its final EC2 batch published `20261012T021037Z`, again with 31 raw events and four completed hunters, retained job logs/backup and automatic shutdown at 02:11:18 UTC.

## Remaining provider access

BioPharmCatalyst drug/date details require account access; a payment requirement was not verified. No compatible free drop-in source was established: [openFDA Drugs@FDA](https://open.fda.gov/apis/drug/drugsfda/) describes approved products rather than upcoming PDUFA events, and [ClinicalTrials.gov fields](https://clinicaltrials.gov/data-about-studies/csv-download) supply sponsor names and study completion dates rather than stock tickers and scheduled readout announcements. Substituting those dates would change the signal. The repaired collector reports the access requirement explicitly and emits no locked records.

## Follow-up work

- The archived final-run logs explain zero triage: 22 events buffered at one source and nine failed hard filters (one price, eight RVOL). All 31 have recorded outcomes; 18 unique tickers had no cross-hunter overlap. The 20 SEC events comprise seven purchases and 13 sales. Preserve the two-source requirement.
- Determine which authorized BioPharmCatalyst account access unlocks Drug/PDUFA Date. Prepare opt-in private browser-session support if the site's login mechanism supports it. Account creation, verification or paid access remains a user-owned step.
- Repair startup diagnostic coverage and release preparation: publish bootstrap attempt status, retain private failure logs, require a successful fresh release-pointer download and extract each release into a clean staging directory. Update the existing EC2 wrapper explicitly and verify on AWS; changed first-boot user data alone is insufficient.
- Keep the healthy weekday schedules and shutdown safeguards. No missed-start evidence justifies a schedule redesign.
