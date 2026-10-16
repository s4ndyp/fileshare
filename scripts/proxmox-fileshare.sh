#!/usr/bin/env bash
#
# Proxmox VE: maak een LXC container aan en deploy Fileshare via Docker Compose.
# Gebruik op de Proxmox host (root):
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/s4ndyp/fileshare/main/scripts/proxmox-fileshare.sh)"
#
set -euo pipefail

APP="fileshare"
DEFAULT_REPO="https://github.com/s4ndyp/fileshare.git"
DEFAULT_BRANCH="main"

CTID="${CTID:-}"
HOSTNAME="${HOSTNAME:-fileshare}"
CORES="${CORES:-2}"
RAM="${RAM:-1024}"
DISK="${DISK:-8}"
BRIDGE="${BRIDGE:-vmbr0}"
STORAGE="${STORAGE:-local-lvm}"
TEMPLATE_STORAGE="${TEMPLATE_STORAGE:-local}"
IP="${IP:-dhcp}"
GATEWAY="${GATEWAY:-}"
FILESHARE_PORT="${FILESHARE_PORT:-3000}"
REPO_URL="${REPO_URL:-$DEFAULT_REPO}"
REPO_BRANCH="${REPO_BRANCH:-$DEFAULT_BRANCH}"
PASSWORD="${PASSWORD:-}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

msg() { echo -e "${GREEN}▸${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }
err() { echo -e "${RED}✗${NC} $*" >&2; }

usage() {
  cat <<EOF
Gebruik: proxmox-fileshare.sh [opties]

  --ctid ID           Container ID (default: volgende vrije ID)
  --hostname NAME     Hostname (default: fileshare)
  --cores N           CPU cores (default: 2)
  --ram MB            Geheugen in MB (default: 1024)
  --disk GB           Schijfgrootte in GB (default: 8)
  --bridge BR         Netwerk bridge (default: vmbr0)
  --storage NAME      Storage voor rootfs (default: local-lvm)
  --template-storage  Storage voor templates (default: local)
  --ip CIDR|dhcp      IP (default: dhcp)
  --gateway IP        Gateway (alleen bij statisch IP)
  --port N            Host poort voor Fileshare (default: 3000)
  --repo URL          Git repo (default: $DEFAULT_REPO)
  --branch NAME       Git branch (default: main)
  --password PASS     Root wachtwoord LXC (default: willekeurig)

Omgeving variabelen: dezelfde namen als hierboven (CTID, HOSTNAME, …).
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ctid) CTID="$2"; shift 2 ;;
    --hostname) HOSTNAME="$2"; shift 2 ;;
    --cores) CORES="$2"; shift 2 ;;
    --ram) RAM="$2"; shift 2 ;;
    --disk) DISK="$2"; shift 2 ;;
    --bridge) BRIDGE="$2"; shift 2 ;;
    --storage) STORAGE="$2"; shift 2 ;;
    --template-storage) TEMPLATE_STORAGE="$2"; shift 2 ;;
    --ip) IP="$2"; shift 2 ;;
    --gateway) GATEWAY="$2"; shift 2 ;;
    --port) FILESHARE_PORT="$2"; shift 2 ;;
    --repo) REPO_URL="$2"; shift 2 ;;
    --branch) REPO_BRANCH="$2"; shift 2 ;;
    --password) PASSWORD="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) err "Onbekende optie: $1"; usage; exit 1 ;;
  esac
done

if [[ "$(id -u)" -ne 0 ]]; then
  err "Dit script moet als root op de Proxmox host draaien."
  exit 1
fi

if ! command -v pveversion >/dev/null 2>&1; then
  err "Geen Proxmox VE gedetecteerd (pveversion ontbreekt)."
  exit 1
fi

if [[ -z "$CTID" ]]; then
  CTID="$(pvesh get /cluster/nextid)"
fi

if [[ -z "$PASSWORD" ]]; then
  PASSWORD="$(openssl rand -base64 18 | tr -dc 'a-zA-Z0-9' | head -c 16)"
fi

TEMPLATE="debian-12-standard_12.7-1_amd64.tar.zst"
if ! pveam list "$TEMPLATE_STORAGE" | grep -q "$TEMPLATE"; then
  msg "Download Debian 12 LXC template…"
  pveam update
  pveam download "$TEMPLATE_STORAGE" "$TEMPLATE"
fi

NET_CONFIG="name=eth0,bridge=${BRIDGE},ip=${IP}"
if [[ "$IP" != "dhcp" && -n "$GATEWAY" ]]; then
  NET_CONFIG="${NET_CONFIG},gw=${GATEWAY}"
fi

if pct status "$CTID" >/dev/null 2>&1; then
  err "Container $CTID bestaat al."
  exit 1
fi

msg "Maak LXC $CTID ($HOSTNAME) aan…"
pct create "$CTID" "${TEMPLATE_STORAGE}:vztmpl/${TEMPLATE}" \
  --hostname "$HOSTNAME" \
  --cores "$CORES" \
  --memory "$RAM" \
  --swap 512 \
  --rootfs "${STORAGE}:${DISK}" \
  --net0 "$NET_CONFIG" \
  --unprivileged 1 \
  --features nesting=1,keyctl=1 \
  --onboot 1 \
  --password "$PASSWORD" \
  --tags "fileshare;docker"

msg "Start container…"
pct start "$CTID"

msg "Wacht op netwerk…"
for _ in $(seq 1 30); do
  if pct exec "$CTID" -- ping -c1 -W1 1.1.1.1 >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

msg "Installeer Docker en Fileshare in de container…"
pct exec "$CTID" -- bash -s <<INSTALL
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=\$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
systemctl enable --now docker

rm -rf /opt/fileshare
git clone --depth 1 --branch ${REPO_BRANCH} ${REPO_URL} /opt/fileshare
cd /opt/fileshare
echo "FILESHARE_PORT=${FILESHARE_PORT}" > /opt/fileshare/.env
docker compose build
docker compose up -d
INSTALL

CT_IP="$(pct exec "$CTID" -- hostname -I 2>/dev/null | awk '{print $1}')"

echo ""
echo -e "${GREEN}Fileshare is geïnstalleerd.${NC}"
echo "  Container ID : $CTID"
echo "  Hostname     : $HOSTNAME"
echo "  Root wachtw. : $PASSWORD"
echo "  URL          : http://${CT_IP}:${FILESHARE_PORT}/"
if [[ "$IP" == "dhcp" ]]; then
  echo "  (of via host IP als poort ${FILESHARE_PORT} is doorgestuurd)"
fi
echo ""
echo "Beheer in de container:"
echo "  pct enter $CTID"
echo "  cd /opt/fileshare && docker compose logs -f"
