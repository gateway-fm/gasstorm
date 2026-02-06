# Native Custom Gas Token Support for OP Stack (reth) Mode

## Overview

Enable an L1 ERC20 token to serve as the native gas token on L2, replacing ETH for gas payments.

## Current State

- **op-reth**: v1.9.3 (pre-Isthmus, no custom gas token support)
- **Genesis**: Isthmus disabled (`isthmusTime: 9999999999`)
- **Bridge**: Hyperlane-based (HypNativeSimple), not standard OP bridges
- **Deposit TX**: Infrastructure exists in `deposit.go` but uses Bedrock format

## Approach: Hyperlane with Wrapped Token

Use Hyperlane ERC20 collateral on L1 and a synthetic/wrapped token on L2. Users bridge the L1 ERC20 to receive wrapped tokens on L2, then unwrap to get native gas token balance. This provides unlimited bridging capacity without genesis pre-funding constraints.

**Flow:**
1. User deposits GWT (ERC20) on L1 → Hyperlane locks tokens
2. L2 mints WGWT (wrapped) to user
3. User calls `WGWT.withdraw()` to convert to native GWT balance
4. Native GWT used for gas payments

---

## Phase 1: Infrastructure & Genesis

### 1.1 Update Genesis Configuration

**File:** `genesis/genesis.json`

```json
{
  "config": {
    "fjordTime": 0,
    "graniteTime": 0,
    "holoceneTime": 0,
    "isthmusTime": 0
  }
}
```

- Enable Isthmus upgrade for custom gas token support
- Pre-allocate treasury address with large native balance
- Pre-fund test accounts with custom token balance (not ETH)

### 1.2 Upgrade op-reth (if needed)

**File:** `docker-compose.yml`

```yaml
l2-reth:
  image: ghcr.io/paradigmxyz/op-reth:v1.10.0  # or latest with Isthmus
```

- Test with current v1.9.3 first (may have partial Isthmus support)
- Upgrade only if custom gas token features fail

### 1.3 Update Chain Metadata

**File:** `hyperlane-init/chains/l2/metadata.yaml`

```yaml
nativeToken:
  name: "Gateway Token"  # or user-specified name
  symbol: "GWT"          # or user-specified symbol
  decimals: 18
```

**File:** `bridge-ui/src/consts/chains.yaml` (same changes)

---

## Phase 2: Smart Contracts

### 2.1 Deploy Custom Gas Token on L1

**New file:** `src/CustomGasToken.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract CustomGasToken is ERC20 {
    constructor(uint256 initialSupply) ERC20("Gateway Token", "GWT") {
        _mint(msg.sender, initialSupply);
    }
}
```

**New file:** `script/DeployCustomGasToken.s.sol`

### 2.2 Create ERC20 Collateral Warp Route (L1)

**New file:** `src/HypERC20Collateral.sol`

- Locks GWT tokens on L1 when bridging to L2
- Releases tokens on L2→L1 withdrawals
- Standard Hyperlane collateral pattern

### 2.3 Create Synthetic Warp Route (L2)

**New file:** `src/HypSynthetic.sol`

- Mints wrapped GWT (WGWT) on L2 when receiving Hyperlane messages
- Burns WGWT on L2→L1 withdrawals
- Standard Hyperlane synthetic ERC20 pattern

### 2.4 Create Wrapped Native Token (L2)

**New file:** `src/WGWT.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Wrapped Gateway Token - converts between ERC20 and native balance
contract WGWT is ERC20 {
    constructor() ERC20("Wrapped Gateway Token", "WGWT") {}

    /// @notice Wrap native GWT into WGWT ERC20
    function deposit() external payable {
        _mint(msg.sender, msg.value);
    }

    /// @notice Unwrap WGWT to native GWT balance
    function withdraw(uint256 amount) external {
        _burn(msg.sender, amount);
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
    }

    receive() external payable {
        _mint(msg.sender, msg.value);
    }
}
```

This allows users to convert bridged WGWT tokens to native GWT for gas payments.

### 2.5 Update Deployment Scripts

**File:** `hyperlane-init/deploy.sh`

- Deploy CustomGasToken (GWT) on L1
- Deploy HypERC20Collateral on L1 (replaces HypNativeSimple)
- Deploy HypSynthetic on L2 (mints WGWT on bridge)
- Deploy WGWT on L2 (wrap/unwrap contract)
- Enroll routers between L1 collateral and L2 synthetic

---

## Phase 3: Block Builder Updates

### 3.1 Configuration

**File:** `block-builder/internal/config/config.go`

```go
type Config struct {
    // ... existing ...
    CustomGasTokenEnabled bool   `env:"CUSTOM_GAS_TOKEN_ENABLED" envDefault:"false"`
    CustomGasTokenSymbol  string `env:"CUSTOM_GAS_TOKEN_SYMBOL" envDefault:"GWT"`
}
```

