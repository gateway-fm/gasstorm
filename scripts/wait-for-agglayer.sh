#!/usr/bin/env bash
#
# wait-for-agglayer.sh - Wait for all AggLayer services to be healthy
#
# Usage:
#   ./scripts/wait-for-agglayer.sh
#
# This script waits for all AggLayer services to become healthy before
# returning. Useful for CI/CD pipelines or scripted deployments.
#

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${YELLOW}[INFO]${NC} $1"; }
log_ok() { echo -e "${GREEN}[OK]${NC} $1"; }
log_err() { echo -e "${RED}[ERROR]${NC} $1"; }

# Configuration
MAX_RETRIES=${MAX_RETRIES:-60}
RETRY_INTERVAL=${RETRY_INTERVAL:-5}

wait_for_service() {
    local name="$1"
    local url="$2"
    local retries=0

    log_info "Waiting for $name..."
    while [ $retries -lt $MAX_RETRIES ]; do
        if curl -sf "$url" > /dev/null 2>&1; then
            log_ok "$name is ready"
            return 0
        fi
        retries=$((retries + 1))
        sleep $RETRY_INTERVAL
    done

    log_err "$name failed to start after $MAX_RETRIES attempts"
    return 1
}

wait_for_postgres() {
    local retries=0
    log_info "Waiting for PostgreSQL..."

    while [ $retries -lt $MAX_RETRIES ]; do
        if docker exec sequencer-poc-postgres pg_isready -U op-succinct > /dev/null 2>&1; then
            log_ok "PostgreSQL is ready"
            return 0
        fi
        retries=$((retries + 1))
        sleep $RETRY_INTERVAL
    done

    log_err "PostgreSQL failed to start after $MAX_RETRIES attempts"
    return 1
}

wait_for_l2() {
    local retries=0
    log_info "Waiting for L2 (op-reth)..."

    while [ $retries -lt $MAX_RETRIES ]; do
        if cast block-number --rpc-url http://localhost:18546 > /dev/null 2>&1; then
            log_ok "L2 (op-reth) is ready"
            return 0
        fi
        retries=$((retries + 1))
        sleep $RETRY_INTERVAL
    done

    log_err "L2 (op-reth) failed to start after $MAX_RETRIES attempts"
    return 1
}

echo ""
echo "=========================================="
echo "  AggLayer FEP Health Check"
echo "=========================================="
echo ""

# Check L1 (Anvil)
wait_for_service "L1 (Anvil)" "http://localhost:18545"

# Check L2 (op-reth)
wait_for_l2

# Check PostgreSQL
wait_for_postgres

# Check AggLayer
wait_for_service "AggLayer" "http://localhost:15577/health"

echo ""
log_ok "All AggLayer services are ready!"
echo ""
echo "Service URLs:"
echo "  L1 (Anvil):     http://localhost:18545"
echo "  L2 (op-reth):   http://localhost:18546"
echo "  AggLayer:       http://localhost:15577"
echo "  Bridge UI:      http://localhost:18088"
echo "  Dashboard:      http://localhost:18000"
echo ""
