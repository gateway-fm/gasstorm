#!/usr/bin/env bash
# Launcher used by mcplexer (or any other MCP host) to spawn the gasstorm MCP
# server. Sets the env vars the binary expects when invoked outside the
# `make mcp-server` flow.
#
# Each variable can be overridden by the host. The defaults assume the gasstorm
# stack is reachable on the local host's standard ports (the gasstorm Makefile
# spins them up via docker compose).
set -e

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GASSTORM_REPO="$(cd "$HERE/.." && pwd)"

export BUILDER_URL="${BUILDER_URL:-http://localhost:13000}"
export LOADGEN_URL="${LOADGEN_URL:-http://localhost:13001}"
export EXPLORER_URL="${EXPLORER_URL:-http://localhost:18200}"
export PRIVACY_URL="${PRIVACY_URL:-http://localhost:18300}"
export GASSTORM_DIR="${GASSTORM_DIR:-$GASSTORM_REPO}"

exec "$HERE/gasstorm-mcp" "$@"
