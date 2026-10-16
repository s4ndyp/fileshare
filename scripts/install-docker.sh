#!/usr/bin/env bash
#
# Installeer/update Fileshare met Docker Compose op een bestaande Debian/Ubuntu machine
# of binnen een LXC (niet op Proxmox host zelf vereist).
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/s4ndyp/fileshare/main/scripts/install-docker.sh)"
#
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/fileshare}"
FILESHARE_PORT="${FILESHARE_PORT:-3000}"
REPO_URL="${REPO_URL:-https://github.com/s4ndyp/fileshare.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"

echo "▸ Fileshare installeren in ${INSTALL_DIR}…"

if ! command -v docker >/dev/null 2>&1; then
  echo "▸ Docker niet gevonden — installeren…"
  curl -fsSL https://get.docker.com | sh
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin ontbreekt. Installeer docker-compose-plugin en probeer opnieuw."
  exit 1
fi

if [[ -d "$INSTALL_DIR/.git" ]]; then
  git -C "$INSTALL_DIR" fetch origin "$REPO_BRANCH"
  git -C "$INSTALL_DIR" checkout "$REPO_BRANCH"
  git -C "$INSTALL_DIR" pull --ff-only
else
  rm -rf "$INSTALL_DIR"
  git clone --depth 1 --branch "$REPO_BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
echo "FILESHARE_PORT=${FILESHARE_PORT}" > .env
docker compose build
docker compose up -d

echo "▸ Klaar. Open http://$(hostname -I | awk '{print $1}'):${FILESHARE_PORT}/"
