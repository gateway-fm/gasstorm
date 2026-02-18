#!/bin/bash
# Bridge ETH from L1 to L2 using Hyperlane warp route
# Usage: ./scripts/bridge-deposit.sh <amount_in_eth> [recipient]
#
# Prerequisites:
#   - Running L1 (Anvil) and L2 (op-reth) stack
#   - Hyperlane contracts deployed (run ./scripts/deploy-hyperlane.sh first)
#   - foundry (cast) installed

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Configuration
L1_RPC="${L1_RPC:-http://localhost:18545}"
L2_RPC="${L2_RPC:-http://localhost:13000}"
# Use Anvil account #2 for bridge operations (not #0 which is used by load generator, not #1 which is used by Hyperlane deployer)
# Account #2: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
PRIVATE_KEY="${PRIVATE_KEY:-0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a}"

# Amount to bridge (in ETH)
AMOUNT_ETH="${1:-1}"
# Recipient address (defaults to sender)
RECIPIENT="${2:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }

# Get sender address from private key
get_sender_address() {
    cast wallet address "$PRIVATE_KEY"
}

# Get warp route contract addresses from deployment artifacts
get_warp_addresses() {
    # First priority: Check Docker container for addresses (from hyperlane-init)
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "gasstorm-relayer"; then
        local docker_addrs
        docker_addrs=$(docker exec gasstorm-relayer cat /config/addresses.json 2>/dev/null || true)
        if [ -n "$docker_addrs" ]; then
            L1_WARP_ADDRESS=$(echo "$docker_addrs" | jq -r '.l1.warpRoute // empty' 2>/dev/null || true)
            L2_WARP_ADDRESS=$(echo "$docker_addrs" | jq -r '.l2.warpRoute // empty' 2>/dev/null || true)
            if [ -n "$L1_WARP_ADDRESS" ]; then
                log_info "Using addresses from Docker container"
                return
            fi
        fi
    fi

    # Check for warp route addresses in Hyperlane registry
    local hyperlane_dir="$HOME/.hyperlane"

    # Try to find warp route deployment
    if [ -f "$hyperlane_dir/deployments/warp_routes/ETH/l1-addresses.yaml" ]; then
        L1_WARP_ADDRESS=$(grep -E "^router:" "$hyperlane_dir/deployments/warp_routes/ETH/l1-addresses.yaml" 2>/dev/null | awk '{print $2}' || true)
    fi

    if [ -f "$hyperlane_dir/deployments/warp_routes/ETH/l2-addresses.yaml" ]; then
        L2_WARP_ADDRESS=$(grep -E "^router:" "$hyperlane_dir/deployments/warp_routes/ETH/l2-addresses.yaml" 2>/dev/null | awk '{print $2}' || true)
    fi

    # Fallback: check output directory
    if [ -z "$L1_WARP_ADDRESS" ] && [ -f "$PROJECT_DIR/output/hyperlane/warp-addresses.json" ]; then
        L1_WARP_ADDRESS=$(jq -r '.l1.router // empty' "$PROJECT_DIR/output/hyperlane/warp-addresses.json" 2>/dev/null || true)
        L2_WARP_ADDRESS=$(jq -r '.l2.router // empty' "$PROJECT_DIR/output/hyperlane/warp-addresses.json" 2>/dev/null || true)
    fi

    # Check environment variables as final fallback
    L1_WARP_ADDRESS="${L1_WARP_ADDRESS:-$HYP_L1_WARP_ADDRESS}"
    L2_WARP_ADDRESS="${L2_WARP_ADDRESS:-$HYP_L2_WARP_ADDRESS}"

    if [ -z "$L1_WARP_ADDRESS" ]; then
        log_error "L1 warp route address not found"
        log_error "Run ./scripts/deploy-hyperlane.sh first or set HYP_L1_WARP_ADDRESS"
        exit 1
    fi
}

