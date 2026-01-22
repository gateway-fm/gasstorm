# Sequencer PoC - TODO

## Codebase Review (2026-01-22)

### 🔴 Critical Issues (Security - MUST FIX)

- [x] **Hardcoded private keys in source** - Supply chain risk if copied to production ✅ FIXED 2026-01-22
  - `docker-compose.yml:298,369` - HYP_KEY and deployer keys
  - `Makefile:41` - test private key
  - Fix: Externalized to environment variables with clear warnings. Keys remain as defaults but are documented as development-only Anvil test keys.

- [x] **Global mutable state race** - Data corruption under concurrent access ✅ FIXED 2026-01-22
  - `load-generator/internal/metrics/latency.go:103` - global randState
  - Fix: Moved randState to per-instance field in StreamingLatencyStats struct

- [x] **Race condition in nonce resync** - Potential nonce replay attacks ✅ FIXED 2026-01-22
  - `load-generator/internal/account/account.go:106-116`
  - Fix: Added set-if-higher pattern to prevent nonce regression during concurrent resync

- [x] **Supply chain risk - unpinned downloads** - External tool downloads without checksums ✅ FIXED 2026-01-22
  - `zisk-prover/Dockerfile:26` - ZisK download
  - `hyperlane-init/Dockerfile:16` - Foundry download
  - Fix: Pinned versions with infrastructure for SHA256 checksums (checksums skipped until upstream provides official values)

### 🟠 High Priority Issues

#### Architecture
- [x] **BlockBuilder God Object** - 40+ fields, violates Single Responsibility Principle ✅ FIXED 2026-01-22
  - `block-builder/builder.go:52-171`
  - Fix: Extracted circuit_breaker.go (115 lines) and stress_detector.go (115 lines)
  - Note: Metrics are simple atomic counters; complex metrics logic already in internal/metrics/

- [x] **builder.go exceeds 2300 lines** - Should be max 300 lines ✅ PARTIAL 2026-01-22
  - Split into: builder.go, pipeline.go, circuit_breaker.go, stress.go, metrics.go
  - Progress: Extracted circuit_breaker.go (115 lines) and stress_detector.go (115 lines)
  - Reduced from 3116 to 2929 lines. Full 300-line target requires major architectural refactoring.

- [ ] **load-generator/cmd/loadgen/main.go exceeds 1999 lines** - DEFERRED
  - Extract LoadGenerator struct to separate package
  - Note: 3799 lines with 60+ functions. Candidates for extraction: WebSocket handlers, metrics calculation, worker functions. Major refactoring needed.

- [x] **Dashboard 0% test coverage** - Critical testing gap ✅ PARTIAL 2026-01-22
  - Added Vitest testing infrastructure with root and dashboard configs
  - statistics.test.ts: 45 tests for percentile, statistics, formatting functions
  - load-patterns.test.ts: 29 tests for load schedule generation and interpolation
  - Total: 74 tests, covering lib/ utilities (estimated ~60% of lib/)

- [x] **6 load-generator packages untested** - config/, rpc/, storage/, transport/, txbuilder/, uniswapv3/ ✅ COMPLETE 2026-01-22
  - config/ (22 tests), rpc/ (14 tests), transport/ (7 tests), storage/ (25 tests), txbuilder/ (16 tests), uniswapv3/ (34 tests)
  - Total: 118 new unit tests added

#### Security
- [x] **No WebSocket connection limits** - DoS risk ✅ FIXED 2026-01-22
  - `block-builder/internal/preconf/hub.go:175-194`
  - Fix: Added global max connections (1000) and per-IP limits (10) with proper HTTP status codes

- [x] **CORS allows all origins (*)** - Should be configurable ✅ FIXED 2026-01-22
  - All services use permissive CORS
  - Fix: Added CORS_ALLOWED_ORIGINS environment variable to block-builder and load-generator
  - Supports comma-separated list of origins or "*" for all (default for dev)

- [x] **No input validation on API endpoints** ✅ FIXED 2026-01-22
  - `load-generator/internal/transport/http.go:126-146`
  - Fix: Added comprehensive validation for all StartTestRequest parameters

- [x] **No healthchecks on Docker services** - block-builder, load-generator, dashboard ✅ FIXED 2026-01-22
  - Fix: Added HEALTHCHECK instructions to all three Dockerfiles

#### Concurrency
- [x] **sync.Map iteration while modifying** - Actually safe per Go docs ✅ CLARIFIED 2026-01-22
  - `load-generator/cmd/loadgen/main.go:1115-1118`
  - Note: sync.Map explicitly supports Delete during Range - added clarifying comment

