#!/bin/bash
# Bridge diagnostic tool
# Usage: ./scripts/bridge-debug.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

L1_RPC="${L1_RPC:-http://localhost:18545}"
L2_RPC="${L2_RPC:-http://localhost:13000}"

# Get addresses from Docker container
get_addresses() {
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "gasstorm-relayer"; then
        docker exec gasstorm-relayer cat /config/addresses.json 2>/dev/null
    fi
}

ADDRS=$(get_addresses)
L1_MAILBOX=$(echo "$ADDRS" | jq -r '.l1.mailbox')
L2_MAILBOX=$(echo "$ADDRS" | jq -r '.l2.mailbox')
L1_WARP=$(echo "$ADDRS" | jq -r '.l1.warpRoute')
L2_WARP=$(echo "$ADDRS" | jq -r '.l2.warpRoute')
L1_HOOK=$(echo "$ADDRS" | jq -r '.l1.hook')
L2_HOOK=$(echo "$ADDRS" | jq -r '.l2.hook')

echo "=========================================="
echo "HYPERLANE BRIDGE DIAGNOSTICS"
echo "=========================================="
echo ""

echo "=== Contract Addresses ==="
echo "L1 Mailbox:    $L1_MAILBOX"
echo "L2 Mailbox:    $L2_MAILBOX"
echo "L1 Warp Route: $L1_WARP"
echo "L2 Warp Route: $L2_WARP"
echo "L1 Hook:       $L1_HOOK"
echo "L2 Hook:       $L2_HOOK"
echo ""

echo "=== Chain Status ==="
echo "L1 Block: $(cast block-number --rpc-url $L1_RPC)"
echo "L2 Block: $(cast block-number --rpc-url $L2_RPC)"
echo ""

echo "=== Mailbox Nonces (Messages Dispatched) ==="
L1_NONCE=$(cast call $L1_MAILBOX "nonce()(uint32)" --rpc-url $L1_RPC)
L2_NONCE=$(cast call $L2_MAILBOX "nonce()(uint32)" --rpc-url $L2_RPC)
echo "L1 Mailbox nonce: $L1_NONCE (messages sent FROM L1)"
echo "L2 Mailbox nonce: $L2_NONCE (messages sent FROM L2)"
echo ""

echo "=== Hook Counts (Messages Indexed by Relayer) ==="
L1_HOOK_COUNT=$(cast call $L1_HOOK "count()(uint32)" --rpc-url $L1_RPC)
L2_HOOK_COUNT=$(cast call $L2_HOOK "count()(uint32)" --rpc-url $L2_RPC)
echo "L1 Hook count: $L1_HOOK_COUNT"
echo "L2 Hook count: $L2_HOOK_COUNT"
echo ""

echo "=== Warp Route Balances (Collateral) ==="
L1_WARP_BAL=$(cast balance $L1_WARP --rpc-url $L1_RPC)
L2_WARP_BAL=$(cast balance $L2_WARP --rpc-url $L2_RPC)
echo "L1 Warp balance: $(cast from-wei $L1_WARP_BAL) ETH"
echo "L2 Warp balance: $(cast from-wei $L2_WARP_BAL) ETH"
echo ""

echo "=== Relayer Status ==="
RELAYER_STATUS=$(docker compose -f "$PROJECT_DIR/docker/docker-compose.yml" ps hyperlane-relayer --format '{{.State}}' 2>/dev/null || echo "unknown")
echo "Relayer container: $RELAYER_STATUS"

# Check for recent errors
echo ""
echo "=== Recent Relayer Errors (last 50 lines) ==="
docker compose -f "$PROJECT_DIR/docker/docker-compose.yml" logs hyperlane-relayer --tail 50 2>&1 | grep -i -E "error|warn|fail" | tail -10 || echo "No recent errors"

echo ""
echo "=== Recent Dispatch Events (L1 → L2) ==="
echo "Getting last 5 Dispatch events from L1..."
cast logs --from-block 1 --to-block latest --address $L1_MAILBOX --rpc-url $L1_RPC 2>&1 | grep -A5 "0x769f711d20c679153d382254f59892613b58a97cc876b249134ac25c80f9c814" | tail -20 || echo "No events found"

echo ""
echo "=== Recent Dispatch Events (L2 → L1) ==="
echo "Getting last 5 Dispatch events from L2..."
cast logs --from-block 1 --to-block latest --address $L2_MAILBOX --rpc-url $L2_RPC 2>&1 | grep -A5 "0x769f711d20c679153d382254f59892613b58a97cc876b249134ac25c80f9c814" | tail -20 || echo "No events found"

echo ""
echo "=========================================="
echo "DIAGNOSTICS COMPLETE"
echo "=========================================="
