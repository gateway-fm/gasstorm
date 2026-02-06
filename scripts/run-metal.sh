#!/bin/bash
# Native "Metal" mode - runs all components natively on macOS for maximum performance
# No Docker overhead - direct execution on host hardware
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# =============================================================================
# Prerequisites Check
# =============================================================================

check_prereqs() {
    log_info "Checking prerequisites..."
    local missing=0

    # Check for reth or op-reth
    if command -v op-reth >/dev/null 2>&1; then
        RETH_BIN="op-reth"
        log_success "Found op-reth: $(which op-reth)"
    elif command -v reth >/dev/null 2>&1; then
        RETH_BIN="reth"
        log_success "Found reth: $(which reth)"
    else
        log_error "reth/op-reth not found"
        echo ""
        echo "Install op-reth via cargo (requires Rust):"
        echo "  cargo install --git https://github.com/paradigmxyz/reth --tag v1.9.3 --bin op-reth --features \"op\" op-reth"
        echo ""
        echo "Or download pre-built binary from:"
        echo "  https://github.com/paradigmxyz/reth/releases"
        missing=1
    fi

    # Check for Go
    if command -v go >/dev/null 2>&1; then
        log_success "Found go: $(go version)"
    else
        log_error "go not found"
        echo "Install Go from https://go.dev/dl/"
        missing=1
    fi

    # Check for Node.js
    if command -v node >/dev/null 2>&1; then
        log_success "Found node: $(node --version)"
    else
        log_error "node not found"
        echo "Install Node.js from https://nodejs.org/"
        missing=1
    fi

    # Check for required files
    if [ -f "$PROJECT_DIR/genesis/genesis.json" ]; then
        log_success "Found genesis/genesis.json"
    else
        log_error "genesis/genesis.json not found"
        missing=1
    fi

    if [ -f "$PROJECT_DIR/genesis/jwt.hex" ]; then
        log_success "Found genesis/jwt.hex"
    else
        log_error "genesis/jwt.hex not found"
        missing=1
    fi

    if [ $missing -ne 0 ]; then
        log_error "Missing prerequisites. Please install them and try again."
        exit 1
    fi

    log_success "All prerequisites satisfied"
    echo ""
}

# =============================================================================
# Configuration (same defaults as docker-compose)
# =============================================================================

DATA_DIR="${PROJECT_DIR}/data/metal"
BLOCK_TIME_MS="${BLOCK_TIME_MS:-1000}"
SKIP_EMPTY_BLOCKS="${SKIP_EMPTY_BLOCKS:-true}"
GAS_LIMIT="${GAS_LIMIT:-1500000000}"
MAX_TXS_PER_BLOCK="${MAX_TXS_PER_BLOCK:-50000}"
TX_ORDERING="${TX_ORDERING:-fifo}"
ENABLE_PRECONFIRMATIONS="${ENABLE_PRECONFIRMATIONS:-true}"

# Ports - matching Docker external ports for dashboard compatibility
RETH_HTTP_PORT=18546
RETH_WS_PORT=18547
RETH_ENGINE_PORT=18551
BUILDER_PORT=13000
BUILDER_PRECONF_PORT=13002
LOADGEN_PORT=13001
DASHBOARD_PORT=3000

# PIDs for cleanup
RETH_PID=""
BUILDER_PID=""
LOADGEN_PID=""
DASHBOARD_PID=""

# =============================================================================
# Cleanup Handler
# =============================================================================

