#!/bin/bash
# Hyperlane Deployment Script for Init Container
# Deploys or discovers bridge contracts, generates relayer config, then exits

set -e

export PATH="$HOME/.foundry/bin:$PATH"

L1_RPC="${L1_RPC:-http://l1:8545}"
L2_RPC="${L2_RPC:-http://block-builder:3000}"
OUTPUT_DIR="${OUTPUT_DIR:-/output}"
export HYP_KEY="${HYP_KEY:-0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d}"
DEPLOYER_PRIVATE_KEY="0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
# Account #1 address - must match the private key above!
DEPLOYER_ADDRESS="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"

L1_DOMAIN=31337
L2_DOMAIN=42069

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[hyperlane-init]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[hyperlane-init]${NC} $1"; }
log_error() { echo -e "${RED}[hyperlane-init]${NC} $1"; }

mkdir -p "$OUTPUT_DIR"

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

compute_create_address() {
    local deployer=$1
    local nonce=$2

    python3 << EOF
from Crypto.Hash import keccak

def rlp_encode_address(addr):
    addr_bytes = bytes.fromhex(addr[2:])
    return bytes([0x94]) + addr_bytes

def rlp_encode_nonce(n):
    if n == 0:
        return bytes([0x80])
    elif n < 128:
        return bytes([n])
    else:
        hex_n = hex(n)[2:]
        if len(hex_n) % 2:
            hex_n = '0' + hex_n
        n_bytes = bytes.fromhex(hex_n)
        return bytes([0x80 + len(n_bytes)]) + n_bytes

def compute_create_address(deployer, nonce):
    addr_rlp = rlp_encode_address(deployer)
    nonce_rlp = rlp_encode_nonce(nonce)
    combined = addr_rlp + nonce_rlp
    prefix = bytes([0xc0 + len(combined)])
    rlp_encoded = prefix + combined
    h = keccak.new(digest_bits=256)
    h.update(rlp_encoded)
    return '0x' + h.hexdigest()[-40:]

print(compute_create_address("$deployer", $nonce))
EOF
}

eth_call() {
    local rpc=$1
    local to=$2
    local data=$3

    local result=$(curl -s -X POST -H "Content-Type: application/json" \
        --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_call\",\"params\":[{\"to\":\"$to\",\"data\":\"$data\"},\"latest\"],\"id\":1}" \
        "$rpc" 2>/dev/null | jq -r '.result // ""')
    echo "$result"
}

eth_get_storage_at() {
    local rpc=$1
    local addr=$2
    local slot=$3

    local result=$(curl -s -X POST -H "Content-Type: application/json" \
        --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getStorageAt\",\"params\":[\"$addr\",\"$slot\",\"latest\"],\"id\":1}" \
        "$rpc" 2>/dev/null | jq -r '.result // "0x"')
    echo "$result"
}

