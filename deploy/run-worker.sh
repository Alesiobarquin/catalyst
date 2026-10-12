#!/bin/bash
# Installed as /opt/catalyst/run-batch.sh; bootstrap failures stay observable.
set -euo pipefail
umask 077
source /opt/catalyst/environment
worker_root=/opt/catalyst
exec 9>"${worker_root}/run.lock"
flock -n 9 || exit 0

bootstrap_stage=watchdog
bootstrap_stamp=$(date -u +%Y%m%dT%H%M%SZ)
bootstrap_log="${worker_root}/bootstrap-${bootstrap_stamp}-$$.log"
fresh_release=
fresh_archive=
runtime_file=
session_file=
staged_current=
previous_current=
exec >>"$bootstrap_log" 2>&1

aws_cli() {
  timeout --kill-after=5s 60s aws "$@" --cli-connect-timeout 10 --cli-read-timeout 20
}

publish_bootstrap_status() {
  python3 - "$1" "$bootstrap_stage" "${worker_root}/public-status.json" <<'PY_STATUS'
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

Path(sys.argv[3]).write_text(json.dumps({
    'status': sys.argv[1],
    'updated_at': datetime.now(timezone.utc).isoformat(),
    'stage': sys.argv[2],
}))
PY_STATUS
  aws_cli s3 cp "${worker_root}/public-status.json" "s3://${SITE_BUCKET}/data/status.json" \
    --content-type application/json --cache-control 'no-store,max-age=0' --only-show-errors
}

archive_bootstrap_log() {
  aws_cli s3 cp "$bootstrap_log" \
    "s3://${ARTIFACT_BUCKET}/logs/bootstrap-${bootstrap_stamp}-$$.log" --only-show-errors
}

cleanup_bootstrap_paths() {
  for path in "$fresh_release" "$fresh_archive" "$runtime_file" "$session_file"; do
    if [ -n "$path" ]; then rm -f -- "$path"; fi
  done
  # Only directories created by this invocation are ever removed here.
  if [ -n "$staged_current" ]; then rm -rf -- "$staged_current"; fi
  if [ -n "$previous_current" ]; then
    if [ ! -e "${worker_root}/current" ]; then
      mv -- "$previous_current" "${worker_root}/current"
    else
      rm -rf -- "$previous_current"
    fi
  fi
}

bootstrap_exit() {
  bootstrap_result=$1
  trap - EXIT
  set +e
  if [ "$bootstrap_result" -ne 0 ]; then
    printf 'Bootstrap failed at stage: %s\n' "$bootstrap_stage"
    publish_bootstrap_status failed
  fi
  archive_bootstrap_log
  cleanup_bootstrap_paths
  exit "$bootstrap_result"
}
trap 'bootstrap_exit $?' EXIT

shutdown -h +80
cd "$worker_root"
publish_bootstrap_status running

bootstrap_stage=release-download
printf 'Bootstrap stage: %s\n' "$bootstrap_stage"
fresh_release=$(mktemp "${worker_root}/release.XXXXXX")
release_fetched=false
# The complete retry window is at most 440 seconds, including timeout grace.
for attempt in $(seq 1 10); do
  if timeout --kill-after=5s 30s aws s3 cp "s3://${ARTIFACT_BUCKET}/release.json" \
    "$fresh_release" --only-show-errors --cli-connect-timeout 10 --cli-read-timeout 20; then
    release_fetched=true
    break
  fi
  if [ "$attempt" -lt 10 ]; then sleep 10; fi
done
if [ "$release_fetched" != true ]; then
  printf 'The current release pointer could not be downloaded.\n'
  exit 1
fi

bootstrap_stage=release-validation
python3 - "$fresh_release" <<'PY_RELEASE'
import json
import os
import re
import sys
from pathlib import Path

try:
    release = json.loads(Path(sys.argv[1]).read_text())
    commit = release['commit']
    if not isinstance(commit, str) or not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise ValueError
    if release['archive_key'] != f'releases/{commit}/worker.tgz':
        raise ValueError
    region = re.escape(os.environ['AWS_DEFAULT_REGION'])
    registries = set()
    for name in ('pipeline', 'hunters', 'engine'):
        image = release[name + '_image']
        pattern = rf'([0-9]{{12}}\.dkr\.ecr\.{region}\.amazonaws\.com)/catalyst-{name}:{commit}'
        match = re.fullmatch(pattern, image) if isinstance(image, str) else None
        if match is None:
            raise ValueError
        registries.add(match.group(1))
    if len(registries) != 1:
        raise ValueError
except Exception:
    raise SystemExit('Invalid release metadata') from None
PY_RELEASE

archive_key=$(python3 - "$fresh_release" <<'PY_ARCHIVE'
import json, sys
from pathlib import Path
print(json.loads(Path(sys.argv[1]).read_text())['archive_key'])
PY_ARCHIVE
)
bootstrap_stage=archive-download
printf 'Bootstrap stage: %s\n' "$bootstrap_stage"
fresh_archive=$(mktemp "${worker_root}/archive.XXXXXX")
aws_cli s3 cp "s3://${ARTIFACT_BUCKET}/${archive_key}" "$fresh_archive" --only-show-errors

bootstrap_stage=archive-extract
staged_current=$(mktemp -d "${worker_root}/staging.XXXXXX")
python3 - "$fresh_archive" <<'PY_ARCHIVE_VALIDATE'
import sys
import tarfile
from pathlib import PurePosixPath

try:
    with tarfile.open(sys.argv[1], 'r:gz') as archive:
        for member in archive.getmembers():
            path = PurePosixPath(member.name)
            if path.is_absolute() or '..' in path.parts or not path.parts or path.parts[0] != 'deploy':
                raise ValueError
            if not (member.isfile() or member.isdir()):
                raise ValueError
