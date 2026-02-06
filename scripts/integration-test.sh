#!/bin/bash
# Integration test script for sequencer-poc
# Spins up Docker Compose stack, runs E2E tests, tears down

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
STARTUP_TIMEOUT=${STARTUP_TIMEOUT:-60}
TEST_TIMEOUT=${TEST_TIMEOUT:-120}

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

cleanup() {
    log_info "Cleaning up Docker Compose stack..."
    cd "$PROJECT_DIR"
    docker compose --profile reth down --volumes --remove-orphans 2>/dev/null || true
}

wait_for_service() {
    local url=$1
    local name=$2
    local timeout=$3
    local start_time=$(date +%s)

    log_info "Waiting for $name at $url..."

    while true; do
        if curl -sf "$url" > /dev/null 2>&1; then
            log_info "$name is ready"
            return 0
        fi

        local elapsed=$(($(date +%s) - start_time))
        if [ $elapsed -ge $timeout ]; then
            log_error "$name did not become ready within ${timeout}s"
            return 1
        fi

        sleep 1
    done
}

run_api_contract_tests() {
    log_info "Running API contract tests..."
    cd "$PROJECT_DIR/../loadgenerator"

    if go test -v -race -run "TestStorageModels|TestPublicTypes|TestJSONSerialization" ./internal/contract/...; then
        log_info "API contract tests PASSED"
        return 0
    else
        log_error "API contract tests FAILED"
        return 1
    fi
}

run_e2e_tests() {
    log_info "Running E2E integration tests..."
    cd "$PROJECT_DIR/../loadgenerator"

    export BUILDER_RPC_URL="http://localhost:13000"
    export LOADGEN_API_URL="http://localhost:13001"
    export L2_RPC_URL="http://localhost:18546"
    export PRECONF_WS_URL="ws://localhost:13002/ws/preconfirmations"

    if go test -v -race -timeout ${TEST_TIMEOUT}s ./internal/integration/... -run "TestE2E"; then
        log_info "E2E tests PASSED"
        return 0
    else
        log_error "E2E tests FAILED"
        return 1
    fi
}

run_quick_smoke_test() {
    log_info "Running quick smoke test..."

    # Send a single transaction via cast
    if command -v cast &> /dev/null; then
        if cast send --rpc-url http://localhost:13000 \
            --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
            0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
            --value 1ether \
            --json > /dev/null 2>&1; then
            log_info "Smoke test PASSED - transaction sent successfully"
            return 0
        else
            log_error "Smoke test FAILED - transaction failed"
            return 1
        fi
    else
        log_warn "cast not installed, skipping smoke test"
        return 0
    fi
}

main() {
    local test_type="${1:-all}"
    local skip_startup="${2:-false}"

    log_info "=== Sequencer PoC Integration Tests ==="
    log_info "Test type: $test_type"

    # Trap to ensure cleanup on exit
    trap cleanup EXIT

    cd "$PROJECT_DIR"

    # Run contract tests first (no stack needed)
    if [ "$test_type" = "all" ] || [ "$test_type" = "contract" ]; then
        run_api_contract_tests || exit 1
    fi

    if [ "$test_type" = "contract" ]; then
        log_info "Contract tests completed, skipping stack tests"
        exit 0
    fi

    # Start Docker Compose stack
    if [ "$skip_startup" != "true" ]; then
        log_info "Starting Docker Compose stack..."
        docker compose --profile reth down --volumes 2>/dev/null || true
        docker compose --profile reth up -d --build

        # Wait for services
        wait_for_service "http://localhost:13000/health" "block-builder" "$STARTUP_TIMEOUT" || exit 1
        wait_for_service "http://localhost:13001/api/status" "load-generator" "$STARTUP_TIMEOUT" || exit 1
        wait_for_service "http://localhost:18546" "op-reth" "$STARTUP_TIMEOUT" || exit 1

        log_info "All services ready"
    fi

    # Run smoke test
    if [ "$test_type" = "all" ] || [ "$test_type" = "smoke" ]; then
        run_quick_smoke_test || exit 1
    fi

    # Run E2E tests
    if [ "$test_type" = "all" ] || [ "$test_type" = "e2e" ]; then
        run_e2e_tests || exit 1
    fi

    log_info "=== All Integration Tests PASSED ==="
}

# Parse arguments
case "${1:-}" in
    --help|-h)
        echo "Usage: $0 [test-type] [--skip-startup]"
        echo ""
        echo "Test types:"
        echo "  all       - Run all tests (default)"
        echo "  contract  - Run API contract tests only (no stack needed)"
        echo "  smoke     - Run smoke test only"
        echo "  e2e       - Run E2E tests only"
        echo ""
        echo "Options:"
        echo "  --skip-startup  - Skip Docker Compose startup (use existing stack)"
        echo ""
        echo "Environment variables:"
        echo "  STARTUP_TIMEOUT - Seconds to wait for services (default: 60)"
        echo "  TEST_TIMEOUT    - Seconds for test timeout (default: 120)"
        exit 0
        ;;
    --skip-startup)
        main "all" "true"
        ;;
    *)
        if [ "${2:-}" = "--skip-startup" ]; then
            main "$1" "true"
        else
            main "${1:-all}" "false"
        fi
        ;;
esac
