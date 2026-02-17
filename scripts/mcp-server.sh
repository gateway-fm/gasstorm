#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
MCP_DIR="${ROOT_DIR}/mcp"
MCP_BIN="${MCP_DIR}/mcp"

# Build on first run or when Go sources changed.
if [[ ! -x "${MCP_BIN}" ]] || find "${MCP_DIR}" -name '*.go' -newer "${MCP_BIN}" -print -quit | grep -q .; then
  (cd "${MCP_DIR}" && go build -o mcp .)
fi

export BUILDER_URL="${BUILDER_URL:-http://localhost:13000}"
export LOADGEN_URL="${LOADGEN_URL:-http://localhost:13001}"
export GASSTORM_DIR="${GASSTORM_DIR:-${ROOT_DIR}}"

exec "${MCP_BIN}"
