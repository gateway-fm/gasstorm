#!/usr/bin/env bash
# Bootstrap a regenesis-style gasstorm stack: read a cdk-erigon datadir,
# import it into a reth-ext datadir at the source's head block N, and emit
# the env variables the docker-compose-regenesis.yaml overlay needs.
#
# Pipeline:
#   1. state-export        cdk-erigon MDBX → genesis-v2.json
#   2. sanitize            cdk-erigon chain config → reth-acceptable chainspec
#   3. genesis-import-cdk  populate a fresh reth-ext datadir at block N
#   4. emit .env.regenesis with the variables for docker compose
#
# After this script runs:
#
#   set -a; source .env.regenesis; set +a
#   docker compose \
#     -f docker/docker-compose.yml \
#     -f docker/docker-compose-reth-ext.yaml \
#     -f docker/docker-compose-regenesis.yaml \
#     --profile reth-ext --profile regenesis --profile explorer \
#     up -d
#
# Memory: the import step holds ~8 GB RSS during MPT computation; ensure
# the host has >= 16 GB RAM available (use swap if not).

set -euo pipefail

# ----- defaults -----
SRC_DATADIR=""
WORKDIR=""
STATE_EXPORT_BIN="${STATE_EXPORT_BIN:-${HOME}/github/gateway/cdk-erigon/build/bin/state-export}"
RETH_EXT_BIN="${RETH_EXT_BIN:-${HOME}/github/gateway/reth-experiment/reth/target/release/reth-ext}"
SANITIZER="${SANITIZER:-${HOME}/github/gateway/regenesis-toolkit/tools/sanitize-chainspec.py}"
ENV_OUT=".env.regenesis"
SKIP_EXPORT=0
SKIP_IMPORT=0

usage() {
  cat <<EOF
Usage: $(basename "$0") --src-datadir <cdk-erigon-datadir> [options]

Required:
  --src-datadir <path>     Path to a cdk-erigon RPC node datadir
                           (must contain chaindata/mdbx.dat)

Options:
  --workdir <path>         Output workdir for genesis-v2.json, chainspec,
                           and the populated reth-ext datadir.
                           Default: /tmp/regenesis-\$(date +%s)
  --env-out <path>         File to write env vars to. Default: .env.regenesis
  --skip-export            Reuse existing \$workdir/genesis-v2.json
  --skip-import            Reuse existing \$workdir/datadir (skip import entirely)
  -h | --help              This message.

Required env (override via env if installed elsewhere):
  STATE_EXPORT_BIN         default: ~/github/gateway/cdk-erigon/build/bin/state-export
  RETH_EXT_BIN             default: ~/github/gateway/reth-experiment/reth/target/release/reth-ext
  SANITIZER                default: ~/github/gateway/regenesis-toolkit/tools/sanitize-chainspec.py
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --src-datadir) SRC_DATADIR="$2"; shift 2;;
    --workdir) WORKDIR="$2"; shift 2;;
    --env-out) ENV_OUT="$2"; shift 2;;
    --skip-export) SKIP_EXPORT=1; shift;;
    --skip-import) SKIP_IMPORT=1; shift;;
    -h|--help) usage; exit 0;;
    *) echo "unknown arg: $1" >&2; usage >&2; exit 2;;
  esac
done

if [[ -z "$WORKDIR" ]]; then
  WORKDIR="/tmp/regenesis-$(date +%s)"
fi
mkdir -p "$WORKDIR"

GENESIS="$WORKDIR/genesis-v2.json"
CHAINSPEC="$WORKDIR/chainspec.json"
RETH_DATADIR="$WORKDIR/datadir"

log() { printf '[regenesis %s] %s\n' "$(date +%H:%M:%S)" "$*"; }

# ----- preflight -----
[[ -x "$RETH_EXT_BIN" ]]   || { echo "ERROR: reth-ext binary not found at $RETH_EXT_BIN" >&2; exit 1; }
[[ -f "$SANITIZER"  ]]    || { echo "ERROR: sanitizer not found at $SANITIZER" >&2; exit 1; }

if [[ $SKIP_EXPORT -eq 0 && $SKIP_IMPORT -eq 0 ]]; then
  [[ -n "$SRC_DATADIR" ]] || { echo "ERROR: --src-datadir is required (or pass --skip-export/--skip-import)" >&2; exit 1; }
  [[ -d "$SRC_DATADIR" ]] || { echo "ERROR: $SRC_DATADIR is not a directory" >&2; exit 1; }
  [[ -x "$STATE_EXPORT_BIN" ]] || { echo "ERROR: state-export binary not found at $STATE_EXPORT_BIN" >&2; exit 1; }
fi

mem_avail=$(free -m | awk '/^Mem:/ {print $7}')
if (( mem_avail < 12000 )); then
  log "WARNING: only ${mem_avail} MB available memory; the import step may swap heavily"
fi

# ----- step 1: state export -----
if [[ $SKIP_EXPORT -eq 1 || $SKIP_IMPORT -eq 1 ]]; then
  if [[ ! -f "$GENESIS" && $SKIP_IMPORT -eq 0 ]]; then
    echo "ERROR: --skip-export but $GENESIS not found" >&2; exit 1
  fi
  [[ -f "$GENESIS" ]] && log "step 1: reusing $GENESIS"
