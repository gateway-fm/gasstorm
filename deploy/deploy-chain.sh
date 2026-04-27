#!/usr/bin/env bash
# Run on the chain server. Builds and starts the chain stack (L1 + L2 + block-builder).
#
# Optional env:
#   COMPOSE_PROFILE  - reth or cdk-erigon (default: reth)
#   CLEAN            - if "1", tear down first

set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${DEPLOY_DIR}/repo"
COMPOSE_PROFILE="${COMPOSE_PROFILE:-reth}"
CLEAN="${CLEAN:-0}"

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

chain_compose() {
  docker compose \
    -p gasstorm-chain \
    -f "${REPO_DIR}/docker/docker-compose.chain.yaml" \
    -f "${DEPLOY_DIR}/docker-compose.chain.prod.yaml" \
    --profile "${COMPOSE_PROFILE}" \
    "$@"
}

clean() {
  log "tearing down chain stack"
  chain_compose down -v --remove-orphans || true
  docker system prune -f || true
}

up() {
  ensure_docker

  if [ ! -f "${REPO_DIR}/docker/docker-compose.chain.yaml" ]; then
    echo "ERROR: repo not found at ${REPO_DIR}/docker/docker-compose.chain.yaml" >&2
    exit 1
  fi

  log "building chain stack (profile=${COMPOSE_PROFILE})"
  chain_compose build

  log "starting chain stack"
  chain_compose up -d --remove-orphans

  log "chain stack deployed. Builder RPC: :13000, L1 RPC: :18545, L2 RPC: :18546"
}

if [ "${CLEAN}" = "1" ]; then
  clean
fi
up
