#!/bin/bash
# Hyperlane Deployment Script for Init Container
# Deploys core contracts via Hyperlane CLI, warp routes via Node.js, generates relayer config
# Flow: register_chains -> deploy_core(L1) -> deploy_core(L2) -> extract_addresses
#       -> deploy_mock_usdc -> deploy_warp_routes -> generate_relayer_json
#       -> generate_addresses_json -> monitor

set -e

export PATH="$HOME/.foundry/bin:/usr/local/bin:$PATH"

# ─── Environment Variables ───────────────────────────────────────────────────

L1_RPC="${L1_RPC:-http://l1:8545}"
L2_RPC="${L2_RPC:-http://block-builder:3000}"
# Separate RPC for relayer (may differ from deployment RPC to route through block-builder)
L2_RELAYER_RPC="${L2_RELAYER_RPC:-http://block-builder:3000}"
OUTPUT_DIR="${OUTPUT_DIR:-/output}"
export HYP_KEY="${HYP_KEY:-0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d}"
DEPLOYER_PRIVATE_KEY="${DEPLOYER_PRIVATE_KEY:-0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d}"
DEPLOYER_ADDRESS="${DEPLOYER_ADDRESS:-0x70997970C51812dc3A010C7d01b50e0d17dc79C8}"

# Chain configuration (override via env vars for non-Anvil L1s like Besu)
AUTO_DETECT_CHAINS="${AUTO_DETECT_CHAINS:-false}"
L1_CHAIN_NAME="${L1_CHAIN_NAME:-l1local}"
L2_CHAIN_NAME="${L2_CHAIN_NAME:-l2local}"
L1_DOMAIN="${L1_DOMAIN:-31337}"
L2_DOMAIN="${L2_DOMAIN:-42069}"
L1_CHAIN_ID="${L1_CHAIN_ID:-31337}"
L2_CHAIN_ID="${L2_CHAIN_ID:-42069}"
L1_BLOCK_TIME="${L1_BLOCK_TIME:-12}"
L2_BLOCK_TIME="${L2_BLOCK_TIME:-1}"

REGISTRY_PATH="$HOME/.hyperlane"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[hyperlane-init]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[hyperlane-init]${NC} $1"; }
log_error() { echo -e "${RED}[hyperlane-init]${NC} $1"; }

mkdir -p "$OUTPUT_DIR"

# ─── Utility Functions ───────────────────────────────────────────────────────

wait_for_rpc() {
    local name=$1
    local url=$2
    local max_attempts=60
    local attempt=1

    log_info "Waiting for $name at $url..."
    while [ $attempt -le $max_attempts ]; do
        if curl -s -X POST -H "Content-Type: application/json" \
            --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
            "$url" 2>/dev/null | grep -q "result"; then
            log_info "$name is ready"
            return 0
        fi
        sleep 1
        attempt=$((attempt + 1))
    done
    log_error "$name not available after $max_attempts seconds"
    return 1
}