### 3.2 Deposit TX Format (Optional)

**File:** `block-builder/internal/builder/deposit.go`

If Isthmus requires `setL1BlockValuesIsthmus`:

```go
// Add new selector for Isthmus format
SetL1BlockValuesIsthmusSelector = crypto.Keccak256([]byte(
    "setL1BlockValuesIsthmus(uint64,uint64,uint256,bytes32,uint64,bytes32,uint256,uint256,uint256,uint256)"
))[:4]
```

Note: This may not be required if op-reth handles the format internally.

### 3.3 Fee Validation

**File:** `block-builder/rejection.go`

No changes expected - gas fees in custom token still use same EIP-1559 mechanics. The baseFee is denominated in the native token (now custom).

---

## Phase 4: Bridge Integration

### 4.1 Update Warp Route Config

**File:** `bridge-ui/src/consts/warpRoutes.yaml`

```yaml
tokens:
  - chainName: l1local
    standard: EvmHypCollateral
    collateralAddress: "${GWT_L1_ADDRESS}"
    symbol: GWT
    decimals: 18
  - chainName: l2local
    standard: EvmHypSynthetic
    symbol: WGWT
    decimals: 18
```

Note: Bridge UI will show WGWT. Users manually unwrap to native GWT via WGWT contract.

### 4.2 Update Dynamic Config

**File:** `bridge-ui/src/utils/dynamicConfig.ts`

- Load custom token address from deployment output
- Update warp route configuration builder

---

## Phase 5: Load Generator & Testing

### 5.1 Update Account Funding

**File:** `load-generator/internal/account/manager.go`

- Pre-fund accounts with custom gas token (via genesis)
- Remove ETH funding logic

### 5.2 Update Gas Display

**File:** `dashboard/src/components/metrics/metrics-snapshot.tsx`

- Display gas costs in GWT instead of ETH
- Update symbol throughout dashboard

---

## Files to Modify

| File | Changes |
|------|---------|
| `genesis/genesis.json` | Enable Isthmus, add treasury allocation |
| `docker-compose.yml` | Possibly upgrade op-reth image |
| `hyperlane-init/chains/l2/metadata.yaml` | Update nativeToken |
| `bridge-ui/src/consts/chains.yaml` | Update nativeToken |
| `block-builder/internal/config/config.go` | Add custom token config |
| `block-builder/internal/builder/deposit.go` | Possibly update for Isthmus |
| `hyperlane-init/deploy.sh` | Deploy new contracts |
| `bridge-ui/src/consts/warpRoutes.yaml` | Configure collateral route |
| `load-generator/internal/account/manager.go` | Update funding logic |

## New Files to Create

| File | Purpose |
|------|---------|
| `src/CustomGasToken.sol` | L1 ERC20 gas token (GWT) |
| `src/HypERC20Collateral.sol` | L1 warp route (locks GWT) |
| `src/HypSynthetic.sol` | L2 warp route (mints WGWT) |
| `src/WGWT.sol` | L2 wrapped token (WGWT ↔ native GWT) |
| `script/DeployCustomGasToken.s.sol` | Token + warp route deployment |

---

## Verification

### Test 1: Chain Bootstraps with Custom Gas Token
```bash
make stop && make run-reth
# Check logs for Isthmus activation
docker logs sequencer-poc-l2 2>&1 | grep -i isthmus
```

### Test 2: Accounts Have Custom Token Balance
```bash
cast balance 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 --rpc-url http://localhost:18545
# Should return balance in custom token (wei)
```

### Test 3: Transactions Pay Gas in Custom Token
```bash
# Run load test via dashboard
open http://localhost:18000/load-test/
# Verify transactions succeed with custom token gas
```

### Test 4: Bridge Deposit Works
```bash
# Use bridge UI to transfer L1 GWT → L2 WGWT
open http://localhost:18000/bridge/
# Verify recipient receives WGWT on L2
```

### Test 5: Unwrap WGWT to Native GWT
```bash
# Call WGWT.withdraw() to convert to native balance
cast send $WGWT_ADDRESS "withdraw(uint256)" 1000000000000000000 \
  --rpc-url http://localhost:18545 --private-key $PRIVATE_KEY
# Verify native balance increased
cast balance $USER_ADDRESS --rpc-url http://localhost:18545
```

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| op-reth lacks Isthmus support | High | Test first, fall back to custom implementation |
| Genesis reset required | Medium | Accepted - clean bootstrap procedure |
| User friction (unwrap step) | Low | Clear UI guidance, auto-unwrap helper |
| Hyperlane message failures | Medium | Keep existing ETH bridge as fallback |

---

## Decisions Made

- **Token**: Gateway Token (GWT)
- **Chain reset**: Accepted
- **Bridge pattern**: Hyperlane with wrapped token (WGWT on L2)
