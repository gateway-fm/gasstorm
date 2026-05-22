#!/bin/sh
set -e

# Privacy Proxy Load Test Setup
# Creates RBAC config (org, group, user) and writes JWT to /shared/loadtest-jwt.txt
# Reference: github.com/gateway-fm/privacy-proxy/cmd/loadtest/setup.go

PROXY_URL="${PROXY_URL:-http://privacy-proxy:8080}"
OUTPUT_FILE="/shared/loadtest-jwt.txt"
MAX_RETRIES=60
RETRY_INTERVAL=2

# ---- Helpers ----------------------------------------------------------------

log() { echo "[privacy-loadtest-setup] $*"; }

api_call() {
    method="$1"
    path="$2"
    body="$3"

    if [ -n "$body" ]; then
        curl -sf -X "$method" "${PROXY_URL}${path}" \
            -H "Content-Type: application/json" \
            -d "$body"
    else
        curl -sf -X "$method" "${PROXY_URL}${path}" \
            -H "Content-Type: application/json"
    fi
}

# ---- Step 1: Wait for privacy-proxy health ----------------------------------

log "Waiting for privacy-proxy at ${PROXY_URL}..."
attempt=0
while [ "$attempt" -lt "$MAX_RETRIES" ]; do
    if curl -sf "${PROXY_URL}/health" > /dev/null 2>&1; then
        log "Privacy proxy is healthy."
        break
    fi
    attempt=$((attempt + 1))
    if [ "$attempt" -ge "$MAX_RETRIES" ]; then
        log "ERROR: Privacy proxy did not become healthy after $((MAX_RETRIES * RETRY_INTERVAL))s"
        exit 1
    fi
    sleep "$RETRY_INTERVAL"
done

# ---- Step 2: Create organization --------------------------------------------

log "Finding or creating loadtest organization..."
# Check if org already exists
EXISTING_ORGS=$(api_call GET "/api/v1/admin/orgs")
ORG_ID=$(echo "$EXISTING_ORGS" | jq -r '.data[] | select(.slug=="loadtest") | .id' 2>/dev/null | head -1)

if [ -n "$ORG_ID" ] && [ "$ORG_ID" != "null" ]; then
    log "Found existing org: loadtest (id: ${ORG_ID})"
else
    ORG_RESP=$(api_call POST "/api/v1/admin/orgs" '{"slug":"loadtest","name":"Load Test Organization"}')
    ORG_ID=$(echo "$ORG_RESP" | jq -r '.id')
    if [ -z "$ORG_ID" ] || [ "$ORG_ID" = "null" ]; then
        log "ERROR: Failed to create org. Response: $ORG_RESP"
        exit 1
    fi
    log "Created org: loadtest (id: ${ORG_ID})"
fi

# ---- Step 3: Create group ---------------------------------------------------

log "Finding or creating loadtest-users group..."
EXISTING_GROUPS=$(api_call GET "/api/v1/admin/orgs/${ORG_ID}/groups")
GROUP_ID=$(echo "$EXISTING_GROUPS" | jq -r '.data[].group | select(.slug=="loadtest-users") | .id' 2>/dev/null | head -1)

if [ -n "$GROUP_ID" ] && [ "$GROUP_ID" != "null" ]; then
    log "Found existing group: loadtest-users (id: ${GROUP_ID})"
else
    GROUP_RESP=$(api_call POST "/api/v1/admin/orgs/${ORG_ID}/groups" '{"slug":"loadtest-users","name":"Load Test Users"}')
    GROUP_ID=$(echo "$GROUP_RESP" | jq -r '.id')
    if [ -z "$GROUP_ID" ] || [ "$GROUP_ID" = "null" ]; then
        log "ERROR: Failed to create group. Response: $GROUP_RESP"
        exit 1
    fi
    log "Created group: loadtest-users (id: ${GROUP_ID})"
fi

# ---- Step 4: Set group access ------------------------------------------------

log "Setting group access permissions..."
ACCESS_BODY=$(cat <<'ENDJSON'
{
    "allowed_methods": [
        "eth_call",
        "eth_sendRawTransaction",
        "eth_sendTransaction",
        "eth_estimateGas",
        "eth_getBalance",
        "eth_getCode",
        "eth_getTransactionCount",
        "eth_getTransactionReceipt",
        "eth_blockNumber",
        "eth_chainId",
        "eth_gasPrice",
        "eth_getLogs",
        "eth_getBlockByNumber",
        "eth_getBlockByHash",
        "net_version"
    ],
    "claims": ["read", "write", "deploy", "admin"]
}
ENDJSON
)