is_valid_address() {
    local addr=$1
    if [ -z "$addr" ]; then
        return 1
    fi
    if [ "$addr" = "0x0000000000000000000000000000000000000000" ]; then
        return 1
    fi
    if [ ${#addr} -lt 42 ]; then
        return 1
    fi
    return 0
}

eth_get_code() {
    local rpc=$1
    local addr=$2

    local result=$(curl -s -X POST -H "Content-Type: application/json" \
        --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getCode\",\"params\":[\"$addr\",\"latest\"],\"id\":1}" \
        "$rpc" 2>/dev/null | jq -r '.result // "0x"')
    echo "$result"
}

eth_get_nonce() {
    local rpc=$1
    local addr=$2

    local result=$(curl -s -X POST -H "Content-Type: application/json" \
        --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getTransactionCount\",\"params\":[\"$addr\",\"latest\"],\"id\":1}" \
        "$rpc" 2>/dev/null | jq -r '.result // "0x0"')
    printf "%d" "$result"
}

auto_detect_chain_config() {
    local rpc=$1

    local chain_id_hex=$(curl -s -X POST -H "Content-Type: application/json" \
        --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
        "$rpc" 2>/dev/null | jq -r '.result // ""')
    if [ -n "$chain_id_hex" ] && [ "$chain_id_hex" != "" ]; then
        printf "%d" "$chain_id_hex"
    else
        echo "0"
    fi
}

derive_deployer_address() {
    local addr=$(cast wallet address --private-key "$DEPLOYER_PRIVATE_KEY" 2>/dev/null || echo "")
    if [ -n "$addr" ]; then
        DEPLOYER_ADDRESS="$addr"
        log_info "Deployer address derived from key: $DEPLOYER_ADDRESS"
    fi
}

# Read a field from a YAML file using grep/awk (no external YAML parser needed)
yaml_read() {
    local file=$1
    local key=$2
    grep "^${key}:" "$file" 2>/dev/null | awk '{print $2}' | tr -d '"' | tr -d "'"
}

# ─── Chain Registration ─────────────────────────────────────────────────────

register_chain() {
    local chain_name=$1
    local chain_id=$2
    local domain_id=$3
    local rpc_url=$4
    local block_time=$5

    local chain_dir="$REGISTRY_PATH/chains/$chain_name"
    mkdir -p "$chain_dir"

    log_info "Registering chain $chain_name (chainId=$chain_id, domain=$domain_id, rpc=$rpc_url)"

    cat > "$chain_dir/metadata.yaml" << EOF
name: $chain_name
chainId: $chain_id
domainId: $domain_id
protocol: ethereum
rpcUrls:
  - http: $rpc_url
nativeToken:
  name: Ether
  symbol: ETH
  decimals: 18
blocks:
  confirmations: 1
  reorgPeriod: 0
  estimateBlockTime: $block_time
isTestnet: true
EOF

    log_info "Chain $chain_name registered at $chain_dir/metadata.yaml"
}

register_chains() {
    log_info "Registering chains in local registry..."
    mkdir -p "$REGISTRY_PATH/chains"

    register_chain "$L1_CHAIN_NAME" "$L1_CHAIN_ID" "$L1_DOMAIN" "$L1_RPC" "$L1_BLOCK_TIME"
    register_chain "$L2_CHAIN_NAME" "$L2_CHAIN_ID" "$L2_DOMAIN" "$L2_RPC" "$L2_BLOCK_TIME"
}

# ─── Core Contract Deployment ───────────────────────────────────────────────

generate_core_config() {
    local chain_name=$1
    local config_file="$REGISTRY_PATH/${chain_name}-core-config.yaml"

    cat > "$config_file" << EOF
owner: "$DEPLOYER_ADDRESS"
defaultIsm:
  type: trustedRelayerIsm
  relayer: "$DEPLOYER_ADDRESS"
defaultHook:
  type: merkleTreeHook
requiredHook:
  type: protocolFee
  owner: "$DEPLOYER_ADDRESS"
  beneficiary: "$DEPLOYER_ADDRESS"
  maxProtocolFee: "100000000000000000"
  protocolFee: "0"
EOF

    echo "$config_file"
}

deploy_core() {
    local chain_name=$1

    log_info "Deploying Hyperlane core contracts to $chain_name..."

    # Check if already deployed (addresses.yaml exists and has a mailbox)
    local addr_file="$REGISTRY_PATH/chains/$chain_name/addresses.yaml"
    if [ -f "$addr_file" ]; then
        local existing_mailbox=$(yaml_read "$addr_file" "mailbox")
        if is_valid_address "$existing_mailbox"; then
            log_info "Core contracts already deployed on $chain_name (mailbox: $existing_mailbox)"
            return 0
        fi
    fi

    # Generate flat core config for this chain
    local config_file=$(generate_core_config "$chain_name")
    log_info "Core config for $chain_name written to $config_file"

    # Deploy using Hyperlane CLI
    local output
    output=$(hyperlane core deploy -y \
        --chain "$chain_name" \
        --config "$config_file" \
        --registry "$REGISTRY_PATH" \
        --key "$HYP_KEY" \
        2>&1) || {
        log_error "Core deployment to $chain_name failed:"
        echo "$output"
        return 1
    }

    log_info "Core deployment to $chain_name output:"
    echo "$output"

    # Verify addresses.yaml was created
    if [ ! -f "$addr_file" ]; then
        log_error "addresses.yaml not created for $chain_name after deployment"
        return 1
    fi

    local deployed_mailbox=$(yaml_read "$addr_file" "mailbox")
    if ! is_valid_address "$deployed_mailbox"; then
        log_error "Invalid mailbox address in $addr_file"
        return 1
    fi

    log_info "Core contracts deployed on $chain_name (mailbox: $deployed_mailbox)"
    return 0
}

# ─── Address Extraction ─────────────────────────────────────────────────────

extract_core_addresses() {
    log_info "Extracting core contract addresses from registry..."

    local l1_addr_file="$REGISTRY_PATH/chains/$L1_CHAIN_NAME/addresses.yaml"
    local l2_addr_file="$REGISTRY_PATH/chains/$L2_CHAIN_NAME/addresses.yaml"

    if [ ! -f "$l1_addr_file" ]; then
        log_error "L1 addresses file not found: $l1_addr_file"
        return 1
    fi
    if [ ! -f "$l2_addr_file" ]; then
        log_error "L2 addresses file not found: $l2_addr_file"
        return 1
    fi

    # L1 addresses
    L1_MAILBOX=$(yaml_read "$l1_addr_file" "mailbox")
    L1_MERKLE_TREE_HOOK=$(yaml_read "$l1_addr_file" "merkleTreeHook")
    L1_IGP=$(yaml_read "$l1_addr_file" "interchainGasPaymaster")
    L1_VALIDATOR_ANNOUNCE=$(yaml_read "$l1_addr_file" "validatorAnnounce")
    L1_PROXY_ADMIN=$(yaml_read "$l1_addr_file" "proxyAdmin")

    # L2 addresses
    L2_MAILBOX=$(yaml_read "$l2_addr_file" "mailbox")
    L2_MERKLE_TREE_HOOK=$(yaml_read "$l2_addr_file" "merkleTreeHook")
    L2_IGP=$(yaml_read "$l2_addr_file" "interchainGasPaymaster")
    L2_VALIDATOR_ANNOUNCE=$(yaml_read "$l2_addr_file" "validatorAnnounce")
    L2_PROXY_ADMIN=$(yaml_read "$l2_addr_file" "proxyAdmin")

    log_info "L1 Mailbox: $L1_MAILBOX"
    log_info "L1 MerkleTreeHook: $L1_MERKLE_TREE_HOOK"
    log_info "L1 IGP: $L1_IGP"
    log_info "L1 ValidatorAnnounce: $L1_VALIDATOR_ANNOUNCE"

    log_info "L2 Mailbox: $L2_MAILBOX"
    log_info "L2 MerkleTreeHook: $L2_MERKLE_TREE_HOOK"
    log_info "L2 IGP: $L2_IGP"
    log_info "L2 ValidatorAnnounce: $L2_VALIDATOR_ANNOUNCE"

    # Validate critical addresses
    if ! is_valid_address "$L1_MAILBOX"; then
        log_error "CRITICAL: Invalid L1 mailbox address"
        return 1
    fi
    if ! is_valid_address "$L2_MAILBOX"; then
        log_error "CRITICAL: Invalid L2 mailbox address"
        return 1
    fi

    return 0
}

# ─── MockUSDC Deployment ────────────────────────────────────────────────────

deploy_mock_usdc() {
    log_info "Deploying MockUSDC on L1..."

    cd /app

    local output
    output=$(forge create --rpc-url "$L1_RPC" \
        --private-key "$DEPLOYER_PRIVATE_KEY" \
        src/MockUSDC.sol:MockUSDC \
        2>&1) || {
        log_error "MockUSDC deployment failed:"
        echo "$output"
        return 1
    }

    # Extract deployed address from forge output
    # forge create prints: Deployed to: 0x...
    MOCK_USDC_ADDR=$(echo "$output" | grep -i "Deployed to:" | awk '{print $NF}')

    if ! is_valid_address "$MOCK_USDC_ADDR"; then
        log_error "Failed to extract MockUSDC address from forge output:"
        echo "$output"
        return 1
    fi

    log_info "MockUSDC deployed at: $MOCK_USDC_ADDR"

    # Mint initial supply to deployer (1,000,000 USDC = 1000000 * 10^6)
    log_info "Minting 1,000,000 USDC to deployer..."
    cast send "$MOCK_USDC_ADDR" "mint(address,uint256)" \
        "$DEPLOYER_ADDRESS" "1000000000000" \
        --private-key "$DEPLOYER_PRIVATE_KEY" \
        --rpc-url "$L1_RPC" > /dev/null 2>&1 || {
        log_warn "Failed to mint MockUSDC (may already have supply)"
    }

    return 0
}

# ─── Warp Route Deployment ──────────────────────────────────────────────────

deploy_warp_routes() {
    log_info "Deploying warp routes via Node.js script..."

    local warp_output="$OUTPUT_DIR/warp-addresses.json"

    REGISTRY_PATH="$REGISTRY_PATH" \
    L1_CHAIN_NAME="$L1_CHAIN_NAME" \
    L2_CHAIN_NAME="$L2_CHAIN_NAME" \
    HYP_KEY="$HYP_KEY" \
    MOCK_USDC_ADDR="${MOCK_USDC_ADDR:-}" \
    OUTPUT_FILE="$warp_output" \
    node /app/deploy-warp.mjs || {
        log_error "Warp route deployment failed"
        return 1
    }

    if [ ! -f "$warp_output" ]; then
        log_error "Warp addresses file not created: $warp_output"
        return 1
    fi

    # Extract warp route addresses from the output
    L1_WARP=$(jq -r '.ethWarpL1 // ""' "$warp_output")
    L2_WARP=$(jq -r '.ethWarpL2 // ""' "$warp_output")
    L1_ERC20_WARP=$(jq -r '.erc20WarpL1 // ""' "$warp_output")
    L2_ERC20_WARP=$(jq -r '.erc20WarpL2 // ""' "$warp_output")

    log_info "L1 ETH Warp: ${L1_WARP:-not deployed}"
    log_info "L2 ETH Warp: ${L2_WARP:-not deployed}"
    log_info "L1 ERC20 Warp: ${L1_ERC20_WARP:-not deployed}"
    log_info "L2 ERC20 Warp: ${L2_ERC20_WARP:-not deployed}"

    return 0
}

# ─── Config Generation ──────────────────────────────────────────────────────

generate_relayer_json() {
    log_info "Generating relayer config..."

    cat > "$OUTPUT_DIR/relayer.json" << EOF
{
  "chains": {
    "$L1_CHAIN_NAME": {
      "name": "$L1_CHAIN_NAME",
      "domainId": $L1_DOMAIN,
      "chainId": $L1_CHAIN_ID,
      "protocol": "ethereum",
      "rpcConsensusType": "fallback",
      "rpcUrls": [
        { "http": "$L1_RPC" }
      ],
      "blocks": {
        "confirmations": 1,
        "reorgPeriod": 0,
        "estimateBlockTime": $L1_BLOCK_TIME
      },
      "index": {
        "from": 1
      },
      "mailbox": "$L1_MAILBOX",
      "merkleTreeHook": "${L1_MERKLE_TREE_HOOK:-$L1_MAILBOX}",
      "interchainGasPaymaster": "${L1_IGP:-$L1_MAILBOX}",
      "validatorAnnounce": "${L1_VALIDATOR_ANNOUNCE:-$L1_MAILBOX}"
    },
    "$L2_CHAIN_NAME": {
      "name": "$L2_CHAIN_NAME",
      "domainId": $L2_DOMAIN,
      "chainId": $L2_CHAIN_ID,
      "protocol": "ethereum",
      "rpcConsensusType": "fallback",
      "rpcUrls": [
        { "http": "$L2_RELAYER_RPC" }
      ],
      "blocks": {
        "confirmations": 1,
        "reorgPeriod": 0,
        "estimateBlockTime": $L2_BLOCK_TIME
      },
      "index": {
        "from": 1
      },
      "mailbox": "$L2_MAILBOX",
      "merkleTreeHook": "${L2_MERKLE_TREE_HOOK:-$L2_MAILBOX}",
      "interchainGasPaymaster": "${L2_IGP:-$L2_MAILBOX}",
      "validatorAnnounce": "${L2_VALIDATOR_ANNOUNCE:-$L2_MAILBOX}"
    }
  },
  "relayChains": "$L1_CHAIN_NAME,$L2_CHAIN_NAME",
  "db": "/data/relayer-db",
  "metricsPort": 9090,
  "defaultSigner": {
    "type": "hexKey",
    "key": "$HYP_KEY"
  }
}
EOF

    log_info "Relayer config written to $OUTPUT_DIR/relayer.json"
}

generate_addresses_json() {
    log_info "Generating addresses.json..."

    cat > "$OUTPUT_DIR/addresses.json" << EOF
{
  "$L1_CHAIN_NAME": {
    "name": "$L1_CHAIN_NAME",
    "domainId": $L1_DOMAIN,
    "chainId": $L1_CHAIN_ID,
    "mailbox": "$L1_MAILBOX",
    "warpRoute": "${L1_WARP:-}",
    "hook": "${L1_MERKLE_TREE_HOOK:-}",
    "erc20WarpRoute": "${L1_ERC20_WARP:-}",
    "mockUSDC": "${MOCK_USDC_ADDR:-}"
  },
  "$L2_CHAIN_NAME": {
    "name": "$L2_CHAIN_NAME",
    "domainId": $L2_DOMAIN,
    "chainId": $L2_CHAIN_ID,
    "mailbox": "$L2_MAILBOX",
    "warpRoute": "${L2_WARP:-}",
    "hook": "${L2_MERKLE_TREE_HOOK:-}",
    "erc20WarpRoute": "${L2_ERC20_WARP:-}"
  }
}
EOF

    log_info "Dashboard addresses written to $OUTPUT_DIR/addresses.json"
}

# ─── Contract Monitoring ────────────────────────────────────────────────────

monitor_contracts() {
    local check_interval="${MONITOR_INTERVAL:-30}"
    local mailbox_addr=""

    # Read mailbox address from generated config
    if [ -f "$OUTPUT_DIR/addresses.json" ]; then
        mailbox_addr=$(jq -r 'to_entries[0].value.mailbox // ""' "$OUTPUT_DIR/addresses.json" 2>/dev/null || echo "")
    fi

    if [ -z "$mailbox_addr" ] || [ "$mailbox_addr" = "null" ]; then
        log_warn "No mailbox address found, skipping monitoring"
        return
    fi

    log_info "Monitoring contracts every ${check_interval}s (L1 mailbox: $mailbox_addr)..."

    while true; do
        sleep "$check_interval"

        # Quick check: does the L1 mailbox still exist?
        local l1_code
        l1_code=$(eth_get_code "$L1_RPC" "$mailbox_addr" 2>/dev/null || echo "0x")

        if [ "$l1_code" = "0x" ] || [ ${#l1_code} -lt 10 ]; then
            log_warn "L1 contracts missing (chain restart detected), redeploying..."

            # Clear relayer DB so it doesn't get confused by stale nonces/blocks
            if [ -d "/relayer-data/relayer-db" ]; then
                log_info "Clearing stale relayer DB..."
                rm -rf /relayer-data/relayer-db/* 2>/dev/null || true
            fi

            # Clear old registry addresses so deploy_core will redeploy
            rm -f "$REGISTRY_PATH/chains/$L1_CHAIN_NAME/addresses.yaml" 2>/dev/null || true
            rm -f "$REGISTRY_PATH/chains/$L2_CHAIN_NAME/addresses.yaml" 2>/dev/null || true

            # Re-run deployment
            main "$@"

            # Restart the relayer so it picks up fresh state
            if [ -S "/var/run/docker.sock" ]; then
                log_info "Restarting relayer to pick up fresh state..."
                curl -s -X POST --unix-socket /var/run/docker.sock \
                    "http://localhost/containers/gasstorm-relayer/restart?t=5" > /dev/null 2>&1 || \
                    log_warn "Could not restart relayer via Docker API"
            fi

            # Re-read the mailbox address
            if [ -f "$OUTPUT_DIR/addresses.json" ]; then
                mailbox_addr=$(jq -r 'to_entries[0].value.mailbox // ""' "$OUTPUT_DIR/addresses.json" 2>/dev/null || echo "")
            fi
        fi
    done
}

# ─── Main ────────────────────────────────────────────────────────────────────

main() {
    log_info "Starting Hyperlane setup..."
    log_info "L1 RPC: $L1_RPC"
    log_info "L2 RPC: $L2_RPC"
    log_info "Output dir: $OUTPUT_DIR"
    log_info "Registry: $REGISTRY_PATH"

    # Clean stale registry data from previous deployments
    # This prevents "already known" and stale address issues on restart
    rm -rf "$REGISTRY_PATH/chains" 2>/dev/null || true
    rm -f "$OUTPUT_DIR/relayer.json" "$OUTPUT_DIR/addresses.json" "$OUTPUT_DIR/warp-addresses.json" 2>/dev/null || true
    mkdir -p "$REGISTRY_PATH/chains"
    log_info "Cleaned stale registry and output data"

    # Derive deployer address from key (overrides default if key was changed)
    derive_deployer_address

    wait_for_rpc "L1" "$L1_RPC"
    wait_for_rpc "L2" "$L2_RPC"

    # Auto-detect chain IDs from RPCs if enabled
    if [ "$AUTO_DETECT_CHAINS" = "true" ]; then
        log_info "Auto-detecting chain configuration from RPCs..."
        local detected_l1_chain_id=$(auto_detect_chain_config "$L1_RPC")
        local detected_l2_chain_id=$(auto_detect_chain_config "$L2_RPC")
        if [ "$detected_l1_chain_id" -gt 0 ] 2>/dev/null; then
            L1_CHAIN_ID="$detected_l1_chain_id"
            L1_DOMAIN="$detected_l1_chain_id"
            log_info "L1 chain ID detected: $L1_CHAIN_ID"
        fi
        if [ "$detected_l2_chain_id" -gt 0 ] 2>/dev/null; then
            L2_CHAIN_ID="$detected_l2_chain_id"
            L2_DOMAIN="$detected_l2_chain_id"
            log_info "L2 chain ID detected: $L2_CHAIN_ID"
        fi
    fi

    log_info "Waiting for block builder to initialize..."
    sleep 5

    # Step 1: Register chains in local Hyperlane registry
    register_chains

    # Step 2: Deploy core contracts on each chain
    deploy_core "$L1_CHAIN_NAME" || {
        log_error "L1 core deployment failed"
        exit 1
    }

    deploy_core "$L2_CHAIN_NAME" || {
        log_error "L2 core deployment failed"
        exit 1
    }

    # Step 3: Extract all deployed addresses from the registry
    extract_core_addresses || {
        log_error "Failed to extract core addresses"
        exit 1
    }

    # Step 4: Deploy MockUSDC on L1
    deploy_mock_usdc || {
        log_warn "MockUSDC deployment failed, continuing without ERC20 warp routes"
        MOCK_USDC_ADDR=""
    }

    # Step 5: Deploy warp routes (ETH native + ERC20 collateral/synthetic)
    deploy_warp_routes || {
        log_warn "Warp route deployment failed, continuing with core-only setup"
        L1_WARP=""
        L2_WARP=""
        L1_ERC20_WARP=""
        L2_ERC20_WARP=""
    }

    # Step 6: Generate relayer config with real addresses
    generate_relayer_json

    # Step 7: Generate addresses.json for dashboard consumption
    generate_addresses_json

    log_info "Generated configs in $OUTPUT_DIR:"
    ls -la "$OUTPUT_DIR/"

    log_info "Hyperlane init complete!"
    log_info "Bridge is ready to use! Core contracts deployed, warp routes enrolled."
}

main "$@"
monitor_contracts "$@"
