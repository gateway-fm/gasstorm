#!/usr/bin/env bash
# Run on the load generator remote server.
# Builds and starts the load generator, connecting to the main gasstorm stack.
#
# Required env:
#   MAIN_SERVER_HOST - IP/hostname of the main gasstorm server
#
# Optional env:
#   COMPOSE_PROFILE  - reth or cdk-erigon (default: reth)
#   CLEAN            - if "1", tear down first

set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${DEPLOY_DIR}/repo"
COMPOSE_PROFILE="${COMPOSE_PROFILE:-reth}"
CLEAN="${CLEAN:-0}"

: "${MAIN_SERVER_HOST:?must be set}"
export MAIN_SERVER_HOST

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

loadgen_compose() {
  docker compose \
    -p gasstorm-loadgen \
    -f "${REPO_DIR}/docker/docker-compose.loadgen.yaml" \
    -f "${DEPLOY_DIR}/docker-compose.loadgen.prod.yaml" \
    --profile "${COMPOSE_PROFILE}" \
    "$@"
}

clean() {
  log "tearing down loadgen"
  loadgen_compose down -v --remove-orphans || true
  docker system prune -f || true
}

up() {
  ensure_docker

  if [ ! -f "${REPO_DIR}/docker/docker-compose.loadgen.yaml" ]; then
    echo "ERROR: repo not found at ${REPO_DIR}/docker/docker-compose.loadgen.yaml" >&2
    exit 1
  fi

  log "building load generator (profile=${COMPOSE_PROFILE})"
  loadgen_compose build

  log "starting load generator -> ${MAIN_SERVER_HOST}"
  loadgen_compose up -d --remove-orphans

  log "load generator deployed. API: :3001"
}

if [ "${CLEAN}" = "1" ]; then
  clean
fi
up
