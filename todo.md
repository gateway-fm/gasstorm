# GasStorm - TODO

## Current Sprint

### UI Test Stop Behavior (Bug Fix)
- [ ] Dashboard continues showing live data after test stops - should freeze/stop streaming
- [ ] Handle pending transactions when test run stops (show verification phase clearly)
- [ ] Files: `dashboard/src/stores/go-load-test-store.ts`, `dashboard/src/app/load-test/page.tsx`

### Split load-generator main.go (3844 lines -> separate packages) - DEFERRED
60+ functions, would require significant effort to extract cleanly.

---

## Pending

- [ ] **AWS High-Performance Instance Testing** - Validate 25,000 tx/s target on cloud infrastructure

  **Primary Targets: AMD Zen 5 Instances (5.0 GHz)**
  - [ ] Test on `m8azn.metal` - General-purpose high-frequency instance
    - Sustained all-core turbo up to 5.0 GHz (highest in cloud)
    - Good for block builder logic if state fits in memory
  - [ ] Test on `x8aedz.metal` - High-memory variant with same 5.0 GHz
    - Higher memory-to-vCPU ratio for larger state requirements
    - Suitable for architectures keeping entire state trie in RAM

  **Fallback: Apple Silicon Instances (identical to local dev)**
  - [ ] Test on `mac-m4.metal` - Standard M4 (10-core, ~4.4 GHz+)
  - [ ] Test on `mac-m4pro.metal` - M4 Pro (14-core, ~4.4 GHz+)
    - Unified memory architecture matches local benchmarks
    - Should replicate 25,000 tx/s immediately (same silicon)

  **Notes:**
  - AMD 5 GHz clock speed compensates for slight IPC gap vs M4
  - m8azn/x8aedz are only x86_64 instances capable of approaching target without major re-architecture
  - Mac instances eliminate architectural translation variable