# Check prerequisites
check_prerequisites() {
    log_step "Checking prerequisites..."

    if ! command -v cast &> /dev/null; then
        log_error "cast (foundry) is required but not installed"
        exit 1
    fi

    # Check L1 connectivity
    if ! cast chain-id --rpc-url "$L1_RPC" &> /dev/null; then
        log_error "Cannot connect to L1 at $L1_RPC"
        exit 1
    fi

    # Check L2 connectivity
    if ! cast chain-id --rpc-url "$L2_RPC" &> /dev/null; then
        log_error "Cannot connect to L2 at $L2_RPC"
        exit 1
    fi

    log_info "Prerequisites OK"
}

# Check if Hyperlane relayer is running
check_relayer_health() {
    log_step "Checking Hyperlane relayer status..."

    # Check if docker is available
    if ! command -v docker &> /dev/null; then
        log_warn "Docker not found - cannot verify relayer status"
        return 0
    fi

    # Check if relayer container is running
    local relayer_status
    relayer_status=$(docker compose -f "$PROJECT_DIR/docker-compose.yml" ps hyperlane-relayer --format '{{.State}}' 2>/dev/null || echo "unknown")

    if [ "$relayer_status" = "running" ]; then
        log_info "Relayer is running"
        return 0
    elif [ "$relayer_status" = "unknown" ]; then
        log_warn "Could not check relayer status (docker compose not available or not in project dir)"
        return 0
    else
        log_error "Relayer is not running (status: $relayer_status)"
        log_error "Start the relayer with: docker compose --profile bridge up -d hyperlane-relayer"
        log_error "Or check logs: docker compose logs hyperlane-relayer"
        return 1
    fi
}

