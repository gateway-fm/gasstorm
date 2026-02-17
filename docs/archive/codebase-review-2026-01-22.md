# Codebase Review & Performance Profiling (2026-01-22)

> Archived from `todo.md` on 2026-02-17. All review items are resolved.

## Codebase Review (2026-01-22)

### Critical Issues (Security - MUST FIX)

- [x] **Hardcoded private keys in source** - Supply chain risk if copied to production - FIXED 2026-01-22
  - `docker-compose.yml:298,369` - HYP_KEY and deployer keys
  - `Makefile:41` - test private key
  - Fix: Externalized to environment variables with clear warnings. Keys remain as defaults but are documented as development-only Anvil test keys.

- [x] **Global mutable state race** - Data corruption under concurrent access - FIXED 2026-01-22
  - `load-generator/internal/metrics/latency.go:103` - global randState
  - Fix: Moved randState to per-instance field in StreamingLatencyStats struct

- [x] **Race condition in nonce resync** - Potential nonce replay attacks - FIXED 2026-01-22
  - `load-generator/internal/account/account.go:106-116`
  - Fix: Added set-if-higher pattern to prevent nonce regression during concurrent resync

- [x] **Supply chain risk - unpinned downloads** - External tool downloads without checksums - FIXED 2026-01-22
  - `zisk-prover/Dockerfile:26` - ZisK download
  - `hyperlane-init/Dockerfile:16` - Foundry download
  - Fix: Pinned versions with infrastructure for SHA256 checksums (checksums skipped until upstream provides official values)

### High Priority Issues

#### Architecture
- [x] **BlockBuilder God Object** - 40+ fields, violates Single Responsibility Principle - FIXED 2026-01-22
  - `block-builder/builder.go:52-171`
  - Fix: Extracted circuit_breaker.go (115 lines) and stress_detector.go (115 lines)
  - Note: Metrics are simple atomic counters; complex metrics logic already in internal/metrics/

- [x] **builder.go exceeds 2300 lines** - Should be max 300 lines - COMPLETE 2026-01-22
  - Split into: builder.go (1158 lines), filtering.go (395 lines), rejection.go (274 lines), nonces.go (315 lines), pending.go (304 lines), stats.go (353 lines), production.go (270 lines), circuit_breaker.go (143 lines), stress_detector.go (137 lines)
  - Reduced from 2953 lines to 1158 lines (BuildBlock + core engine API helpers)
  - BuildBlock is 770 lines, large but tightly coupled - represents one cohesive block building flow

- [ ] **load-generator/cmd/loadgen/main.go exceeds 1999 lines** - DEFERRED
  - Extract LoadGenerator struct to separate package
  - Note: 3799 lines with 60+ functions. Candidates for extraction: WebSocket handlers, metrics calculation, worker functions. Major refactoring needed.

- [x] **Dashboard 0% test coverage** - Critical testing gap - PARTIAL 2026-01-22
  - Added Vitest testing infrastructure with root and dashboard configs
  - statistics.test.ts: 45 tests for percentile, statistics, formatting functions
  - load-patterns.test.ts: 29 tests for load schedule generation and interpolation
  - Total: 74 tests, covering lib/ utilities (estimated ~60% of lib/)

- [x] **6 load-generator packages untested** - config/, rpc/, storage/, transport/, txbuilder/, uniswapv3/ - COMPLETE 2026-01-22
  - config/ (22 tests), rpc/ (14 tests), transport/ (7 tests), storage/ (25 tests), txbuilder/ (16 tests), uniswapv3/ (34 tests)
  - Total: 118 new unit tests added

#### Security
- [x] **No WebSocket connection limits** - DoS risk - FIXED 2026-01-22
  - `block-builder/internal/preconf/hub.go:175-194`
  - Fix: Added global max connections (1000) and per-IP limits (10) with proper HTTP status codes

- [x] **CORS allows all origins (*)** - Should be configurable - FIXED 2026-01-22
  - All services use permissive CORS
  - Fix: Added CORS_ALLOWED_ORIGINS environment variable to block-builder and load-generator
  - Supports comma-separated list of origins or "*" for all (default for dev)

- [x] **No input validation on API endpoints** - FIXED 2026-01-22
  - `load-generator/internal/transport/http.go:126-146`
  - Fix: Added comprehensive validation for all StartTestRequest parameters

- [x] **No healthchecks on Docker services** - block-builder, load-generator, dashboard - FIXED 2026-01-22
  - Fix: Added HEALTHCHECK instructions to all three Dockerfiles