except Exception:
    raise SystemExit('Invalid worker archive') from None
PY_ARCHIVE_VALIDATE
tar -xzf "$fresh_archive" --no-same-owner --no-same-permissions -C "$staged_current"
test -f "${staged_current}/deploy/batch.sh"
test -f "${staged_current}/deploy/compose.batch.yml"
test -f "${staged_current}/deploy/run-worker.sh"

# These host bind mounts survive clean runtime promotion. Docker named volumes
# keep the existing catalyst-batch project name from compose.batch.yml.
bootstrap_stage=durable-directories
for directory in reports exports; do
  mkdir -p "${worker_root}/${directory}"
  chmod 700 "${worker_root}/${directory}"
  if [ -d "${worker_root}/current/deploy/${directory}" ] && \
    [ ! -L "${worker_root}/current/deploy/${directory}" ]; then
    cp -a "${worker_root}/current/deploy/${directory}/." "${worker_root}/${directory}/"
  fi
  rm -rf -- "${staged_current}/deploy/${directory}"
  ln -s "${worker_root}/${directory}" "${staged_current}/deploy/${directory}"
done
mkdir -p "${worker_root}/secrets"
chmod 700 "${worker_root}/secrets"

bootstrap_stage=runtime-configuration
runtime_file=$(mktemp "${worker_root}/runtime.XXXXXX")
aws_cli ssm get-parameter --name "$RUNTIME_PARAMETER" --with-decryption \
  --query Parameter.Value --output text > "$runtime_file"
python3 - "$runtime_file" "$fresh_release" "${staged_current}/deploy/.env" <<'PY_ENV'
import json
import re
import sys
from pathlib import Path

try:
    runtime = json.loads(Path(sys.argv[1]).read_text())
    release = json.loads(Path(sys.argv[2]).read_text())
    runtime.update(
        PIPELINE_IMAGE=release['pipeline_image'],
        HUNTERS_IMAGE=release['hunters_image'],
        ENGINE_IMAGE=release['engine_image'],
        RELEASE_COMMIT=release['commit'],
    )
    session_key = runtime.get('BIOPHARM_STORAGE_STATE_KEY', '')
    if session_key not in ('', 'secrets/biopharm-storage-state.json'):
        raise ValueError
    runtime.pop('BIOPHARM_STORAGE_STATE_FILE', None)
    if session_key:
        runtime['BIOPHARM_STORAGE_STATE_FILE'] = '/run/secrets/biopharm-storage-state.json'
    lines = []
    for key, value in runtime.items():
        text = str(value)
        if not re.fullmatch(r'[A-Z][A-Z0-9_]*', key) or any(char in text for char in '\n\r\0'):
            raise ValueError
        # Compose decodes quoted escapes and interpolates $. Escaping each dollar
        # keeps credentials and other literal values intact, including $/#/spaces.
        quoted = json.dumps(text, ensure_ascii=False).replace('$', r'\$')
        lines.append(f'{key}={quoted}')
    environment = Path(sys.argv[3])
    environment.write_text('\n'.join(lines) + '\n')
    environment.chmod(0o600)
except Exception:
    raise SystemExit('Invalid runtime configuration') from None
PY_ENV

bootstrap_stage=provider-session
session_key=$(python3 - "$runtime_file" <<'PY_SESSION_KEY'
import json, sys
from pathlib import Path
print(json.loads(Path(sys.argv[1]).read_text()).get('BIOPHARM_STORAGE_STATE_KEY', ''))
PY_SESSION_KEY
)
if [ -n "$session_key" ]; then
  session_file=$(mktemp "${worker_root}/secrets/biopharm.XXXXXX")
  if aws_cli s3 cp "s3://${ARTIFACT_BUCKET}/${session_key}" "$session_file" --only-show-errors; then
    chmod 600 "$session_file"
    mv -- "$session_file" "${worker_root}/secrets/biopharm-storage-state.json"
    session_file=
  else
    # An unavailable optional account must not stop the other four hunters.
    # Keep FILE configured so Biotech reports its explicit session error; remove
    # stale credentials rather than silently reusing a previous login.
    printf 'Configured provider session unavailable; Biotech will report the failure.\n'
    rm -f -- "${worker_root}/secrets/biopharm-storage-state.json" "$session_file"
    session_file=
  fi
else
  rm -f -- "${worker_root}/secrets/biopharm-storage-state.json"
fi

bootstrap_stage=registry-login
registry=$(python3 - "$fresh_release" <<'PY_REGISTRY'
import json, sys
from pathlib import Path
print(json.loads(Path(sys.argv[1]).read_text())['pipeline_image'].split('/')[0])
PY_REGISTRY
)
aws_cli ecr get-login-password | timeout --kill-after=5s 60s \
  docker login --username AWS --password-stdin "$registry"

bootstrap_stage=runtime-promotion
if [ -e "${worker_root}/current" ]; then
  previous_current=$(mktemp -d "${worker_root}/previous.XXXXXX")
  rmdir "$previous_current"
  mv -- "${worker_root}/current" "$previous_current"
fi
mv -- "$staged_current" "${worker_root}/current"
staged_current=
mv -- "$fresh_release" "${worker_root}/release.json"
fresh_release=

bootstrap_stage=batch-handoff
printf 'Bootstrap completed; handing off to the batch.\n'
archive_bootstrap_log || true
cleanup_bootstrap_paths
# A successful exec resets the shell trap. Keeping it until that point also
# records a failed handoff if the interpreter cannot be executed.
exec bash "${worker_root}/current/deploy/batch.sh"
