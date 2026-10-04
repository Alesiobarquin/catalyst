# Catalyst public deployment

Provisioned and verified October 4, 2026 in `us-east-1`. The public site is live, organic scans have published, and both weekday schedules are enabled. The first scheduled tick is October 5; activation has been verified, but that tick has not yet been observed.

Public URL: **https://d36bndaw2y0rrh.cloudfront.net**. The public dashboard is read-only and available while the processing worker is stopped.

## What runs and when

Private S3 and CloudFront serve a static Next.js export. EventBridge Scheduler starts the EC2 worker at **10:00 AM America/New_York, Monday–Friday**. The worker runs the full Docker/Kafka chain once, exports bounded FastAPI responses, uploads a database backup, publishes a manifest, and stops itself. A boot shutdown watchdog runs after 80 minutes; an independent schedule stops the worker at 11:30 AM. Timezone scheduling handles daylight saving time. These are weekday schedules, including market holidays; a holiday can produce zero qualifying signals.

The worker Compose profile declares 12 services: ZooKeeper, Kafka, Redis, TimescaleDB, Gatekeeper, AI Layer, persistence, Java engine, FastAPI, resolver, hunter job, and exporter job. The hunter job starts five concurrent one-sweep tasks. Jobs are finite; all 12 containers are not required to run simultaneously. Executor, notifier, public API ingress, and credential/trading controls are excluded from this deployment.

Public results expose the actual collection time, per-source success/failure, emitted events, per-run Kafka offsets, deployed commit, and fresh regime status. A provider failure is reported as partial. A successful sweep can yield no qualifying events. A failed publication leaves the previous manifest available; `/data/status.json` records attempt state independently and the banner identifies newer failures/running scans; the browser displays collection age and flags data older than 96 hours. Source failures and pipeline errors are also retained in private S3 logs.

The public profile requires two distinct sources in a five-minute window. Gemini 3.8 Flash must supply Google Search grounding and conviction of at least 50; heuristic fallback is disabled. A persistent counter limits requests, including failures and retries, to **two per UTC day**. Prompts are bounded to 24,000 characters and output, including thinking, to 2,048 tokens. No Pro fallback is configured. A transient failure can retry once; both attempts consume the same two-request daily limit. Java's actual Kafka listener executor uses Project Loom virtual threads. An unavailable/stale regime, missing 200-session SMA, or VIX at least 40 halts new recommendations. Half-Kelly allocation is capped at 25% per recommendation on a modeled $100,000 book; this is not an aggregate portfolio exposure limit.

The resolver evaluates `ACTIVE` recommendations against sampled Yahoo prices, with a 14-calendar-day holding limit. Published PnL is modeled recommendation performance, not realized brokerage profit. Daily samples can miss intraday stop/target crossings. Price charts use exported market history; missing data is labeled unavailable rather than synthesized.

## CLI operations

Run from the repository root with the configured AWS CLI identity and `gh` login. The deployment uses no long-lived AWS credentials in GitHub.

```bash
# Inspect worker state and the public URL.
.venv/bin/python scripts/public_demo.py status

# Start one additional finite run. An already-active worker is not started twice.
.venv/bin/python scripts/public_demo.py run

# Rotate keys from local .env into encrypted SSM, preserving the database password.
# This also configures GitHub deployment variables.
.venv/bin/python scripts/public_demo.py configure

# Build, verify, and publish an immutable release through GitHub Actions.
gh workflow run public-demo.yml --ref main --repo Alesiobarquin/catalyst
gh run list --workflow public-demo.yml --repo Alesiobarquin/catalyst

# Inspect both schedules, including their timezone and enabled state.
aws scheduler get-schedule --name catalyst-daily-start
aws scheduler get-schedule --name catalyst-daily-hard-stop

# Obtain all provisioned resource identifiers.
aws cloudformation describe-stacks --stack-name CatalystPublicDemoStack \
  --query 'Stacks[0].Outputs' --output table

# Check the active public dataset without starting the worker.
curl -fsS https://d36bndaw2y0rrh.cloudfront.net/data/manifest.json
```

