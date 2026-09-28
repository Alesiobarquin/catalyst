#!/usr/bin/env bash
# Run on the Catalyst EC2 instance after SSH login.
# Usage: curl -fsSL <raw-url> | bash   OR   bash scripts/ec2-bootstrap.sh
set -euo pipefail

REPO_URL="${CATALYST_REPO_URL:-https://github.com/alesiobarquin/catalyst.git}"
INSTALL_DIR="${CATALYST_DIR:-/home/ubuntu/catalyst}"

echo "==> Installing Docker (if needed)"
if ! command -v docker >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y docker.io docker-compose-plugin git
  sudo usermod -aG docker ubuntu
  echo "Docker installed. Log out and back in, then re-run this script."
  exit 0
fi

echo "==> Cloning or updating repo at ${INSTALL_DIR}"
if [[ -d "${INSTALL_DIR}/.git" ]]; then
  git -C "${INSTALL_DIR}" pull --ff-only
else
  git clone "${REPO_URL}" "${INSTALL_DIR}"
fi

cd "${INSTALL_DIR}"

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo ""
  echo "Created .env from .env.example — edit ${INSTALL_DIR}/.env and set GEMINI_API_KEY (required)."
  echo "Then run: cd ${INSTALL_DIR} && docker compose up -d --build"
  exit 0
fi

echo "==> Starting Catalyst stack"
docker compose up -d --build

echo "==> Health checks"
sleep 10
curl -sf http://localhost:8000/health && echo " API OK" || echo " API not ready yet"
curl -sf http://localhost:8081/actuator/health && echo " Engine OK" || echo " Engine not ready yet"
docker compose ps