- [ ] **Implement Ecotone deposit format** - Block builder only supports Bedrock/Canyon L1 block info format
  - Update `block-builder/internal/builder/deposit.go` to support `setL1BlockValuesEcotone`
  - Ecotone uses packed 32-byte header encoding with blob fee parameters (baseFeeScalar, blobBaseFeeScalar, blobBaseFee)
  - Should detect hardfork activation time from genesis config and switch formats accordingly
  - Currently disabled via `genesis/genesis.json` setting `ecotoneTime: 9999999999`
  - Reference: [OP Stack Ecotone L1 Block Info spec](https://specs.optimism.io/protocol/ecotone/l1-attributes.html)

---

## Hyperlane Bridge Review (2026-01-22)

### Production Readiness: NOT PRODUCTION READY

**Assessment**: Good PoC/demo, suitable blueprint for productionization with significant rework required.

### Critical Security Issues (MUST FIX for production)

- [ ] **Replace TestISM** - Current ISM accepts ALL messages without cryptographic verification (`return true`)
  - Production: Use MultisigISM with 3+ validators or AggregationISM
  - File: `src/TestISM.sol:15`

- [ ] **Remove hardcoded private keys** - Deployer/relayer key exposed in multiple places
  - `docker-compose.yml:298` - HYP_KEY env var
  - `hyperlane-init/deploy.sh` - hardcoded deployer
  - Production: Use KMS (AWS, GCP), HashiCorp Vault, or hardware wallets

- [ ] **TestMailbox lacks production safety checks**
  - No proper merkle tree for message integrity
  - No replay protection beyond simple delivered mapping
  - No rate limiting or gas limits
  - Production: Use Hyperlane's audited Mailbox contract
  - File: `src/TestMailbox.sol`

- [ ] **TestHook returns fake merkle data** - `root()` returns `bytes32(0)`, `latestCheckpoint()` is fake
  - Production: Use real MerkleTreeHook for verifiable message inclusion
  - File: `src/TestISM.sol:82-91`

### High Priority (Should fix before handoff)

- [ ] **Single relayer = single point of failure** - If relayer goes down, bridge stops
  - Production: Multiple redundant relayers, failover mechanisms

- [ ] **No interchain gas payment** - `quoteGasPayment()` returns 0
  - Production: Implement IGP for sustainable operation
  - File: `src/HypNativeSimple.sol:117`

- [ ] **Relayer database state corruption** - Stale DB causes bridge to get stuck (as we experienced)
  - Add: Auto-recovery mechanism or database health checks
  - Document: Clear instructions for resetting relayer state

- [ ] **No circuit breaker/rate limiting** - Unlimited message throughput
  - Production: Rate limit per sender, global limits, pause functionality

- [ ] **Owner is single EOA** - `onlyOwner` modifier on critical functions
  - Production: Use multi-sig (Gnosis Safe) or timelock for governance
  - Files: `HypNativeSimple.sol:49-52`, `TestMailbox.sol:58-61`

### Medium Priority (Polish for handoff)

- [ ] **Add comprehensive E2E tests** - Automated bridge flow tests
  - Test L1→L2 and L2→L1 full cycle
  - Test relayer recovery scenarios
  - Test with multiple concurrent transfers

- [ ] **Dashboard hardcoded fallback addresses** - May be stale if deployment changes
  - File: `dashboard/src/types/chain.ts`
  - Improve: Always require dynamic address loading, fail clearly if unavailable

- [ ] **No message ordering guarantees** - Messages may arrive out of order
  - Document behavior or implement ordering if required

- [ ] **Warp route collateral management** - No automated monitoring/alerts
  - Add: Balance alerts, automated top-up mechanisms

- [ ] **Better error messages in UI** - Generic "Unknown error" not helpful
  - Add: Contract-specific error decoding

### Low Priority (Nice to have)

- [ ] **Add bridge metrics/monitoring** - Prometheus metrics for bridge operations
- [ ] **Message history persistence** - Currently only in React state
- [ ] **Support ERC20 bridging** - Only native ETH currently
- [ ] **Add gas estimation in UI** - Show expected gas before transaction
- [ ] **Withdrawal delay option** - For added security on large withdrawals

### What Works Well

- Deterministic contract deployment via Foundry (reproducible addresses)
- Dynamic address discovery from deployment artifacts
- Clean separation: init container -> relayer -> dashboard
- Dashboard event-based delivery tracking (ReceivedTransferRemote)
- Bi-directional bridging (deposit/withdraw) working
- Warp route collateral visibility in UI
- Reasonable error handling in bridge panel

### Blueprint Assessment

**Suitable as blueprint?** YES, with caveats

The architecture is sound and demonstrates all key Hyperlane concepts:
1. Mailbox dispatch/process flow
2. ISM verification hook point
3. Warp route token handling
4. Relayer message delivery
5. Cross-chain router enrollment

**For productionization, another team would need to:**
1. Swap test contracts for Hyperlane's audited production contracts
2. Implement proper key management
3. Set up validator network for MultisigISM
4. Add monitoring, alerting, and operational runbooks
5. Security audit before mainnet deployment

---

## Stability

- [ ] **Engine API SYNCING recovery** - When op-reth returns SYNCING, builder gets stuck. Implement retry/backoff in `pipeline.go`

---

## Demo Video Fixes

### Issues Identified

The current demo video has the following problems:

1. **Incomplete Coverage** - Only shows end user login flow
2. **Low Video Quality** - Resolution/compression needs improvement
3. **Subtitle Issues** - Poor visual appearance and timing out of sync with audio

### Required Actions

#### 1. Create Admin Section Demo
- [ ] Script admin panel walkthrough (separate from end user flow)
- [ ] Record admin-specific features:
  - Admin login/authentication
  - Admin dashboard overview
  - Key admin operations (user management, settings, monitoring, etc.)
  - Admin-only metrics/analytics
- [ ] Ensure similar production quality and pacing as end user section

#### 2. Improve Video Quality
- [ ] Increase output resolution (minimum 1080p)
- [ ] Use higher bitrate encoding settings
- [ ] Ensure consistent frame rate (30fps minimum)
- [ ] Check source recording quality before post-processing
- [ ] Consider lossless intermediate format before final compression

#### 3. Fix Subtitles
- [ ] Re-sync subtitle timing with audio track
  - Use waveform analysis to match speech patterns
  - Ensure subtitles appear ~0.5s before speech, disappear with speech end
- [ ] Improve subtitle styling:
  - Use readable font (e.g., Open Sans, Roboto) at appropriate size
  - Add semi-transparent background for legibility
  - Ensure sufficient contrast against video content
  - Consistent positioning (bottom center, adequate padding)
- [ ] Review subtitle accuracy against script
- [ ] Consider using professional subtitle timing tools (Aegisub, Subtitle Edit)

### Deliverables

- [ ] Admin section demo video (standalone)
- [ ] Updated combined video with both end user AND admin sections
- [ ] Properly synced and styled subtitles
- [ ] Quality check: all videos at >=1080p with clear subtitles