Main-branch pushes touching runtime, frontend, or deployment files run release CI. Documentation-only changes do not rebuild images. Each release verifies Python, Java, and frontend tests, builds native x86 images on GitHub, pushes immutable commit tags to ECR, uploads the worker archive/release pointer, and publishes static assets. Data is initialized only when no public manifest exists; code releases preserve the latest scan. The worker downloads the latest successful release on each boot. A failed build does not replace the previous release pointer. Runtime package constraints are in `deploy/constraints.txt` and the frontend uses `npm ci`.

Inter and JetBrains Mono are bundled locally with their SIL OFL licenses and pinned source hashes, eliminating a build-time Google Fonts dependency after final CI exposed a Turbopack font-loader failure. The local and static builds share the same layout and font files.

## Provision or update infrastructure

```bash
cd infra
.venv/bin/pip install -r requirements.txt
PATH="$PWD/.venv/bin:$PATH" npx --yes aws-cdk diff -c publicDemo=true
PATH="$PWD/.venv/bin:$PATH" npx --yes aws-cdk deploy -c publicDemo=true \
  -c enableDailyScan=true --require-approval never
```

Repository defaults select the new public stack with enabled daily schedules. Explicit `publicDemo=false` selects the legacy stack. The explicit `enableDailyScan` context controls both new schedules. Before first activation, deploy with `-c enableDailyScan=false` to keep schedules disabled, configure encrypted runtime keys, publish a release, and verify a real run. Use `-c enableDailyScan=false` when deliberately pausing collection. The static site remains available.

Worker bootstrap is declarative in `infra/worker_bootstrap.sh`; existing instances do not automatically rerun first-boot user data when that file changes. Runtime scripts inside the versioned worker archive update every boot. Manage the private worker through SSM, not SSH. Its security group has no inbound ports; temporary public IPv4 provides provider/API access without a NAT Gateway or retained Elastic IP.

## Logs, backups, and recovery

The artifact bucket name is the `ArtifactBucket` stack output. It is private and encrypted. `logs/` contains container output for each run (14-day retention); `backups/latest.dump` is a PostgreSQL custom-format backup uploaded before manifest promotion. S3 versioning retains previous backup versions for seven days. Do not publish those logs or backups; provider errors can include credentials.

```bash
aws s3 ls s3://ARTIFACT_BUCKET/logs/
aws s3 cp s3://ARTIFACT_BUCKET/backups/latest.dump /tmp/catalyst-database.dump

# Read service status through SSM while the worker is running.
aws ssm send-command --instance-ids i-0597d111f82782b5d \
  --document-name AWS-RunShellScript \
  --parameters '{"commands":["systemctl show catalyst-batch --property=ActiveState --property=SubState","df -h /","free -m"]}'
```

Replace the literal `ARTIFACT_BUCKET` placeholder with the stack output. To recover a failed run, inspect its private logs, fix/release the code or rotate configuration, then start the worker. Database and broker volumes persist between stops. For a disk replacement, restore `latest.dump` into a fresh TimescaleDB using `pg_restore` after provisioning the expected roles and extensions; verify the two hypertables before publishing. Restoration intentionally requires an operator because it changes database state.

To roll back a worker release, select an existing private `releases/COMMIT/worker.tgz` and matching ECR tags and upload their release JSON as `release.json`. ECR retains only two releases, so verify that all three images still exist before selecting a rollback. Restoring an older site/data manifest is possible using S3 versions; do not delete the active dataset while its manifest references it.

## Costs and account state

Planning assumptions: `us-east-1`, 22 weekday runs, at most one hour each, light portfolio traffic, no paid feed subscriptions. Credits and tax are excluded.

| Component | Monthly planning amount |
|---|---:|
| `m6a.large`, $0.0864/hour × 22 hours | $1.90 |
| 40 GiB encrypted gp3, $0.08/GiB-month | $3.20 |
| Temporary public IPv4, $0.005/hour × 22 | $0.11 |
| ECR, S3, logs, backups, scheduling, light CloudFront traffic | $0.70–$1.20 allowance |
| Retained old 8 GiB root disk | $0.64 |
| **AWS target including retained legacy disk** | **About $6.55–$7.05** |
| Gemini request/token allowance | $0–$2.50 |
| **Combined target** | **About $7–$9.55** |

