#!/usr/bin/env bash
# Run on the explorer server. Builds and starts the explorer + privacy stack.
#
# Required env:
#   CHAIN_SERVER       - IP/hostname of the chain server
#   MAIN_SERVER_PUBLIC - public IP/hostname of the main server (for SSO redirects)
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
: "${MAIN_SERVER_PUBLIC:?must be set}"
: "${EXPLORER_PUBLIC:?must be set (public IP of this explorer server, for SSO redirects)}"
export CHAIN_SERVER
export MAIN_SERVER_PUBLIC
export EXPLORER_PUBLIC

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

explorer_compose() {
  # Enable explorer, explorer-l1, and privacy profiles
  docker compose \
    -p gasstorm-explorer \
    -f "${REPO_DIR}/docker/docker-compose.explorer.yaml" \
    -f "${DEPLOY_DIR}/docker-compose.explorer.prod.yaml" \
    --profile explorer --profile explorer-l1 --profile privacy \
    "$@"
}

clean() {
  log "tearing down explorer stack"
  explorer_compose down -v --remove-orphans || true
  docker system prune -f || true
}

up() {
  ensure_docker

  if [ ! -f "${REPO_DIR}/docker/docker-compose.explorer.yaml" ]; then
    echo "ERROR: repo not found at ${REPO_DIR}/docker/docker-compose.explorer.yaml" >&2
    exit 1
  fi

  log "building explorer stack (chain=${CHAIN_SERVER}, main=${MAIN_SERVER_PUBLIC})"
  explorer_compose build

  log "starting explorer stack"
  explorer_compose up -d --remove-orphans

  log "explorer deployed. L2 API: :18200, L2 UI: :18201, L1 API: :18202, L1 UI: :18203"
  log "privacy deployed. Proxy: :18300, UI: :18301"
}

if [ "${CLEAN}" = "1" ]; then
  clean
fi
up
