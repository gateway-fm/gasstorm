#!/usr/bin/env bash
# Run on the main server. Builds and starts dashboard + load generator + docs.
#
# Required env:
#   CHAIN_SERVER     - IP/hostname of the chain server
#   EXPLORER_SERVER  - IP/hostname of the explorer server
#
# Optional env:
#   COMPOSE_PROFILE  - reth or cdk-erigon (default: reth)
#   CLEAN            - if "1", tear down first

set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${DEPLOY_DIR}/repo"
COMPOSE_PROFILE="${COMPOSE_PROFILE:-reth}"
CLEAN="${CLEAN:-0}"

: "${CHAIN_SERVER:?must be set}"
: "${EXPLORER_SERVER:?must be set}"
export CHAIN_SERVER
export EXPLORER_SERVER
# Public IPs for browser-facing URLs (iframe direct access)
export EXPLORER_SERVER_PUBLIC="${EXPLORER_SERVER_PUBLIC:-${EXPLORER_SERVER}}"
# Public IP for browser-facing URLs. Auto-detects from hostname if not set.
# Override explicitly: MAIN_SERVER_PUBLIC=<your-public-ip>
export MAIN_SERVER_PUBLIC="${MAIN_SERVER_PUBLIC:-$(hostname -I 2>/dev/null | awk '{print $1}' || echo '')}"
# External L1 RPC for Hyperlane bridge (optional — if not set, bridge uses Anvil L1)
export EXTERNAL_L1_RPC="${EXTERNAL_L1_RPC:-}"
export EXTERNAL_L1_WS="${EXTERNAL_L1_WS:-}"
export EXTERNAL_L1_CHAIN_NAME="${EXTERNAL_L1_CHAIN_NAME:-}"
export EXTERNAL_L1_CHAIN_ID="${EXTERNAL_L1_CHAIN_ID:-}"
export EXTERNAL_L1_DISPLAY_NAME="${EXTERNAL_L1_DISPLAY_NAME:-}"

log() { printf '\033[1;34m>>> %s\033[0m\n' "$*"; }

ensure_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    log "installing docker"
    curl -fsSL https://get.docker.com | sh
  fi
  if ! docker compose version >/dev/null 2>&1; then
    echo "docker compose v2 plugin required" >&2
    exit 1
  fi
  if ! docker info >/dev/null 2>&1; then
    log "adding $(whoami) to docker group"
    sudo usermod -aG docker "$(whoami)"
    exec sg docker "$0"
  fi
}

# Create external volumes that docker-compose.loadgen.yaml expects
ensure_volumes() {
  docker volume create gasstorm_privacy-loadtest-config 2>/dev/null || true
  docker volume create gasstorm_hyperlane-config 2>/dev/null || true
  docker volume create gasstorm_hyperlane-relayer-data 2>/dev/null || true
}

main_compose() {
  docker compose \
    -p gasstorm-main \
    -f "${REPO_DIR}/docker/docker-compose.loadgen.yaml" \
    -f "${DEPLOY_DIR}/docker-compose.main.prod.yaml" \
    --profile "${COMPOSE_PROFILE}" \
    "$@"
}

clean() {
  log "tearing down main stack"
  main_compose down -v --remove-orphans || true
  docker system prune -f || true
}

up() {
  ensure_docker
  ensure_volumes

  if [ ! -f "${REPO_DIR}/docker/docker-compose.loadgen.yaml" ]; then
    echo "ERROR: repo not found at ${REPO_DIR}/docker/docker-compose.loadgen.yaml" >&2
    exit 1
  fi

  log "building main stack (chain=${CHAIN_SERVER}, explorer=${EXPLORER_SERVER})"
  main_compose build

  log "starting main stack"
  main_compose up -d --remove-orphans

  log "main stack deployed. Dashboard: :80"
}

if [ "${CLEAN}" = "1" ]; then
  clean
fi
up
