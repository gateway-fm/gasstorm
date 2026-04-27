#!/usr/bin/env bash
# Run on the remote server. Brings up Traefik + the gasstorm prod stack.
#
# Expects the full gasstorm repo to be rsync'd into DEPLOY_DIR/repo/ by the
# Makefile, and the deploy overlay files alongside it.
#
# Required env (passed via ssh by the Makefile):
#   GASSTORM_DOMAIN  - hostname pointed at this server
#
# Optional env:
#   COMPOSE_PROFILE  - which execution layer profile (default: reth)
#   EXTRA_PROFILES   - comma-separated additional profiles (default: explorer,explorer-l1)
#   CLEAN            - if "1", tear everything down before bringing it back up

set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${DEPLOY_DIR}/repo"
COMPOSE_PROFILE="${COMPOSE_PROFILE:-reth}"
EXTRA_PROFILES="${EXTRA_PROFILES:-explorer,explorer-l1}"
CLEAN="${CLEAN:-0}"

: "${GASSTORM_DOMAIN:?must be set}"
export GASSTORM_DOMAIN

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
  # Ensure current user can talk to docker without sudo
  if ! docker info >/dev/null 2>&1; then
    log "adding $(whoami) to docker group"
    sudo usermod -aG docker "$(whoami)"
    # Re-exec this script under the new group (avoids needing a new login shell)
    exec sg docker "$0"
  fi
}

stack_compose() {
  local profile_flags="--profile ${COMPOSE_PROFILE}"
  IFS=',' read -ra extras <<< "${EXTRA_PROFILES}"
  for p in "${extras[@]}"; do
    [ -n "$p" ] && profile_flags="${profile_flags} --profile ${p}"
  done
  # shellcheck disable=SC2086
  docker compose \
    -p gasstorm \
    -f "${REPO_DIR}/docker/docker-compose.yml" \
    -f "${DEPLOY_DIR}/docker-compose.prod.yaml" \
    ${profile_flags} \
    "$@"
}

clean() {
  log "tearing down stack"
  if [ -f "${REPO_DIR}/docker/docker-compose.yml" ]; then
    stack_compose down -v --remove-orphans || true
  fi
  log "pruning docker resources"
  docker system prune -f || true
}

up() {
  ensure_docker

  if [ ! -f "${REPO_DIR}/docker/docker-compose.yml" ]; then
    echo "ERROR: repo not found at ${REPO_DIR}/docker/docker-compose.yml — was it rsync'd?" >&2
    exit 1
  fi

  log "starting gasstorm stack (profile=${COMPOSE_PROFILE})"
  stack_compose build
  stack_compose up -d --remove-orphans

  log "deployed. dashboard: http://${GASSTORM_DOMAIN}"
}

if [ "${CLEAN}" = "1" ]; then
  clean
fi
up