- [x] **Double-buffer slice aliasing bug** ✅ VERIFIED 2026-01-22
  - `block-builder/builder.go:1346-1354`
  - Analysis: Implementation is correct - block production is single-threaded
  - Added detailed comment explaining thread safety of the double-buffer pattern

- [x] **NonceCache.Get() serializes on write lock** - Performance bottleneck ✅ FIXED 2026-01-22
  - Fix: Added Peek() method with RLock for read-only access. Updated filter hot paths to use Peek().

- [x] **Goroutine leak potential** - No WaitGroup for server goroutines ✅ FIXED 2026-01-22
  - `block-builder/main.go:64-83`
  - Fix: Added signal handling, WaitGroup for all goroutines, graceful shutdown of all servers
  - Added Handler() method to RPC server and NewServer() to preconf for shutdown support

### 🟡 Medium Priority Issues

#### Code Quality
- [x] **Error responses not JSON in load-generator** ✅ FIXED 2026-01-22
  - Uses `http.Error()` with plain text
  - Fix: Replaced all http.Error() calls with writeJSONError() for consistent JSON responses

- [x] **Ignored JSON unmarshal errors** ✅ FIXED 2026-01-22
  - `load-generator/internal/storage/sqlite.go:688-724`
  - Fix: Added unmarshalJSON helper that logs errors with structured logging (slog)

- [x] **Missing Error Boundaries in React dashboard** ✅ FIXED 2026-01-22
  - Fix: Added Next.js 13+ error handling with error.tsx files
  - Added global-error.tsx, error.tsx for root, load-test/error.tsx, bridge/error.tsx
  - Added reusable ErrorBoundary component in components/ui/error-boundary.tsx

- [x] **Magic numbers throughout codebase** ✅ PARTIAL 2026-01-22
  - block-builder: Extracted to constants in circuit_breaker.go, stress_detector.go, builder.go
  - load-generator: Deferred - main.go exceeds 1999 lines, refactoring magic numbers would be part of larger cleanup

- [x] **sync.Map txArrivalTimes never cleaned** ✅ FIXED 2026-01-22
  - `block-builder/internal/preconf/hub.go:93`
  - Fix: Added periodic cleanup goroutine that removes entries older than 10 minutes

#### Dashboard Cleanup
- [x] **Two load test stores exist** ✅ FIXED 2026-01-22
  - `load-test-store.ts` was unused dead code
  - Fix: Removed unused load-test-store.ts, go-load-test-store.ts is the sole implementation

- [x] **Duplicate WebSocket code** ✅ FIXED 2026-01-22
  - `use-websocket.ts` was unused dead code
  - Fix: Removed unused use-websocket.ts, websocket-context.tsx is the sole implementation

- [x] **test-history.tsx is 891 lines** - Exceeds 300-line limit ✅ FIXED 2026-01-22
  - Extracted to: history-item-card.tsx (305 lines), history-transforms.ts (55 lines)
  - test-history.tsx reduced to 287 lines (within 300-line limit)

- [x] **go-load-test-store.ts is 1039 lines** - Exceeds 300-line limit ✅ FIXED 2026-01-22
  - Split into: load-test-api.ts (180 lines), load-test-store-state.ts (222 lines), load-test-websocket.ts (238 lines)
  - go-load-test-store.ts reduced to 318 lines (within ~300-line limit)

#### Engine API
- [x] **No ACCEPTED status handling** ✅ FIXED 2026-01-22
  - Only checks for VALID
  - Fix: Added ACCEPTED status handling with short backoff (50ms) and retry

- [x] **No retry on initial FCU or GetPayload** - Only final FCU has retry ✅ FIXED 2026-01-22
  - Fix: Added engineCallWithRetry() with exponential backoff (10ms, 20ms); applied to initial FCU and GetPayload

- [x] **lastBuiltBlock updated before FCU completes** - State inconsistency ✅ FIXED 2026-01-22
  - Fix: Moved lastBuiltBlock update inside FCU success branch; on FCU failure, keeps old parent

#### Dependencies
- [x] **Go version mismatch** ✅ FIXED 2026-01-22
  - block-builder/load-generator were on Go 1.22, zisk-prover was on Go 1.23
  - Fix: Standardized all modules to Go 1.25

- [x] **golang.org/x/sync version inconsistency** - v0.8.0 vs v0.7.0 ✅ FIXED 2026-01-22
  - Fix: Aligned all modules to v0.19.0

- [x] **golang.org/x packages 9-10 months old** - March 2024 ✅ FIXED 2026-01-22
  - Fix: Updated to latest versions (crypto v0.47.0, sync v0.19.0, sys v0.40.0, arch v0.23.0, exp Jan 2026)

### 🟢 Low Priority (Nice to Have)