# Main bridge deposit function
bridge_deposit() {
    local sender
    sender=$(get_sender_address)

    # Set recipient to sender if not specified
    if [ -z "$RECIPIENT" ]; then
        RECIPIENT="$sender"
    fi

    # Convert amount to wei
    local amount_wei
    amount_wei=$(cast to-wei "$AMOUNT_ETH" ether)

    log_info "Bridge Deposit: L1 -> L2"
    echo "----------------------------------------"
    echo "  From (L1):     $sender"
    echo "  To (L2):       $RECIPIENT"
    echo "  Amount:        $AMOUNT_ETH ETH ($amount_wei wei)"
    echo "  L1 RPC:        $L1_RPC"
    echo "  L2 RPC:        $L2_RPC"
    echo "  Warp Route:    $L1_WARP_ADDRESS"
    echo "----------------------------------------"

    # Get balances before
    log_step "Checking balances before bridge..."
    local l1_balance_before
    local l2_balance_before
    l1_balance_before=$(cast balance "$sender" --rpc-url "$L1_RPC")
    l2_balance_before=$(cast balance "$RECIPIENT" --rpc-url "$L2_RPC")

    log_info "L1 balance (before): $(cast from-wei "$l1_balance_before" ether) ETH"
    log_info "L2 balance (before): $(cast from-wei "$l2_balance_before" ether) ETH"

    # Get quote for interchain gas payment
    log_step "Getting interchain gas quote..."

    # L2 domain ID
    local dest_domain=42069

    # Quote gas (simplified - 200k gas should be enough)
    local gas_quote
    gas_quote=$(cast call "$L1_WARP_ADDRESS" \
        "quoteGasPayment(uint32)(uint256)" \
        "$dest_domain" \
        --rpc-url "$L1_RPC" 2>/dev/null || echo "0")

    log_info "Interchain gas quote: $(cast from-wei "$gas_quote" ether) ETH"

    # Total value = amount + gas quote
    local total_value
    total_value=$(echo "$amount_wei + $gas_quote" | bc)

    # Encode recipient as bytes32 (LEFT-padded for Hyperlane compatibility)
    local recipient_bytes32
    local addr_lower
    addr_lower=$(echo "${RECIPIENT#0x}" | tr 'A-F' 'a-f')
    recipient_bytes32="0x000000000000000000000000${addr_lower}"

    log_step "Sending bridge transaction..."

    # Call transferRemote(uint32 _destination, bytes32 _recipient, uint256 _amount)
    # The function is payable - value covers both the amount and the interchain gas
    local tx_hash
    tx_hash=$(cast send "$L1_WARP_ADDRESS" \
        "transferRemote(uint32,bytes32,uint256)(bytes32)" \
        "$dest_domain" \
        "$recipient_bytes32" \
        "$amount_wei" \
        --value "$total_value" \
        --private-key "$PRIVATE_KEY" \
        --rpc-url "$L1_RPC" \
        --json | jq -r '.transactionHash')

    log_info "Bridge TX submitted: $tx_hash"

    # Wait for L1 confirmation
    log_step "Waiting for L1 confirmation..."
    cast receipt "$tx_hash" --rpc-url "$L1_RPC" > /dev/null
    log_info "L1 transaction confirmed"

    # Get balances after L1 tx
    local l1_balance_after
    l1_balance_after=$(cast balance "$sender" --rpc-url "$L1_RPC")
    log_info "L1 balance (after):  $(cast from-wei "$l1_balance_after" ether) ETH"

    # Wait for L2 message delivery
    log_step "Waiting for relayer to deliver message to L2..."
    log_info "This may take 60-120 seconds depending on block times and relayer latency..."
    log_info "Timeout: 300 seconds (150 attempts x 2s)"

    local attempts=0
    local max_attempts=150  # 150 * 2s = 300 seconds timeout
    local l2_balance_after

    while [ $attempts -lt $max_attempts ]; do
        sleep 2
        l2_balance_after=$(cast balance "$RECIPIENT" --rpc-url "$L2_RPC")

        if [ "$l2_balance_after" != "$l2_balance_before" ]; then
            log_info "L2 balance changed!"
            break
        fi

        attempts=$((attempts + 1))
        # Show progress every 10 attempts (20 seconds)
        if [ $((attempts % 10)) -eq 0 ]; then
            echo " ${attempts}s"
        else
            echo -n "."
        fi
    done
    echo ""

    # Final balances
    log_step "Final balances:"
    log_info "L1 balance: $(cast from-wei "$l1_balance_after" ether) ETH"
    log_info "L2 balance: $(cast from-wei "$l2_balance_after" ether) ETH"

    # Calculate difference
    local l2_diff
    l2_diff=$(echo "$l2_balance_after - $l2_balance_before" | bc)

    if [ "$l2_diff" -gt 0 ]; then
        log_info "Bridge successful! Received $(cast from-wei "$l2_diff" ether) ETH on L2"
    else
        log_warn "L2 balance unchanged. Relayer may not be running or message pending."
        log_warn "Check relayer status: docker compose logs hyperlane-relayer"
    fi

    echo ""
    echo "Bridge deposit complete."
}

# Print usage
usage() {
    echo "Usage: $0 <amount_in_eth> [recipient_address]"
    echo ""
    echo "Arguments:"
    echo "  amount_in_eth     Amount of ETH to bridge (e.g., 1, 0.5)"
    echo "  recipient_address Optional recipient on L2 (defaults to sender)"
    echo ""
    echo "Environment variables:"
    echo "  L1_RPC              L1 RPC URL (default: http://localhost:18545)"
    echo "  L2_RPC              L2 RPC URL (default: http://localhost:13000)"
    echo "  PRIVATE_KEY         Private key for signing (default: Anvil account 2)"
    echo "                      Note: Account 2 is used by default to avoid nonce conflicts"
    echo "                      with load generator (account 0) and Hyperlane deployer (account 1)"
    echo "  HYP_L1_WARP_ADDRESS L1 warp route contract address"
    echo ""
    echo "Example:"
    echo "  $0 1              # Bridge 1 ETH to yourself"
    echo "  $0 0.5 0x123...   # Bridge 0.5 ETH to specific address"
}

# Main
main() {
    if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
        usage
        exit 0
    fi

    if [ -z "$1" ]; then
        usage
        exit 1
    fi

    check_prerequisites
    check_relayer_health
    get_warp_addresses
    bridge_deposit
}

main "$@"
