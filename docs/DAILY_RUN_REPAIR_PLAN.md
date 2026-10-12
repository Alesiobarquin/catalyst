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
| Free short-interest source | `java_engine` | EC2 source probe | Add bounded Yahoo screener with unchanged Squeeze thresholds and explicit attribution | Yahoo availability confirmed; collector in progress |
| Source acquisition | `python_ingestion` | EC2 provider evidence | Diagnose source failures, repair parsing and publish safe error details | In progress |
| Integration and EC2 verification | Coordinator | Findings and patches | Retain private job logs, deploy necessary repairs, run a finite batch, verify publication and automatic shutdown | In progress |

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
- Yahoo's supported short-interest query returned 155 candidates. NVAX's quote/info supplied all existing Squeeze inputs; the production collector will use a bounded first-40 subset with the same filters and preserve source timestamps. This probe establishes feed access, not AI validation or profitability.
