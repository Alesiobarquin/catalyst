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
@@RUN_WORKER@@
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