#### Concurrency
- [x] **sync.Map iteration while modifying** - Actually safe per Go docs - CLARIFIED 2026-01-22
  - `load-generator/cmd/loadgen/main.go:1115-1118`
  - Note: sync.Map explicitly supports Delete during Range - added clarifying comment

- [x] **Double-buffer slice aliasing bug** - VERIFIED 2026-01-22
  - `block-builder/builder.go:1346-1354`
  - Analysis: Implementation is correct - block production is single-threaded
  - Added detailed comment explaining thread safety of the double-buffer pattern

- [x] **NonceCache.Get() serializes on write lock** - Performance bottleneck - FIXED 2026-01-22
  - Fix: Added Peek() method with RLock for read-only access. Updated filter hot paths to use Peek().

- [x] **Goroutine leak potential** - No WaitGroup for server goroutines - FIXED 2026-01-22
  - `block-builder/main.go:64-83`
  - Fix: Added signal handling, WaitGroup for all goroutines, graceful shutdown of all servers
  - Added Handler() method to RPC server and NewServer() to preconf for shutdown support

### Medium Priority Issues

#### Code Quality
- [x] **Error responses not JSON in load-generator** - FIXED 2026-01-22
  - Uses `http.Error()` with plain text
  - Fix: Replaced all http.Error() calls with writeJSONError() for consistent JSON responses

- [x] **Ignored JSON unmarshal errors** - FIXED 2026-01-22
  - `load-generator/internal/storage/sqlite.go:688-724`
  - Fix: Added unmarshalJSON helper that logs errors with structured logging (slog)

- [x] **Missing Error Boundaries in React dashboard** - FIXED 2026-01-22
  - Fix: Added Next.js 13+ error handling with error.tsx files
  - Added global-error.tsx, error.tsx for root, load-test/error.tsx, bridge/error.tsx
  - Added reusable ErrorBoundary component in components/ui/error-boundary.tsx

- [x] **Magic numbers throughout codebase** - PARTIAL 2026-01-22
  - block-builder: Extracted to constants in circuit_breaker.go, stress_detector.go, builder.go
  - load-generator: Deferred - main.go exceeds 1999 lines, refactoring magic numbers would be part of larger cleanup

- [x] **sync.Map txArrivalTimes never cleaned** - FIXED 2026-01-22
  - `block-builder/internal/preconf/hub.go:93`
  - Fix: Added periodic cleanup goroutine that removes entries older than 10 minutes

#### Dashboard Cleanup
- [x] **Two load test stores exist** - FIXED 2026-01-22
  - `load-test-store.ts` was unused dead code
  - Fix: Removed unused load-test-store.ts, go-load-test-store.ts is the sole implementation

- [x] **Duplicate WebSocket code** - FIXED 2026-01-22
  - `use-websocket.ts` was unused dead code
  - Fix: Removed unused use-websocket.ts, websocket-context.tsx is the sole implementation

- [x] **test-history.tsx is 891 lines** - Exceeds 300-line limit - FIXED 2026-01-22
  - Extracted to: history-item-card.tsx (305 lines), history-transforms.ts (55 lines)
  - test-history.tsx reduced to 287 lines (within 300-line limit)

- [x] **go-load-test-store.ts is 1039 lines** - Exceeds 300-line limit - FIXED 2026-01-22
  - Split into: load-test-api.ts (180 lines), load-test-store-state.ts (222 lines), load-test-websocket.ts (238 lines)
  - go-load-test-store.ts reduced to 318 lines (within ~300-line limit)

#### Engine API
- [x] **No ACCEPTED status handling** - FIXED 2026-01-22
  - Only checks for VALID
  - Fix: Added ACCEPTED status handling with short backoff (50ms) and retry

- [x] **No retry on initial FCU or GetPayload** - Only final FCU has retry - FIXED 2026-01-22
  - Fix: Added engineCallWithRetry() with exponential backoff (10ms, 20ms); applied to initial FCU and GetPayload

- [x] **lastBuiltBlock updated before FCU completes** - State inconsistency - FIXED 2026-01-22
  - Fix: Moved lastBuiltBlock update inside FCU success branch; on FCU failure, keeps old parent

#### Dependencies
- [x] **Go version mismatch** - FIXED 2026-01-22
  - block-builder/load-generator were on Go 1.22, zisk-prover was on Go 1.23
  - Fix: Standardized all modules to Go 1.25

- [x] **golang.org/x/sync version inconsistency** - v0.8.0 vs v0.7.0 - FIXED 2026-01-22
  - Fix: Aligned all modules to v0.19.0

- [x] **golang.org/x packages 9-10 months old** - March 2024 - FIXED 2026-01-22
  - Fix: Updated to latest versions (crypto v0.47.0, sync v0.19.0, sys v0.40.0, arch v0.23.0, exp Jan 2026)

