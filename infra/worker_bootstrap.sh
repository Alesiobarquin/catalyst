#!/bin/bash
set -euo pipefail
# A boot watchdog runs even if bootstrap or image download fails.
shutdown -h +80
dnf install -y docker python3
systemctl enable --now docker
mkdir -p /usr/local/lib/docker/cli-plugins /opt/catalyst
curl -fsSL https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-x86_64 -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod 755 /usr/local/lib/docker/cli-plugins/docker-compose
cat > /opt/catalyst/environment <<'ENV'
export AWS_DEFAULT_REGION=@@REGION@@
export SITE_BUCKET=@@SITE_BUCKET@@
export ARTIFACT_BUCKET=@@ARTIFACT_BUCKET@@
export RUNTIME_PARAMETER=@@PARAMETER@@
ENV
cat > /opt/catalyst/stop-worker.sh <<'STOP'
#!/bin/bash
source /opt/catalyst/environment
token=$(curl -fsS -X PUT -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' http://169.254.169.254/latest/api/token)
instance=$(curl -fsS -H "X-aws-ec2-metadata-token: $token" http://169.254.169.254/latest/meta-data/instance-id)
aws ec2 stop-instances --instance-ids "$instance" >/dev/null
STOP
cat > /opt/catalyst/run-batch.sh <<'RUN'
#!/bin/bash
set -euo pipefail
source /opt/catalyst/environment
exec 9>/opt/catalyst/run.lock
flock -n 9 || exit 0
shutdown -h +80
umask 077
cd /opt/catalyst
for attempt in $(seq 1 40); do
  aws s3 cp "s3://${ARTIFACT_BUCKET}/release.json" release.json --only-show-errors && break
  sleep 15
done
test -s release.json
archive=$(python3 -c 'import json;print(json.load(open("release.json"))["archive_key"])')
aws s3 cp "s3://${ARTIFACT_BUCKET}/${archive}" release.tgz --only-show-errors
mkdir -p current
tar -xzf release.tgz -C current
aws ssm get-parameter --name "$RUNTIME_PARAMETER" --with-decryption --query Parameter.Value --output text > runtime.json
python3 - <<'PY'
import json
from pathlib import Path
runtime=json.loads(Path('runtime.json').read_text())
release=json.loads(Path('release.json').read_text())
runtime.update(PIPELINE_IMAGE=release['pipeline_image'],HUNTERS_IMAGE=release['hunters_image'],ENGINE_IMAGE=release['engine_image'],RELEASE_COMMIT=release['commit'])
if any('\n' in str(v) or '\r' in str(v) for v in runtime.values()):
    raise ValueError('Invalid multiline environment value')
Path('current/deploy/.env').write_text('\n'.join(f'{k}={v}' for k,v in runtime.items())+'\n')
PY
registry=$(python3 -c 'import json;print(json.load(open("release.json"))["pipeline_image"].split("/")[0])')
aws ecr get-login-password | docker login --username AWS --password-stdin "$registry"
exec bash current/deploy/batch.sh
RUN
chmod 700 /opt/catalyst/*sh /opt/catalyst/environment
cat > /etc/systemd/system/catalyst-batch.service <<'UNIT'
[Unit]
Description=Catalyst daily pipeline and snapshot publication
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service
[Service]
Type=oneshot
ExecStart=/opt/catalyst/run-batch.sh
ExecStopPost=/opt/catalyst/stop-worker.sh
TimeoutStartSec=3600
TimeoutStopSec=90
KillMode=control-group
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now catalyst-batch.service