api_call PUT "/api/v1/admin/orgs/${ORG_ID}/groups/${GROUP_ID}/access" "$ACCESS_BODY" > /dev/null
log "Group access permissions set."

# ---- Step 4b: Promote group to org admin (full admin dashboard access) -------

log "Promoting loadtest group to org admin..."
PGPASSWORD=privacy psql -h privacy-db -U privacy -d privacy_proxy -q \
    -c "UPDATE groups SET is_org_admin = true WHERE id = '${GROUP_ID}';" 2>/dev/null
log "Group promoted to org admin."

# ---- Step 5: Authenticate via mock login -------------------------------------

DID="did:test:loadtest"
log "Authenticating mock user (DID: ${DID})..."

# Step 5a: Request auth session
AUTH_REQ_RESP=$(api_call POST "/api/v1/auth/request" "")
SESSION_ID=$(echo "$AUTH_REQ_RESP" | jq -r '.session_id')

if [ -z "$SESSION_ID" ] || [ "$SESSION_ID" = "null" ]; then
    log "ERROR: Failed to get session_id. Response: $AUTH_REQ_RESP"
    exit 1
fi
log "Got session_id: ${SESSION_ID}"

# Step 5b: Verify with mock JWZ token
VERIFY_BODY=$(printf '{"session_id":"%s","jwz_token":"mock.%s"}' "$SESSION_ID" "$DID")
VERIFY_RESP=$(api_call POST "/api/v1/auth/verify" "$VERIFY_BODY")
ACCESS_TOKEN=$(echo "$VERIFY_RESP" | jq -r '.access_token')

if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" = "null" ]; then
    log "ERROR: Failed to get access_token. Response: $VERIFY_RESP"
    exit 1
fi
log "Authenticated successfully."

# ---- Step 6: Find user, update KYC, add to group ----------------------------

log "Finding user by DID..."
USERS_RESP=$(api_call GET "/api/v1/admin/users" "")