cleanup() {
    echo ""
    log_info "Shutting down services..."

    if [ -n "$DASHBOARD_PID" ] && kill -0 "$DASHBOARD_PID" 2>/dev/null; then
        log_info "Stopping dashboard (PID $DASHBOARD_PID)..."
        kill "$DASHBOARD_PID" 2>/dev/null || true
    fi

    if [ -n "$LOADGEN_PID" ] && kill -0 "$LOADGEN_PID" 2>/dev/null; then
        log_info "Stopping load-generator (PID $LOADGEN_PID)..."
        kill "$LOADGEN_PID" 2>/dev/null || true
    fi

    if [ -n "$BUILDER_PID" ] && kill -0 "$BUILDER_PID" 2>/dev/null; then
        log_info "Stopping block-builder (PID $BUILDER_PID)..."
        kill "$BUILDER_PID" 2>/dev/null || true
    fi

    if [ -n "$RETH_PID" ] && kill -0 "$RETH_PID" 2>/dev/null; then
        log_info "Stopping reth (PID $RETH_PID)..."
        kill "$RETH_PID" 2>/dev/null || true
        # Give reth time to flush state
        sleep 2
    fi

    # Wait for all processes
    wait 2>/dev/null || true

    log_success "All services stopped"
    exit 0
}

trap cleanup INT TERM

# =============================================================================
# Kill Conflicting Processes
# =============================================================================

kill_port() {
    local port=$1
    local pids=$(lsof -ti ":$port" 2>/dev/null || true)
    if [ -n "$pids" ]; then
        log_warn "Killing existing process on port $port (PIDs: $pids)"
        echo "$pids" | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
}

# =============================================================================
# Main
# =============================================================================