Normal short runs should cost less than the one-hour assumption. Manual/setup runs, unusual public traffic, other account resources, tax, or persistent provider failures can raise costs. The account-wide `CatalystMonthly10USD` AWS Budget is visible in the console; no email recipient was configured. A Budget does not hard-cap billing. Watchdogs, finite jobs, two retained ECR releases, pruning of old worker images, and the persistent AI request cap provide practical usage limits.

Prices were checked against [EC2](https://aws.amazon.com/ec2/pricing/on-demand/), [EBS](https://aws.amazon.com/ebs/pricing/), [public IPv4](https://aws.amazon.com/vpc/pricing/), [ECR](https://aws.amazon.com/ecr/pricing/), and [Gemini](https://ai.google.dev/gemini-api/docs/pricing). Gemini's listed 3.8 Flash input/output prices increase January 1, 2027; recheck this allowance before then. Grounding search allowances are shared with other uses of the Google project/account and cannot be guaranteed exclusively for Catalyst.

The AWS account was a Free plan scheduled to expire October 21, 2026. It was upgraded through AWS CLI to the Paid usage plan so hosting can continue; the existing approximately $75.33 credits were preserved. Paid usage can incur charges after credits. The original EC2 instance `i-0194d6c0b8f0e191a` was stopped after recovery; no containers were running and its root disk was full. Its repository was backed up privately at `backups/legacy-repository-20261004.tgz`. Its 8 GiB root disk is retained, and both legacy EventBridge schedules remain disabled. No old data was deleted. The temporary inspection role/profile and SSH allowance were removed.

## Verification record

- Local and fresh Linux release CI: 301 Python tests, 36 Java tests, 156 frontend tests (493 total); lint, Python formatting, TypeScript, and static export pass. Release [`ea5f3ef`](https://github.com/Alesiobarquin/catalyst/actions/runs/37242671992) built and published all three native x86 images successfully.
- Public HTTPS routes `/`, `/signals`, `/analytics`, `/architecture` respond successfully. `/settings` and `/testing/inject` return 404. Direct S3 website content access returns 403.
- Updated Gemini key passed a real Search-grounded 3.8 Flash request.
- Latest organic run [`20261004T231915Z`](https://d36bndaw2y0rrh.cloudfront.net/data/runs/20261004T231915Z/snapshot.json): 30 raw events (29 SEC, one FMP), three completed hunters and two unavailable feeds (Finviz blocked, Barchart timeout). The concurrent hunter batch took about 97 seconds. Fresh SPY/200-session SMA/VIX data was exported. Zero events passed strict confluence; AI validation and sizing therefore produced no recommendations. No synthetic data or paper execution was used.
- Cold-start migrations, both TimescaleDB hypertables, private FastAPI readiness, database backup before manifest publication, and automatic shutdown were observed. The first boot exposed a Flyway baseline error and the first publication exposed a double-encoded VIX URL; both were fixed and the latter covered by an HTTP regression test. During the batch, total memory use was about 2.4 GiB on the 8 GiB worker, with no OOM. The site remained available after shutdown.
- Schedule readback confirms both `ENABLED`: 10:00 start and 11:30 hard stop, weekdays in `America/New_York`. Worker security-group ingress is empty; the latest backup is privately encrypted; the legacy worker is stopped and its schedules remain disabled. See the [sanitized deployment evidence](verification/2026-10-04-deployment.json) and [first publication](verification/2026-10-04-first-aws-run.json).
- HTTPS routes and referenced production assets were checked by HTTP, and the frontend test suites passed. Interactive browser/visual verification was not completed because browser automation was unavailable in this session.
- No live 50–100 events/min measurement has been established. The résumé figure is not presented as observed daily scan volume; any controlled throughput test must be separately labeled.