# Response is { "data": [...], "limit": N, "offset": N, "total": N }
USER_ID=$(echo "$USERS_RESP" | jq -r --arg did "$DID" '
    if .data then
        .data[] | select(.external_id == $did) | .id
    elif type == "array" then
        .[] | select(.external_id == $did) | .id
    else
        empty
    end
' 2>/dev/null | head -1)

if [ -z "$USER_ID" ] || [ "$USER_ID" = "null" ]; then
    log "ERROR: Could not find user with DID ${DID}. Response: $USERS_RESP"
    exit 1
fi
log "Found user: ${USER_ID}"

# Update KYC status (idempotent)
log "Updating KYC status..."
api_call PUT "/api/v1/admin/users/${USER_ID}" '{"kyc":true}' > /dev/null 2>&1 || true
log "KYC status updated."

# Add user to group (idempotent - may already be a member)
log "Adding user to group..."
MEMBERSHIP_BODY=$(printf '{"org_id":"%s","group_id":"%s"}' "$ORG_ID" "$GROUP_ID")
api_call POST "/api/v1/admin/users/${USER_ID}/memberships" "$MEMBERSHIP_BODY" > /dev/null 2>&1 || true
log "User added to group."

# ---- Step 7: Refresh JWT with updated memberships ----------------------------

log "Refreshing JWT with updated memberships..."

AUTH_REQ_RESP2=$(api_call POST "/api/v1/auth/request" "")
SESSION_ID2=$(echo "$AUTH_REQ_RESP2" | jq -r '.session_id')

VERIFY_BODY2=$(printf '{"session_id":"%s","jwz_token":"mock.%s"}' "$SESSION_ID2" "$DID")
VERIFY_RESP2=$(api_call POST "/api/v1/auth/verify" "$VERIFY_BODY2")
FINAL_TOKEN=$(echo "$VERIFY_RESP2" | jq -r '.access_token')

if [ -z "$FINAL_TOKEN" ] || [ "$FINAL_TOKEN" = "null" ]; then
    log "ERROR: Failed to refresh JWT. Response: $VERIFY_RESP2"
    exit 1
fi

# ---- Step 8: Link load generator ETH addresses to the loadtest user ----------

# The privacy proxy's visibility filter requires ETH addresses to be linked to
# a user's DID via eth_address_links. Without these links, all transactions from
# the load generator are hidden in the explorer.

# Anvil built-in accounts (used by load generator) — lowercase for DB consistency
log "Linking load generator ETH addresses to loadtest user (DID: ${DID})..."

LINKED=0
for ADDR in \
    0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266 \
    0x70997970c51812dc3a010c7d01b50e0d17dc79c8 \
    0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc \
    0x90f79bf6eb2c4f870365e785982e1f101e93b906 \
    0x15d34aaf54267db7d7c367839aaf71a00a2c6a65 \
    0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc \
    0x976ea74026e726554db657fa54763abd0c3a0aa9 \
    0x14dc79964da2c08da15fd353d30fd1c45e8c0990 \
    0x23618e81e3f5cdf7f54c3d65f7fbc0abf5b21e8f \
    0xa0ee7a142d267c1f36714e4a8f75612f20a79720
do
    PGPASSWORD=privacy psql -h privacy-db -U privacy -d privacy_proxy -q \
        -c "INSERT INTO eth_address_links (did, eth_address, link_type, verified_at) VALUES ('$DID', '$ADDR', 'system', NOW()) ON CONFLICT (did, eth_address) DO NOTHING;" 2>/dev/null \
        && LINKED=$((LINKED + 1))
done
log "Linked ${LINKED} ETH addresses to loadtest user."

# ---- Step 9: Register loadtest contracts under the loadtest org -------------

# Why this step exists:
# The privacy-proxy's explorer visibility filter is an allowlist (AllPrivate=true)
# built from `eth_address_links` (EOAs) + `contracts` (org-registered contracts)
# intersected with the viewer's VisibilityFull set. A tx is shown only if from
# OR to is in that set. The load generator scales out to many distinct sender
# EOAs that we cannot enumerate up-front (and don't want to link individually),
# so the practical bypass is to register the receiver-side contracts under the
# loadtest org. The loadtest group is is_org_admin=true, which grants its members
# VisibilityFull on every contract in the org, so every tx touching one of these
# contracts becomes visible to the loadtest user.
#
# Contract addresses below are deterministic CREATE addresses from
# Anvil/Hardhat account 0 (0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266) at
# sequential nonces 0..15 — covers the load-generator's ERC20 deploy at nonce
# 0 plus the first several Uniswap-style deploys.

log "Registering loadtest contracts under the loadtest org..."
REGISTERED=0
for ADDR in \
    0x5fbdb2315678afecb367f032d93f642f64180aa3 \
    0xe7f1725e7734ce288f8367e1bb143e90bb3f0512 \
    0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0 \
    0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9 \
    0xdc64a140aa3e981100a9beca4e685f962f0cf6c9 \
    0x5fc8d32690cc91d4c39d9d3abcbd16989f875707 \
    0x0165878a594ca255338adfa4d48449f69242eb8f \
    0xa513e6e4b8f2a923d98304ec87f64353c4d5c853 \
    0x2279b7a0a67db372996a5fab50d91eaa73d2ebe6 \
    0x8a791620dd6260079bf849dc5567adc3f2fdc318 \
    0xb7f8bc63bbcad18155201308c8f3540b07f84f5e \
    0x610178da211fef7d417bc0e6fed39f05609ad788 \
    0xb7a5bd0345ef1cc5e66bf61bdec17d2461fbd968 \
    0x4ed7c70f96b99c776995fb64377f0d4ab3b0e1c1 \
    0x322813fd9a801c5507c9de605d63cea4f2ce6c44 \
    0x4a679253410272dd5232b3ff7cf5dbb88f295319
do
    PGPASSWORD=privacy psql -h privacy-db -U privacy -d privacy_proxy -q \
        -c "INSERT INTO contracts (org_id, address, name) VALUES ('${ORG_ID}', '$ADDR', 'loadtest-contract') ON CONFLICT (org_id, lower(address::text)) DO NOTHING;" 2>/dev/null \
        && REGISTERED=$((REGISTERED + 1))
done
log "Registered ${REGISTERED} loadtest contract slots under org ${ORG_ID}."

# ---- Step 10: Write JWT to shared volume -------------------------------------

log "Writing JWT to ${OUTPUT_FILE}..."
mkdir -p "$(dirname "$OUTPUT_FILE")"
echo "$FINAL_TOKEN" > "$OUTPUT_FILE"

log "Setup complete."
log "  Org ID:    ${ORG_ID}"
log "  Group ID:  ${GROUP_ID}"
log "  User ID:   ${USER_ID}"
log "  JWT file:  ${OUTPUT_FILE}"
log "  ETH addrs: ${LINKED} linked"