main() {
    echo ""
    echo "=============================================="
    echo "  Sequencer PoC - Native Metal Mode"
    echo "=============================================="
    echo ""

    check_prereqs

    # Kill any conflicting processes
    log_info "Clearing ports..."
    kill_port $RETH_HTTP_PORT
    kill_port $RETH_WS_PORT
    kill_port $RETH_ENGINE_PORT
    kill_port $BUILDER_PORT
    kill_port $BUILDER_PRECONF_PORT
    kill_port $LOADGEN_PORT
    kill_port $DASHBOARD_PORT

    # Create data directory
    log_info "Creating data directory: $DATA_DIR"
    mkdir -p "$DATA_DIR/reth"
    mkdir -p "$DATA_DIR/loadgen"

    # =========================================================================
    # Start op-reth
    # =========================================================================
    log_info "Starting op-reth..."

    $RETH_BIN node \
        --chain "$PROJECT_DIR/genesis/genesis.json" \
        --datadir "$DATA_DIR/reth" \
        --http \
        --http.addr 127.0.0.1 \
        --http.port $RETH_HTTP_PORT \
        --http.api eth,net,web3 \
        --http.corsdomain "*" \
        --ws \
        --ws.addr 127.0.0.1 \
        --ws.port $RETH_WS_PORT \
        --ws.api eth,net,web3 \
        --authrpc.addr 127.0.0.1 \
        --authrpc.port $RETH_ENGINE_PORT \
        --authrpc.jwtsecret "$PROJECT_DIR/genesis/jwt.hex" \
        --rollup.disable-tx-pool-gossip \
        --txpool.pending-max-count 1 \
        --txpool.basefee-max-count 1 \
        --txpool.queued-max-count 1 \
        --txpool.max-account-slots 1 \
        --rpc.max-connections 1000 \
        --rpc.max-request-size 100 \
        --rpc.max-response-size 200 \
        --log.stdout.format terminal \
        -vv \
        2>&1 | sed 's/^/[reth] /' &
    RETH_PID=$!

    log_info "op-reth started (PID $RETH_PID)"

    # Wait for reth to be ready
    log_info "Waiting for op-reth to initialize..."
    sleep 5

    # Check if reth is still running
    if ! kill -0 "$RETH_PID" 2>/dev/null; then
        log_error "op-reth failed to start. Check logs above."
        exit 1
    fi

    # =========================================================================
    # Start block-builder
    # =========================================================================
    log_info "Starting block-builder..."

    (
        cd "$PROJECT_DIR/block-builder"
        ENGINE_RPC_URL="http://localhost:$RETH_ENGINE_PORT" \
        L2_RPC_URL="http://localhost:$RETH_HTTP_PORT" \
        JWT_SECRET_PATH="$PROJECT_DIR/genesis/jwt.hex" \
        SEQUENCER_ADDRESS="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" \
        LISTEN_ADDR=":$BUILDER_PORT" \
        PRECONF_LISTEN_ADDR=":$BUILDER_PRECONF_PORT" \
        BLOCK_TIME_MS="$BLOCK_TIME_MS" \
        SKIP_EMPTY_BLOCKS="$SKIP_EMPTY_BLOCKS" \
        GAS_LIMIT="$GAS_LIMIT" \
        MAX_TXS_PER_BLOCK="$MAX_TXS_PER_BLOCK" \
        TX_ORDERING="$TX_ORDERING" \
        ENABLE_PRECONFIRMATIONS="$ENABLE_PRECONFIRMATIONS" \
        INCLUDE_DEPOSIT_TX="false" \
        DEBUG_REJECTION_REASONS="true" \
        STRESS_THRESHOLD_PCT="80" \
        go run . 2>&1 | sed 's/^/[builder] /'
    ) &
    BUILDER_PID=$!

    log_info "block-builder started (PID $BUILDER_PID)"
    sleep 3

    # Check if builder is still running
    if ! kill -0 "$BUILDER_PID" 2>/dev/null; then
        log_error "block-builder failed to start. Check logs above."
        cleanup
        exit 1
    fi

    # =========================================================================
    # Start load-generator
    # =========================================================================
    log_info "Starting load-generator..."

    (
        cd "$PROJECT_DIR/../loadgenerator"
        EXECUTION_LAYER="reth" \
        BUILDER_RPC_URL="http://localhost:$BUILDER_PORT" \
        L2_RPC_URL="http://localhost:$RETH_HTTP_PORT" \
        L2_WS_URL="ws://localhost:$RETH_WS_PORT" \
        PRECONF_WS_URL="ws://localhost:$BUILDER_PRECONF_PORT/ws/preconfirmations" \
        LISTEN_ADDR=":$LOADGEN_PORT" \
        DATABASE_PATH="$DATA_DIR/loadgen/loadgen.db" \
        BLOCK_TIME_MS="$BLOCK_TIME_MS" \
        go run ./cmd/loadgen 2>&1 | sed 's/^/[loadgen] /'
    ) &
    LOADGEN_PID=$!

    log_info "load-generator started (PID $LOADGEN_PID)"
    sleep 2

    # =========================================================================
    # Start dashboard
    # =========================================================================
    log_info "Starting dashboard (Next.js dev server)..."

    (
        cd "$PROJECT_DIR/dashboard"
        npm run dev 2>&1 | sed 's/^/[dashboard] /'
    ) &
    DASHBOARD_PID=$!

    log_info "dashboard started (PID $DASHBOARD_PID)"

    # =========================================================================
    # Print Status
    # =========================================================================
    echo ""
    echo "=============================================="
    log_success "All services running in Metal mode!"
    echo "=============================================="
    echo ""
    echo "  Services:"
    echo "    op-reth HTTP:     http://localhost:$RETH_HTTP_PORT"
    echo "    op-reth WS:       ws://localhost:$RETH_WS_PORT"
    echo "    op-reth Engine:   http://localhost:$RETH_ENGINE_PORT"
    echo "    block-builder:    http://localhost:$BUILDER_PORT"
    echo "    preconfirmations: ws://localhost:$BUILDER_PRECONF_PORT"
    echo "    load-generator:   http://localhost:$LOADGEN_PORT"
    echo "    dashboard:        http://localhost:$DASHBOARD_PORT"
    echo ""
    echo "  Configuration:"
    echo "    BLOCK_TIME_MS=$BLOCK_TIME_MS"
    echo "    GAS_LIMIT=$GAS_LIMIT"
    echo "    MAX_TXS_PER_BLOCK=$MAX_TXS_PER_BLOCK"
    echo "    ENABLE_PRECONFIRMATIONS=$ENABLE_PRECONFIRMATIONS"
    echo ""
    echo "  Data directory: $DATA_DIR"
    echo ""
    echo "  Press Ctrl+C to stop all services"
    echo ""

    # Wait for any process to exit
    wait
}

main "$@"