find_mailbox_address() {
    local rpc=$1
    local expected_domain=$2
    local deployer=$3
    local max_retries=3
    local retry=0

    while [ $retry -lt $max_retries ]; do
        log_info "Scanning for mailbox with domain $expected_domain (attempt $((retry+1))/$max_retries)..." >&2

        local nonce=$(eth_get_nonce "$rpc" "$deployer")
        log_info "Deployer has $nonce transactions, scanning for mailbox..." >&2

        if [ "$nonce" -eq 0 ]; then
            log_warn "Deployer has 0 transactions, contracts may not be deployed yet" >&2
            sleep 5
            retry=$((retry + 1))
            continue
        fi

        for i in $(seq $((nonce-1)) -1 0); do
            local addr=$(compute_create_address "$deployer" "$i")

            if [ -z "$addr" ]; then
                continue
            fi

            local code=$(eth_get_code "$rpc" "$addr")
            if [ "$code" = "0x" ] || [ ${#code} -lt 10 ]; then
                continue
            fi

            # Check for localDomain() - selector 0x8d3638f4
            local domain_hex=$(eth_call "$rpc" "$addr" "0x8d3638f4")

            if [ -n "$domain_hex" ] && [ "$domain_hex" != "" ] && [ "$domain_hex" != "0x" ]; then
                local domain_dec=$(printf "%d" "$domain_hex" 2>/dev/null || echo "0")
                if [ "$domain_dec" = "$expected_domain" ]; then
                    # Verify it's a Mailbox by checking for nonce() function
                    # Selector for nonce() is 0xaffed0e0
                    # HypNativeSimple doesn't have this, TestMailbox does
                    local nonce_hex=$(eth_call "$rpc" "$addr" "0xaffed0e0")
                    if [ -n "$nonce_hex" ] && [ "$nonce_hex" != "0x" ]; then
                        log_info "Found mailbox at $addr (domain: $domain_dec)" >&2
                        echo "$addr"
                        return 0
                    fi
                fi
            fi
        done

        log_warn "Mailbox not found on attempt $((retry+1)), retrying in 5s..." >&2
        sleep 5
        retry=$((retry + 1))
    done

    log_error "Could not find mailbox for domain $expected_domain after $max_retries attempts" >&2
    echo ""
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

# Find the Hook address by scanning deployer transactions
# The Hook is deployed at nonce 1 (ISM=0, Hook=1, Mailbox=2, WarpRoute=3)
find_hook_address() {
    local rpc=$1
    local deployer=$2

    local nonce=$(eth_get_nonce "$rpc" "$deployer")
    if [ "$nonce" -lt 2 ]; then
        echo ""
        return 1
    fi

    # Hook is at nonce 1 (second deployment)
    local hook_addr=$(compute_create_address "$deployer" 1)
    local code=$(eth_get_code "$rpc" "$hook_addr")

    if [ "$code" = "0x" ] || [ ${#code} -lt 10 ]; then
        log_warn "No contract found at expected hook address $hook_addr" >&2
        echo ""
        return 1
    fi

    # Verify it's the Hook by checking it has postDispatch function selector
    # TestHook inherits from AbstractPostDispatchHook which has postDispatch
    # We can also just trust the deployment order since we control it
    log_info "Found hook at $hook_addr (nonce 1)" >&2
    echo "$hook_addr"
    return 0
}

deploy_with_foundry() {
    local rpc=$1
    local chain_name=$2

    log_info "Deploying bridge contracts to $chain_name via Foundry..."

    cd /app

    # Set PRIVATE_KEY env var for the Solidity script's vm.envOr()
    local output=$(PRIVATE_KEY="$DEPLOYER_PRIVATE_KEY" forge script script/DeployBridge.s.sol \
        --rpc-url "$rpc" \
        --broadcast \
        --private-key "$DEPLOYER_PRIVATE_KEY" \
        2>&1) || {
        log_error "Foundry deployment failed: $output"
        return 1
    }

    log_info "Foundry deployment output:"
    echo "$output"

    return 0
}

enroll_routers() {
    local rpc=$1
    local l1_warp=$2
    local l2_warp=$3
    local chain_name=$4

    log_info "Enrolling routers on $chain_name..."

    cd /app

    # Set PRIVATE_KEY env var for the Solidity script's vm.envOr()
    local output=$(PRIVATE_KEY="$DEPLOYER_PRIVATE_KEY" L1_WARP="$l1_warp" L2_WARP="$l2_warp" \
        forge script script/EnrollRouters.s.sol \
        --rpc-url "$rpc" \
        --broadcast \
        --private-key "$DEPLOYER_PRIVATE_KEY" \
        2>&1) || {
        log_error "Router enrollment failed: $output"
        return 1
    }

    log_info "Router enrollment output:"
    echo "$output"

    return 0
}

get_warp_address_from_deployment() {
    local rpc=$1
    local domain=$2

    local nonce=$(eth_get_nonce "$rpc" "$DEPLOYER_ADDRESS")

    if [ "$nonce" -eq 0 ]; then
        echo ""
        return 1
    fi

    # Scan for HypNativeSimple warp route
    # It has mailbox() function (0xd5438eae) that TestMailbox doesn't have
    for i in $(seq $((nonce-1)) -1 0); do
        local addr=$(compute_create_address "$DEPLOYER_ADDRESS" "$i")
        local code=$(eth_get_code "$rpc" "$addr")

        if [ "$code" = "0x" ] || [ ${#code} -lt 10 ]; then
            continue
        fi

        # Check for mailbox() function - returns address of the mailbox
        # This distinguishes HypNativeSimple (warp route) from TestMailbox
        local mailbox_hex=$(eth_call "$rpc" "$addr" "0xd5438eae")
        if [ -n "$mailbox_hex" ] && [ "$mailbox_hex" != "0x" ] && [ ${#mailbox_hex} -ge 42 ]; then
            # Verify it's not just any contract - it should also have localDomain
            local domain_hex=$(eth_call "$rpc" "$addr" "0x8d3638f4")
            if [ -n "$domain_hex" ] && [ "$domain_hex" != "0x" ]; then
                local domain_dec=$(printf "%d" "$domain_hex" 2>/dev/null || echo "0")
                if [ "$domain_dec" = "$domain" ]; then
                    log_info "Found warp route at $addr (domain: $domain_dec, mailbox: $mailbox_hex)" >&2
                    echo "$addr"
                    return 0
                fi
            fi
        fi
    done

    echo ""
    return 1
}

main() {
    log_info "Starting Hyperlane setup..."
    log_info "L1 RPC: $L1_RPC"
    log_info "L2 RPC: $L2_RPC"
    log_info "Output dir: $OUTPUT_DIR"

    wait_for_rpc "L1" "$L1_RPC"
    wait_for_rpc "L2" "$L2_RPC"

    log_info "Waiting for block builder to initialize..."
    sleep 5

    local MAILBOX_ADDR=""
    local L1_WARP=""
    local L2_WARP=""

    local l1_deployed=false
    local l2_deployed=false

    log_info "Checking if contracts are already deployed..."

    local nonce=$(eth_get_nonce "$L1_RPC" "$DEPLOYER_ADDRESS")
    if [ "$nonce" -gt 0 ]; then
        log_info "L1 has $nonce transactions, checking for existing contracts..."

        for i in $(seq $((nonce-1)) -1 0); do
            local addr=$(compute_create_address "$DEPLOYER_ADDRESS" "$i")
            local code=$(eth_get_code "$L1_RPC" "$addr")

            if [ "$code" = "0x" ] || [ ${#code} -lt 10 ]; then
                continue
            fi

            local domain_hex=$(eth_call "$L1_RPC" "$addr" "0x8d3638f4")
            if [ -n "$domain_hex" ] && [ "$domain_hex" != "0x" ]; then
                # Validate domain matches expected L1_DOMAIN
                local domain_dec=$(printf "%d" "$domain_hex" 2>/dev/null || echo "0")
                if [ "$domain_dec" = "$L1_DOMAIN" ]; then
                    # Verify it's a Mailbox (has nonce() function), not warp route
                    local nonce_hex=$(eth_call "$L1_RPC" "$addr" "0xaffed0e0")
                    if [ -n "$nonce_hex" ] && [ "$nonce_hex" != "0x" ]; then
                        MAILBOX_ADDR="$addr"
                        l1_deployed=true
                        log_info "Found L1 mailbox at $MAILBOX_ADDR (domain: $domain_dec)"
                        break
                    fi
                fi
            fi
        done
    fi

    if [ "$l1_deployed" = "false" ]; then
        log_info "No L1 contracts found, deploying..."

        if deploy_with_foundry "$L1_RPC" "L1"; then
            l1_deployed=true
            sleep 3
            MAILBOX_ADDR=$(find_mailbox_address "$L1_RPC" "$L1_DOMAIN" "$DEPLOYER_ADDRESS")
            if [ -z "$MAILBOX_ADDR" ]; then
                log_error "Failed to find L1 mailbox after deployment"
                exit 1
            fi
            log_info "L1 mailbox deployed at: $MAILBOX_ADDR"
        else
            log_error "L1 deployment failed"
            exit 1
        fi
    fi

    log_info "Checking L2 contracts..."
    nonce=$(eth_get_nonce "$L2_RPC" "$DEPLOYER_ADDRESS")
    # Limit scan to most recent 100 transactions to avoid slow iteration
    local scan_limit=100
    local start_nonce=$((nonce-1))
    local end_nonce=$((nonce > scan_limit ? nonce - scan_limit : 0))
    if [ "$nonce" -gt 0 ]; then
        log_info "Deployer has $nonce transactions, scanning last $scan_limit..."
        for i in $(seq $start_nonce -1 $end_nonce); do
            local addr=$(compute_create_address "$DEPLOYER_ADDRESS" "$i")
            local code=$(eth_get_code "$L2_RPC" "$addr")

            if [ "$code" = "0x" ] || [ ${#code} -lt 10 ]; then
                continue
            fi

            local domain_hex=$(eth_call "$L2_RPC" "$addr" "0x8d3638f4")
            if [ -n "$domain_hex" ] && [ "$domain_hex" != "0x" ]; then
                local l2_domain_dec=$(printf "%d" "$domain_hex" 2>/dev/null || echo "0")
                if [ "$l2_domain_dec" = "$L2_DOMAIN" ]; then
                    # Verify it's a Mailbox (has nonce() function), not warp route
                    local nonce_hex=$(eth_call "$L2_RPC" "$addr" "0xaffed0e0")
                    if [ -n "$nonce_hex" ] && [ "$nonce_hex" != "0x" ]; then
                        l2_deployed=true
                        log_info "Found L2 mailbox at $addr"
                        break
                    fi
                fi
            fi
        done
    fi

    if [ "$l2_deployed" = "false" ]; then
        log_info "No L2 contracts found, deploying..."

        if deploy_with_foundry "$L2_RPC" "L2"; then
            l2_deployed=true
            sleep 3
            local L2_MAILBOX_ADDR=$(find_mailbox_address "$L2_RPC" "$L2_DOMAIN" "$DEPLOYER_ADDRESS")
            if [ -z "$L2_MAILBOX_ADDR" ]; then
                log_error "Failed to find L2 mailbox after deployment"
                exit 1
            fi
            log_info "L2 mailbox deployed at: $L2_MAILBOX_ADDR"
        else
            log_error "L2 deployment failed"
            exit 1
        fi
    fi

    # Enroll routers if both chains have mailboxes (idempotent operation)
    if [ "$l1_deployed" = "true" ] && [ "$l2_deployed" = "true" ]; then
        log_info "Both chains have contracts, enrolling routers..."

        # Use || true to prevent set -e from exiting on return 1
        L1_WARP=$(get_warp_address_from_deployment "$L1_RPC" "$L1_DOMAIN") || true
        L2_WARP=$(get_warp_address_from_deployment "$L2_RPC" "$L2_DOMAIN") || true

        if [ -n "$L1_WARP" ] && [ -n "$L2_WARP" ]; then
            log_info "L1 Warp Route: $L1_WARP"
            log_info "L2 Warp Route: $L2_WARP"

            enroll_routers "$L1_RPC" "$L1_WARP" "$L2_WARP" "L1"
            enroll_routers "$L2_RPC" "$L1_WARP" "$L2_WARP" "L2"
        else
            log_warn "Could not find warp route addresses, skipping router enrollment"
        fi
    fi

    log_info "Discovering mailbox addresses..."
    local L1_MAILBOX=$(find_mailbox_address "$L1_RPC" "$L1_DOMAIN" "$DEPLOYER_ADDRESS")
    local L2_MAILBOX=$(find_mailbox_address "$L2_RPC" "$L2_DOMAIN" "$DEPLOYER_ADDRESS")

    if ! is_valid_address "$L1_MAILBOX"; then
        log_error "CRITICAL: Could not find L1 mailbox address"
        exit 1
    fi
    if ! is_valid_address "$L2_MAILBOX"; then
        log_error "CRITICAL: Could not find L2 mailbox address"
        exit 1
    fi

    log_info "L1 Mailbox: $L1_MAILBOX"
    log_info "L2 Mailbox: $L2_MAILBOX"

    if [ -z "$L1_WARP" ]; then
        L1_WARP=$(get_warp_address_from_deployment "$L1_RPC" "$L1_DOMAIN") || true
    fi
    if [ -z "$L2_WARP" ]; then
        L2_WARP=$(get_warp_address_from_deployment "$L2_RPC" "$L2_DOMAIN") || true
    fi

    log_info "L1 Warp Route: ${L1_WARP:-not found}"
    log_info "L2 Warp Route: ${L2_WARP:-not found}"

    # Fund warp routes with ETH so they can pay out bridge transfers
    # L2 warp route needs ETH for L1→L2 bridging, L1 for L2→L1
    local FUND_AMOUNT="100ether"
    if [ -n "$L2_WARP" ]; then
        local l2_warp_balance=$(cast balance "$L2_WARP" --rpc-url "$L2_RPC" 2>/dev/null || echo "0")
        if [ "$l2_warp_balance" = "0" ]; then
            log_info "Funding L2 warp route with $FUND_AMOUNT..."
            cast send "$L2_WARP" --value "$FUND_AMOUNT" \
                --private-key "$DEPLOYER_PRIVATE_KEY" --rpc-url "$L2_RPC" > /dev/null 2>&1 || \
                log_warn "Failed to fund L2 warp route"
            log_info "L2 warp route funded: $(cast balance "$L2_WARP" --ether --rpc-url "$L2_RPC" 2>/dev/null) ETH"
        else
            log_info "L2 warp route already funded: $(cast balance "$L2_WARP" --ether --rpc-url "$L2_RPC" 2>/dev/null) ETH"
        fi
    fi
    if [ -n "$L1_WARP" ]; then
        local l1_warp_balance=$(cast balance "$L1_WARP" --rpc-url "$L1_RPC" 2>/dev/null || echo "0")
        if [ "$l1_warp_balance" = "0" ]; then
            log_info "Funding L1 warp route with $FUND_AMOUNT..."
            cast send "$L1_WARP" --value "$FUND_AMOUNT" \
                --private-key "$DEPLOYER_PRIVATE_KEY" --rpc-url "$L1_RPC" > /dev/null 2>&1 || \
                log_warn "Failed to fund L1 warp route"
            log_info "L1 warp route funded: $(cast balance "$L1_WARP" --ether --rpc-url "$L1_RPC" 2>/dev/null) ETH"
        else
            log_info "L1 warp route already funded: $(cast balance "$L1_WARP" --ether --rpc-url "$L1_RPC" 2>/dev/null) ETH"
        fi
    fi

    # Find the Hook addresses (deployed at nonce 1 on each chain)
    local L1_HOOK=$(find_hook_address "$L1_RPC" "$DEPLOYER_ADDRESS") || true
    local L2_HOOK=$(find_hook_address "$L2_RPC" "$DEPLOYER_ADDRESS") || true

    # Fall back to mailbox if hook not found (shouldn't happen with our deployment)
    if [ -z "$L1_HOOK" ]; then
        log_warn "L1 Hook not found, using mailbox address (may cause relayer issues)"
        L1_HOOK="$L1_MAILBOX"
    fi
    if [ -z "$L2_HOOK" ]; then
        log_warn "L2 Hook not found, using mailbox address (may cause relayer issues)"
        L2_HOOK="$L2_MAILBOX"
    fi

    log_info "L1 Hook: $L1_HOOK"
    log_info "L2 Hook: $L2_HOOK"

    # Set mailbox reference on hooks (idempotent - setMailbox reverts if already set)
    if [ -n "$L1_HOOK" ] && [ "$L1_HOOK" != "$L1_MAILBOX" ]; then
        local l1_hook_mailbox=$(cast call "$L1_HOOK" "mailbox()(address)" --rpc-url "$L1_RPC" 2>/dev/null || echo "")
        if [ "$l1_hook_mailbox" = "0x0000000000000000000000000000000000000000" ]; then
            log_info "Setting mailbox on L1 hook..."
            cast send "$L1_HOOK" "setMailbox(address)" "$L1_MAILBOX" \
                --private-key "$DEPLOYER_PRIVATE_KEY" --rpc-url "$L1_RPC" > /dev/null 2>&1 || \
                log_warn "Failed to set L1 hook mailbox (may already be set)"
        fi
    fi
    if [ -n "$L2_HOOK" ] && [ "$L2_HOOK" != "$L2_MAILBOX" ]; then
        local l2_hook_mailbox=$(cast call "$L2_HOOK" "mailbox()(address)" --rpc-url "$L2_RPC" 2>/dev/null || echo "")
        if [ "$l2_hook_mailbox" = "0x0000000000000000000000000000000000000000" ]; then
            log_info "Setting mailbox on L2 hook..."
            cast send "$L2_HOOK" "setMailbox(address)" "$L2_MAILBOX" \
                --private-key "$DEPLOYER_PRIVATE_KEY" --rpc-url "$L2_RPC" > /dev/null 2>&1 || \
                log_warn "Failed to set L2 hook mailbox (may already be set)"
        fi
    fi

    log_info "Generating relayer config..."

    # Note: merkleTreeHook points to TestHook which emits InsertedIntoTree events.
    # The relayer may have issues decoding these, but it's required for config.
    # validatorAnnounce and interchainGasPaymaster are pointed at the mailbox as dummies.
    cat > "$OUTPUT_DIR/relayer.json" << EOF
{
  "chains": {
    "l1local": {
      "name": "l1local",
      "domainId": $L1_DOMAIN,
      "chainId": 1,
      "protocol": "ethereum",
      "rpcConsensusType": "fallback",
      "rpcUrls": [
        { "http": "http://l1:8545" }
      ],
      "blocks": {
        "confirmations": 1,
        "reorgPeriod": 0,
        "estimateBlockTime": 12
      },
      "index": {
        "from": 1
      },
      "mailbox": "$L1_MAILBOX",
      "merkleTreeHook": "$L1_HOOK",
      "interchainGasPaymaster": "$L1_MAILBOX",
      "validatorAnnounce": "$L1_MAILBOX"
    },
    "l2local": {
      "name": "l2local",
      "domainId": $L2_DOMAIN,
      "chainId": 42069,
      "protocol": "ethereum",
      "rpcConsensusType": "fallback",
      "rpcUrls": [
        { "http": "http://block-builder:3000" }
      ],
      "blocks": {
        "confirmations": 1,
        "reorgPeriod": 0,
        "estimateBlockTime": 1
      },
      "index": {
        "from": 1
      },
      "mailbox": "$L2_MAILBOX",
      "merkleTreeHook": "$L2_HOOK",
      "interchainGasPaymaster": "$L2_MAILBOX",
      "validatorAnnounce": "$L2_MAILBOX"
    }
  },
  "relayChains": "l1local,l2local",
  "db": "/data/relayer-db",
  "metricsPort": 9090,
  "defaultSigner": {
    "type": "hexKey",
    "key": "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
  }
}
EOF

    log_info "Relayer config written to $OUTPUT_DIR/relayer.json"

    cat > "$OUTPUT_DIR/addresses.json" << EOF
{
  "l1": {
    "domainId": $L1_DOMAIN,
    "mailbox": "$L1_MAILBOX",
    "warpRoute": "${L1_WARP:-}",
    "hook": "$L1_HOOK"
  },
  "l2": {
    "domainId": $L2_DOMAIN,
    "mailbox": "$L2_MAILBOX",
    "warpRoute": "${L2_WARP:-}",
    "hook": "$L2_HOOK"
  }
}
EOF

    log_info "Dashboard addresses written to $OUTPUT_DIR/addresses.json"

    log_info "Generated configs in $OUTPUT_DIR:"
    ls -la "$OUTPUT_DIR/"

    log_info "Hyperlane init complete!"

    if [ "$l1_deployed" = "true" ] && [ "$l2_deployed" = "true" ]; then
        log_info "Bridge is ready to use! Contracts deployed and routers enrolled."
    else
        log_info "Bridge is ready with existing contracts."
    fi
}

monitor_contracts() {
    local check_interval="${MONITOR_INTERVAL:-30}"
    local mailbox_addr=""

    # Read mailbox address from generated config
    if [ -f "$OUTPUT_DIR/addresses.json" ]; then
        mailbox_addr=$(jq -r '.l1.mailbox // ""' "$OUTPUT_DIR/addresses.json" 2>/dev/null || echo "")
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

            # Clear relayer DB so it doesn't get confused by stale block references
            if [ -d "/relayer-data/relayer-db" ]; then
                log_info "Clearing stale relayer DB..."
                rm -rf /relayer-data/relayer-db/* 2>/dev/null || true
            fi

            # Re-run deployment
            main "$@"

            # Re-read the mailbox address (may be the same due to deterministic CREATE)
            if [ -f "$OUTPUT_DIR/addresses.json" ]; then
                mailbox_addr=$(jq -r '.l1.mailbox // ""' "$OUTPUT_DIR/addresses.json" 2>/dev/null || echo "")
            fi
        fi
    done
}

main "$@"
monitor_contracts "$@"
