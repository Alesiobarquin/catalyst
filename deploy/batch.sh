#!/bin/bash
set -euo pipefail
cd /opt/catalyst/current/deploy
mkdir -p reports exports
chmod 700 reports exports
compose=(docker compose -f compose.batch.yml)
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
publish_status running
"${compose[@]}" pull
"${compose[@]}" up -d --wait --wait-timeout 240 zookeeper kafka redis timescaledb engine api gatekeeper ai-layer persistence
for topic in raw-events triage-priority validated-signals trade-orders trade-resolutions signal-squeeze signal-insider signal-biotech signal-whale signal-earnings; do
  "${compose[@]}" exec -T kafka kafka-topics --bootstrap-server kafka:29092 --create --if-not-exists --topic "$topic" --partitions 1 --replication-factor 1
done
"${compose[@]}" up -d resolver
"${compose[@]}" run --rm -T snapshot python -m deploy.export_snapshot --baseline
"${compose[@]}" run --rm -T hunters
"${compose[@]}" run --rm -T snapshot
run_id=$(python3 -c 'import json; print(json.load(open("exports/manifest.json"))["run_id"])')
aws s3 cp exports/snapshot.json "s3://${SITE_BUCKET}/data/runs/${run_id}/snapshot.json" --content-type application/json --cache-control 'public,max-age=31536000,immutable' --only-show-errors
"${compose[@]}" exec -T timescaledb sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > /opt/catalyst/database.dump
aws s3 cp /opt/catalyst/database.dump "s3://${ARTIFACT_BUCKET}/backups/latest.dump" --only-show-errors
aws s3 cp exports/manifest.json "s3://${SITE_BUCKET}/data/manifest.json" --content-type application/json --cache-control 'no-store,max-age=0' --only-show-errors
# Atomic manifest promotion follows a successfully uploaded dataset and backup.
publish_status "$(python3 -c 'import json; print(json.load(open("exports/snapshot.json"))["status"])')" || true
echo "Snapshot published: ${run_id}"
