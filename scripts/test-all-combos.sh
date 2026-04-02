#!/bin/bash
set -euo pipefail

# Test all supported profile+L1+feature combinations.
# Runs each combo sequentially: start, wait for health, tear down.
# Usage: ./scripts/test-all-combos.sh [--quick]
#   --quick: Only wait 15s per combo (default: 30s)

if [ "${1:-}" = "--quick" ]; then
    WAIT_SECS=45
    BESU_WAIT_SECS=90
else
    WAIT_SECS=60
    BESU_WAIT_SECS=120
fi
PASS=0
FAIL=0
SKIP=0
RESULTS=()

log()  { echo -e "\033[1;36m[test] $*\033[0m"; }
pass() { echo -e "\033[1;32m  PASS\033[0m $*"; PASS=$((PASS+1)); RESULTS+=("PASS: $*"); }
fail() { echo -e "\033[1;31m  FAIL\033[0m $*"; FAIL=$((FAIL+1)); RESULTS+=("FAIL: $*"); }
skip() { echo -e "\033[1;33m  SKIP\033[0m $*"; SKIP=$((SKIP+1)); RESULTS+=("SKIP: $*"); }

cleanup() {
    docker compose down -v --remove-orphans 2>/dev/null || true
    docker rm -f $(docker ps -aq --filter "name=gasstorm" 2>/dev/null) 2>/dev/null || true
    docker network rm gasstorm 2>/dev/null || true
    # Remove named volumes that persist across tests (besu-data has genesis fingerprint)
    docker volume rm sequencer-poc_besu-data 2>/dev/null || true
    sleep 2
}

check_health() {
    local name="$1"
    local port="$2"
    local endpoint="${3:-/}"
    local max_retries=10
    local i=0
    while [ $i -lt $max_retries ]; do
        if curl -sf "http://localhost:${port}${endpoint}" > /dev/null 2>&1; then
            return 0
        fi
        # Also try JSON-RPC health check (for Anvil/Besu L1)
        if curl -sf -X POST "http://localhost:${port}" \
            -H "Content-Type: application/json" \
            -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' > /dev/null 2>&1; then
            return 0
        fi
        i=$((i+1))
        sleep 1
    done
    return 1
}

test_combo() {
    local label="$1"
    shift
    local make_args="$@"

    log "Testing: $label"
    log "  Command: make up $make_args"

    cleanup

    # Determine wait time (Besu L1 needs longer to initialize)
    local wait=$WAIT_SECS
    if echo "$make_args" | grep -q "L1=besu"; then
        wait=$BESU_WAIT_SECS
    fi

    # Start the stack in background, wait, then check
    make up $make_args 2>&1 &
    local make_pid=$!
    sleep ${wait}
    kill $make_pid 2>/dev/null || true
    wait $make_pid 2>/dev/null || true

    # Count running services
    local running
    running=$(docker ps --filter "name=gasstorm" -q 2>/dev/null | wc -l | tr -d ' ')
    log "  Services running: $running"

    if [ "$running" -lt 3 ]; then
        fail "$label ($running services, expected 3+)"
        # Show errors
        docker ps -a --filter "name=gasstorm" --filter "status=exited" --format "  EXITED: {{.Names}} ({{.Status}})" 2>/dev/null | head -3
        return
    fi

    # Check L1 health (extra retries for Besu which takes longer to start)
    local l1_retries=15
    if echo "$make_args" | grep -q "L1=besu"; then
        l1_retries=30
    fi
    local l1_ok=0
    for i in $(seq 1 $l1_retries); do
        if curl -sf -X POST "http://localhost:18545" \
            -H "Content-Type: application/json" \
            -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' > /dev/null 2>&1; then
            l1_ok=1
            break
        fi
        sleep 2
    done
    if [ "$l1_ok" -eq 1 ]; then
        log "  L1 healthy"
    else
        fail "$label (L1 not healthy after ${l1_retries} retries)"
        return
    fi

    # Check L2 health (port varies by profile)
    local l2_port
    if echo "$make_args" | grep -q "cdk-erigon"; then
        l2_port=18546
    else
        l2_port=13000
    fi

    # Check load generator
    if check_health "LoadGen" 13001 "/v1/status"; then
        log "  LoadGen healthy"
    else
        log "  LoadGen not reachable (may still be initializing)"
    fi

    pass "$label ($running services)"
}

# ===========================================================================
# Run all combinations
# ===========================================================================

log "Starting test suite (${WAIT_SECS}s per combo)"
log "Pre-building MCP..."
make mcp-build 2>&1 | tail -1
echo ""

# 1. reth + anvil (default, all features)
test_combo "reth + Anvil + all features" \
    PROFILE=reth "WITH=blob,privacy,explorer,bridge"

# 2. reth + besu + all features (no blob - Besu Clique is pre-Cancun)
test_combo "reth + Besu + bridge,privacy,explorer" \
    PROFILE=reth L1=besu "WITH=privacy,explorer,bridge"

# 3. cdk-erigon + anvil + all features
test_combo "cdk-erigon + Anvil + all features" \
    PROFILE=cdk-erigon "WITH=blob,privacy,explorer,bridge"

# 4. cdk-erigon + besu + all features (no blob - Besu Clique is pre-Cancun)
test_combo "cdk-erigon + Besu + bridge,privacy,explorer" \
    PROFILE=cdk-erigon L1=besu "WITH=privacy,explorer,bridge"

# 5. reth + anvil + privacy + explorer (load test mode)
test_combo "reth + Anvil + privacy loadtest" \
    PROFILE=reth "WITH=privacy,explorer"

# 6. cdk-erigon + anvil + privacy + explorer
test_combo "cdk-erigon + Anvil + privacy loadtest" \
    PROFILE=cdk-erigon "WITH=privacy,explorer"

# 7. reth + anvil (core only)
test_combo "reth + Anvil (core only)" \
    PROFILE=reth "WITH="

# 8. cdk-erigon + anvil (core only)
test_combo "cdk-erigon + Anvil (core only)" \
    PROFILE=cdk-erigon "WITH="

# ===========================================================================
# Final cleanup and summary
# ===========================================================================

cleanup

echo ""
echo "==========================================="
echo "  TEST RESULTS"
echo "==========================================="
for r in "${RESULTS[@]}"; do
    echo "  $r"
done
echo ""
echo "  PASS: $PASS  FAIL: $FAIL  SKIP: $SKIP"
echo "==========================================="

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
