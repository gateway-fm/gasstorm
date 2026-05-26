#!/bin/bash
set -euo pipefail

CONTAINER="${CONTAINER:-gasstorm-chain-indexer}"
BEHIND_WAIT="${BEHIND_WAIT:-130}"
SYNC_WAIT="${SYNC_WAIT:-120}"
OBSERVE_WAIT="${OBSERVE_WAIT:-150}"
PATTERN="catchup: rebuilding address_stats table"

RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'
log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

count_rebuilds_since() {
    docker logs --since "$1" "$CONTAINER" 2>&1 | grep -c "$PATTERN" || true
}

log_info "=== address_stats rebuild-loop e2e ==="

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    log_error "Container '$CONTAINER' is not running. Start the stack first: make up"
    exit 2
fi

log_info "Stopping $CONTAINER for ${BEHIND_WAIT}s so it restarts >100 blocks behind head..."
docker stop "$CONTAINER" >/dev/null
sleep "$BEHIND_WAIT"

START_EPOCH=$(date +%s)
log_info "Starting $CONTAINER (collector/catchup path expected)..."
docker start "$CONTAINER" >/dev/null

log_info "Waiting up to ${SYNC_WAIT}s for the initial address_stats rebuild..."
deadline=$(( $(date +%s) + SYNC_WAIT ))
seen=0
while [ "$(date +%s)" -lt "$deadline" ]; do
    if [ "$(count_rebuilds_since "$START_EPOCH")" -ge 1 ]; then
        seen=1
        break
    fi
    sleep 3
done

if [ "$seen" -ne 1 ]; then
    log_error "No address_stats rebuild seen within ${SYNC_WAIT}s after restart."
    log_error "The indexer likely did not enter the catchup/collector path (needs to boot >100 blocks behind head). Increase BEHIND_WAIT and retry."
    docker logs --since "$START_EPOCH" "$CONTAINER" 2>&1 | grep -iE "standard mode|catchup|missing range" | head -5 || true
    exit 2
fi

log_info "Initial rebuild observed. Watching ${OBSERVE_WAIT}s for re-fires..."
sleep "$OBSERVE_WAIT"

COUNT=$(count_rebuilds_since "$START_EPOCH")
log_info "address_stats rebuilds since restart: ${COUNT}"
echo "----- rebuild log lines (since restart) -----"
docker logs -t --since "$START_EPOCH" "$CONTAINER" 2>&1 | grep "$PATTERN" || true
echo "---------------------------------------------"

if [ "$COUNT" -eq 1 ]; then
    log_info "PASS: address_stats rebuilt exactly once for the process lifetime."
    exit 0
else
    log_error "FAIL: address_stats rebuilt ${COUNT} times since restart (expected 1)."
    log_error "The rebuild is re-firing on chain-head idle cycles."
    exit 1
fi