else
  log "step 1: state-export $SRC_DATADIR → $GENESIS"
  T0=$(date +%s)
  "$STATE_EXPORT_BIN" --datadir "$SRC_DATADIR" --out "$GENESIS"
  log "  done in $(($(date +%s)-T0))s; $(du -h "$GENESIS" | awk '{print $1}')"
fi

# ----- step 2: sanitize chainspec -----
if [[ ! -f "$CHAINSPEC" ]]; then
  log "step 2: sanitize chainspec"
  T0=$(date +%s)
  python3 "$SANITIZER" "$GENESIS" "$CHAINSPEC"
  log "  done in $(($(date +%s)-T0))s; $(du -h "$CHAINSPEC" | awk '{print $1}')"
else
  log "step 2: reusing $CHAINSPEC"
fi

# ----- step 3: genesis-import-cdk -----
if [[ $SKIP_IMPORT -eq 1 ]]; then
  log "step 3: --skip-import, reusing $RETH_DATADIR"
  [[ -d "$RETH_DATADIR/db" ]] || { echo "ERROR: $RETH_DATADIR doesn't look like a populated reth datadir" >&2; exit 1; }
else
  log "step 3: genesis-import-cdk → $RETH_DATADIR"
  rm -rf "$RETH_DATADIR"; mkdir -p "$RETH_DATADIR"
  T0=$(date +%s)
  setsid -f bash -c "
    exec '$RETH_EXT_BIN' genesis-import-cdk \
      --input '$GENESIS' \
      --chain '$CHAINSPEC' \
      --datadir '$RETH_DATADIR' \
      > '$WORKDIR/import.log' 2>&1
  "
  sleep 4
  PID=$(pgrep -x reth-ext | head -1)
  [[ -n "$PID" ]] || { echo "ERROR: failed to spawn reth-ext; see $WORKDIR/import.log" >&2; tail -20 "$WORKDIR/import.log"; exit 1; }
  echo 1000 > "/proc/$PID/oom_score_adj" 2>/dev/null || true
  log "  importer pid=$PID; tailing log..."
  while kill -0 $PID 2>/dev/null; do
    sleep 30
    LATEST=$(tail -1 "$WORKDIR/import.log" 2>/dev/null | head -c 200)
    log "  (importer running, last log: $LATEST)"
  done
  log "  import wall: $(($(date +%s)-T0))s"
  if ! grep -q "genesis-import-cdk complete" "$WORKDIR/import.log" 2>/dev/null; then
    log "ERROR: importer did not log completion; tail follows:"
    tail -30 "$WORKDIR/import.log"
    exit 1
  fi
fi

# ----- step 4: extract head block number + hash for docker-compose env -----
HEAD_BLOCK_NUM=$(jq -r '._meta.sourceBlockNumber' "$GENESIS")
HEAD_BLOCK_HASH=$(jq -r '._meta.sourceBlockHash' "$GENESIS")
HEAD_STATE_ROOT=$(jq -r '._meta.sourceStateRoot' "$GENESIS")
CHAIN_ID=$(jq -r '.config.chainId' "$CHAINSPEC")
[[ "$HEAD_BLOCK_NUM" != "null" && -n "$HEAD_BLOCK_NUM" ]] || { echo "ERROR: failed to parse _meta.sourceBlockNumber from $GENESIS" >&2; exit 1; }

cat > "$ENV_OUT" <<EOF
# Generated by scripts/regenesis-bootstrap.sh on $(date -Iseconds)
# Source datadir:      ${SRC_DATADIR:-(--skip-export reused $GENESIS)}
# Genesis-v2 JSON:     $GENESIS
# Chainspec:           $CHAINSPEC
# Reth-ext datadir:    $RETH_DATADIR

REGENESIS_DATADIR_HOST=$RETH_DATADIR
REGENESIS_CHAINSPEC_HOST=$CHAINSPEC
REGENESIS_HEAD_BLOCK_NUM=$HEAD_BLOCK_NUM
REGENESIS_HEAD_BLOCK_HASH=$HEAD_BLOCK_HASH
REGENESIS_HEAD_STATE_ROOT=$HEAD_STATE_ROOT
REGENESIS_CHAIN_ID=$CHAIN_ID
RETH_EXT_VERSION=${RETH_EXT_VERSION:-dev}
EOF

cat <<EOF

=== Done ===

  block N (source):  $HEAD_BLOCK_NUM
  block hash:        $HEAD_BLOCK_HASH
  state root:        $HEAD_STATE_ROOT
  chain id:          $CHAIN_ID
  reth datadir:      $RETH_DATADIR
  env file:          $ENV_OUT

Next:

  set -a && source $ENV_OUT && set +a
  docker compose \\
    -f docker/docker-compose.yml \\
    -f docker/docker-compose-reth-ext.yaml \\
    -f docker/docker-compose-regenesis.yaml \\
    --profile reth-ext --profile regenesis --profile explorer \\
    up -d

After the stack is up, the chain-indexer will pick up block $HEAD_BLOCK_NUM and the
explorer UI should reflect it within ~30 seconds.
EOF