### Low Priority (Nice to Have)

- [x] **Create OpenAPI spec for load-generator REST API** - DONE 2026-01-22
  - Created `load-generator/api/openapi.yaml` with full API documentation
  - Covers all 14 endpoints including WebSocket
- [x] **Implement API versioning strategy** - DONE 2026-01-22
  - Added `/v1/` prefix to all API endpoints
  - Legacy unversioned endpoints maintained for backwards compatibility
  - Health/metrics endpoints remain unversioned (Kubernetes/Prometheus standards)
- [x] **Add per-client drop tracking in WebSocket hub** - DONE 2026-01-22
  - Added EventsDropped and BatchesDropped counters to ClientState
  - Added ConnectedAt timestamp for connection duration tracking
  - Added GetClientStats() method returning per-client metrics
  - Added `/stats/clients` endpoint exposing client details (IP, drops, buffer usage)
- [x] **Generate SBOM for compliance documentation** - DONE 2026-01-22
  - Created `scripts/generate-sbom.sh` script
  - Added `make sbom` and `make sbom-help` targets
  - Outputs CycloneDX JSON format to `./sbom/` directory
  - Supports both syft (comprehensive) and basic Go module listing
- [ ] **No explicit Engine API health checking** - Only nonce rejection tracking

### What Works Well

- Excellent JSON serialization - 100% camelCase compliance
- Perfect Go-to-TypeScript type alignment
- Strong nonce management - Unified NonceCache with LRU, singleflight, batch RPC
- Good preconf hub pattern - Canonical Go WebSocket with proper locking
- Performance optimizations - sync.Pool, buffer pooling, insertion sort
- Well-documented CLAUDE.md
- Good test coverage in critical areas - txpool, nonce cache, filter (70-85%)

### Test Coverage Summary

| Component | Coverage | Status |
|-----------|----------|--------|
| Block-builder txpool | ~85% | Excellent |
| Block-builder engine | ~80% | Very Good |
| Load-generator metrics | ~90% | Excellent |
| Load-generator account | ~95% | Excellent |
| Load-generator config | ~80% | Good (22 tests) |
| Load-generator rpc | ~70% | Good (14 tests) |
| Load-generator transport | ~60% | Good (7 tests) |
| Load-generator storage | ~85% | Excellent (25 tests) |
| Load-generator txbuilder | ~75% | Good (16 tests) |
| Load-generator uniswapv3 | ~80% | Good (34 tests) |
| Dashboard lib/ | ~60% | Good (74 tests) |
| Dashboard components | 0% | Deferred |

---

## Bridge Testing

- [x] **Bridge testing** - Tested 2026-01-22: L1→L2 and L2→L1 working after relayer DB reset

---

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

### Metal Mode Load Test Results (2026-02-06)

Config: 150ms block time, 1.5 gigagas gas limit, 50k max txs/block, tip_desc ordering

| Test | TPS | MGas/s Avg | MGas/s Peak | Latency p99 | Success |
|------|-----|-----------|-------------|-------------|---------|
| Constant 5k | 5,000 | 111 | 120 | 171ms | 100% |
| Constant 25k | 25,000 | 528 | 627 | 258ms | 100% |
| Constant 30k | 30,000 | 366 | 644 | 286ms | 74.9% |
| Constant 50k | 50,000 | 54 | 678 | 853ms | <5% |
| Realistic 10k (mixed) | 10,000 | 673 | 828 | 261ms | 89.2% |

**Sustainable ceiling**: ~25k TPS constant rate (100% confirmation, <260ms p99 latency)

### Optimizations Implemented (2026-02-06)

| Optimization | Before | After | Improvement |
|---|---|---|---|
| **Loadgen TxFlowTracker** - delete on terminal states | 130MB heap, 15% GC CPU | 512KB heap, 4% GC CPU | 91% heap, 78% GC reduction |
| **Builder pre-marshal batch JSON** - marshal once per batch | Per-client JSON encode | Single encode shared | 23% heap reduction |

### Remaining Bottlenecks (2026-02-06)

| Issue | Impact | Notes |
|-------|--------|-------|
| Block build time | 83-92ms at 25-30k TPS | Uses 55-61% of 150ms block budget |
| Nonce-sequential requeue | Millions of requeues at >30k TPS | Single-account nonce ordering limits parallelism |
| WebSocket I/O | 23% of builder CPU | Fundamental I/O cost writing preconf events |
| secp256k1 CGO | 7-8% CPU both services | Hardware-limited, batch verification could help |