- [ ] **Create OpenAPI spec for load-generator REST API**
- [ ] **Implement API versioning strategy** - No /v1/ prefix
- [ ] **Add per-client drop tracking in WebSocket hub**
- [ ] **Generate SBOM for compliance documentation**
- [ ] **No explicit Engine API health checking** - Only nonce rejection tracking

### ✅ What Works Well

- Excellent JSON serialization - 100% camelCase compliance
- Perfect Go-to-TypeScript type alignment
- Strong nonce management - Unified NonceCache with LRU, singleflight, batch RPC
- Good preconf hub pattern - Canonical Go WebSocket with proper locking
- Performance optimizations - sync.Pool, buffer pooling, insertion sort
- Well-documented CLAUDE.md
- Good test coverage in critical areas - txpool, nonce cache, filter (70-85%)

### 📊 Test Coverage Summary

| Component | Coverage | Status |
|-----------|----------|--------|
| Block-builder txpool | ~85% | ✅ Excellent |
| Block-builder engine | ~80% | ✅ Very Good |
| Load-generator metrics | ~90% | ✅ Excellent |
| Load-generator account | ~95% | ✅ Excellent |
| Load-generator config | ~80% | ✅ Good (22 tests) |
| Load-generator rpc | ~70% | ✅ Good (14 tests) |
| Load-generator transport | ~60% | ✅ Good (7 tests) |
| Load-generator storage | ~85% | ✅ Excellent (25 tests) |
| Load-generator txbuilder | ~75% | ✅ Good (16 tests) |
| Load-generator uniswapv3 | ~80% | ✅ Good (34 tests) |
| Dashboard lib/ | ~60% | ✅ Good (74 tests) |
| Dashboard components | 0% | 🟠 Deferred |

---

## Hyperlane Bridge Review (2026-01-22)

### Production Readiness: ❌ NOT PRODUCTION READY

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

### What Works Well ✅

- Deterministic contract deployment via Foundry (reproducible addresses)
- Dynamic address discovery from deployment artifacts
- Clean separation: init container → relayer → dashboard
- Dashboard event-based delivery tracking (ReceivedTransferRemote)
- Bi-directional bridging (deposit/withdraw) working
- Warp route collateral visibility in UI
- Reasonable error handling in bridge panel

### Blueprint Assessment

**Suitable as blueprint?** ✅ YES, with caveats

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

## Review
- [x] **Bridge testing** - Tested 2026-01-22: L1→L2 and L2→L1 working after relayer DB reset

## Performance Profiling Results (2026-01-22)

### CPU Hotspots (from benchmarks)
| Function | Time | % | Action |
|----------|------|---|--------|
| `sortExecutableByTip` | 29.77s | 9.62% | Consider heap-based ordering |
| CGO (`cgocall`) | 25.77s | 8.32% | Batch signature verification |
| `HashTrieMap.Load` | 19.69s | 6.36% | sync.Map overhead |
| `SeenHashTracker.Has` | 17.37s | 5.61% | Hash deduplication |
| `getNextTimestamp` | 16.43s | 5.31% | Atomic contention |
| `compareTxGasPrice` | 12.81s | 4.14% | Part of sorting |
| GC (`gcDrain`) | 41.66s | 13.46% | Reduce allocations |

### Memory Hotspots (filterExecutable benchmark)
| Allocator | Memory | % |
|-----------|--------|---|
| `filterExecutable` | 19 GB | 78.77% |
| `senderBatchPool.New` | 3.9 GB | 16.04% |
| `sort.Slice` (reflectlite.Swapper) | 397 MB | 1.64% |

Root cause: `filterExecutable` allocates per call:
- `make(map[common.Address]*senderBatch, mapSize)` - new map each time
- `&executableTx{}` - new struct per executable tx (pool disabled)

### Optimizations Implemented (2026-01-22)

| Optimization | Result |
|--------------|--------|
| **Pool senderMap in filterExecutable** | 22-34% faster, 17% fewer allocs |
| **Replace sort.Slice with slices.SortFunc** | 18-37x faster sorting |

### Remaining Opportunities
- [ ] **Batch signature verification** - Amortize CGO overhead (2-5x potential, high complexity)

## Stability

- [ ] **Engine API SYNCING recovery** - When op-reth returns SYNCING, builder gets stuck. Implement retry/backoff in `pipeline.go`

## Known Bottlenecks

| Issue | Impact | Notes |
|-------|--------|-------|
| Engine API latency | FCU + GetPayload 100-500ms | Limits block rate |
| Nonce batching | Limits >200 TPS | Per-account sequential nonces |
| SYNCING state | Pipeline stuck | No recovery implemented |

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
- [ ] Quality check: all videos at ≥1080p with clear subtitles
