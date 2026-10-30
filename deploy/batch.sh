#!/bin/bash
set -euo pipefail
umask 077
compose=(docker compose -f /opt/catalyst/current/deploy/compose.batch.yml)
publish_status() {
  python3 - "$1" <<'PY_STATUS'
import json,sys
from datetime import datetime,timezone
from pathlib import Path
Path('/opt/catalyst/public-status.json').write_text(json.dumps({'status':sys.argv[1],'updated_at':datetime.now(timezone.utc).isoformat()}))
PY_STATUS
  aws s3 cp /opt/catalyst/public-status.json "s3://${SITE_BUCKET}/data/status.json" --content-type application/json --cache-control 'no-store,max-age=0' --only-show-errors
}
cleanup() {
  result=$?
  trap - EXIT
  if [ "$result" -ne 0 ]; then publish_status failed || true; fi
  "${compose[@]}" logs --no-color > /opt/catalyst/batch.log 2>&1 || true
  # Finite jobs use --rm, so Compose cannot retrieve their output afterward.
  # Preserve these private logs before publishing or removing any containers.
  for job in baseline hunters export; do
    printf '\nJob output: %s\n' "$job" >> /opt/catalyst/batch.log
    cat "reports/${job}.log" >> /opt/catalyst/batch.log || true
  done
  # This script's own stdout/stderr is the launcher's log, archived before handoff.
  if [ -n "${BOOTSTRAP_LOG:-}" ]; then
    printf '\nLauncher and batch shell output\n' >> /opt/catalyst/batch.log
    cat "$BOOTSTRAP_LOG" >> /opt/catalyst/batch.log || true
  fi
  aws s3 cp /opt/catalyst/batch.log "s3://${ARTIFACT_BUCKET}/logs/$(date -u +%Y%m%dT%H%M%SZ).log" --only-show-errors || true
  "${compose[@]}" down --timeout 30 || true
  # Retain only the image IDs of the active release, including the finite job image.
  python3 - <<'PY_PRUNE' || true
import json,subprocess
from pathlib import Path
release=json.loads(Path('/opt/catalyst/release.json').read_text())
keep=set()
for k in ('pipeline_image','hunters_image','engine_image'):
    found=subprocess.run(['docker','image','inspect',release[k],'--format','{{.Id}}'],capture_output=True,text=True)
    if found.returncode == 0:
        keep.add(found.stdout.strip())
for line in subprocess.check_output(['docker','images','--no-trunc','--format','{{.Repository}}:{{.Tag}} {{.ID}}'],text=True).splitlines():
    tag,image=line.split()
    if '.dkr.ecr.' in tag and image not in keep:
        subprocess.run(['docker','image','rm',tag],check=False)
PY_PRUNE
  exit "$result"
}
trap cleanup EXIT
trap 'exit 143' TERM INT
cd /opt/catalyst/current/deploy
mkdir -p reports exports /opt/catalyst/secrets
chmod 700 reports exports /opt/catalyst/secrets
# A failed export must never leave a previous run's manifest to be uploaded.
rm -f reports/*.json exports/*.json
for job in baseline hunters export; do
  : > "reports/${job}.log"
done
publish_status running
"${compose[@]}" pull
"${compose[@]}" up -d --wait --wait-timeout 240 zookeeper kafka redis timescaledb engine api gatekeeper ai-layer persistence
for topic in raw-events triage-priority validated-signals trade-orders trade-resolutions signal-squeeze signal-insider signal-biotech signal-whale signal-earnings; do
  "${compose[@]}" exec -T kafka kafka-topics --bootstrap-server kafka:29092 --create --if-not-exists --topic "$topic" --partitions 1 --replication-factor 1
done
"${compose[@]}" up -d resolver
"${compose[@]}" run --rm -T snapshot python -m deploy.export_snapshot --baseline 2>&1 | tee reports/baseline.log
timeout --kill-after=30s 900s "${compose[@]}" run --rm -T hunters 2>&1 | tee reports/hunters.log
"${compose[@]}" run --rm -T snapshot 2>&1 | tee reports/export.log
run_id=$(python3 -c 'import json; print(json.load(open("exports/manifest.json"))["run_id"])')
aws s3 cp exports/snapshot.json "s3://${SITE_BUCKET}/data/runs/${run_id}/snapshot.json" --content-type application/json --cache-control 'public,max-age=31536000,immutable' --only-show-errors
"${compose[@]}" exec -T timescaledb sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > /opt/catalyst/database.dump
aws s3 cp /opt/catalyst/database.dump "s3://${ARTIFACT_BUCKET}/backups/latest.dump" --only-show-errors
aws s3 cp exports/manifest.json "s3://${SITE_BUCKET}/data/manifest.json" --content-type application/json --cache-control 'no-store,max-age=0' --only-show-errors
# Atomic manifest promotion follows a successfully uploaded dataset and backup.
publish_status "$(python3 -c 'import json; print(json.load(open("exports/snapshot.json"))["status"])')" || true
echo "Snapshot published: ${run_id}"
# Only a release that has published successfully becomes the next boot's launcher,
# so a broken release cannot replace a working wrapper.
install -m 700 run-worker.sh /opt/catalyst/run-batch.sh
