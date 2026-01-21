# Block Builder Performance Analysis

**Date:** 2026-01-21  
**Profile Duration:** 30 seconds  
**Load Test:** 100 TPS, 50 accounts, eth-transfer transactions

## Executive Summary

The block-builder has two primary performance bottlenecks:

1. **Memory:** The `SeenHashTracker` pre-allocates 320 MB for 10M transaction hashes, using 99% of heap memory regardless of actual load
2. **CPU:** Signature verification via CGO consumes 28% of CPU time

---

## Memory Analysis

### Heap Profile Summary

| Metric | Value |
|--------|-------|
| Total Heap | 305.18 MB |
| SeenHashTracker | 305.18 MB (99.12%) |
| BlockMetricsHub | 1.69 MB (0.55%) |

### Root Cause

**File:** `block-builder/internal/txpool/seen.go:27`

```go
// DefaultMaxSeenHashes is the default capacity for the seen hash tracker.
// At 32 bytes per hash, 10M hashes = ~320MB memory.
const DefaultMaxSeenHashes = 10_000_000
```

The `SeenHashTracker` pre-allocates a ring buffer of 10M `common.Hash` entries:

```go
func NewSeenHashTracker(maxSize int) *SeenHashTracker {
    if maxSize <= 0 {
        maxSize = DefaultMaxSeenHashes
    }
    t := &SeenHashTracker{
        ring:    make([]common.Hash, maxSize),  // 320 MB allocated here
        maxSize: maxSize,
    }
    // ...
}
```

### Memory Calculation

- `common.Hash` size: 32 bytes
- Ring buffer entries: 10,000,000
- Total: 320,000,000 bytes = **305 MB** (after Go overhead)

### Proposed Fixes

#### Option A: Reduce Default (Quick Win)

Change `DefaultMaxSeenHashes` from 10M to 1-2M:

```go
const DefaultMaxSeenHashes = 1_000_000  // 32 MB instead of 320 MB
```

**Impact:** 90% memory reduction  
**Risk:** Low - most deployments never see 10M unique transaction hashes

#### Option B: Environment Variable (Recommended)

Make the limit configurable via environment variable:

```go
const DefaultMaxSeenHashes = 1_000_000

func init() {
    if v := os.Getenv("MAX_SEEN_HASHES"); v != "" {
        if n, err := strconv.Atoi(v); err == nil && n > 0 {
            DefaultMaxSeenHashes = n
        }
    }
}
```

**Impact:** Full flexibility, no memory waste  
**Risk:** Low - adds one configuration option

#### Option C: Dynamic Scaling

Implement a growable ring buffer that starts small and doubles capacity as needed:

```go
func (t *SeenHashTracker) ensureCapacity() {
    if t.count.Load() >= t.maxSize {
        // Grow by 2x, up to a limit
        newSize := min(t.maxSize*2, MaxDynamicSize)
        // ... reallocate and copy
    }
}
```

**Impact:** Optimal memory for all workloads  
**Risk:** Medium - requires careful concurrency handling

---

## CPU Analysis

### CPU Profile Summary

| Function | Flat Time | % | Cumulative % |
|----------|-----------|---|--------------|
| `runtime.cgocall` | 0.43s | 24.43% | 25.00% |
| `SignatureVerifier.worker` | 0.49s | 27.84% | 100% |
| `handleRPC` | 0.22s | 12.50% | 100% |
| `ParseTransactionLight` | 0.09s | 5.11% | 100% |
| `clientWriter` (preconf) | 0.10s | 5.68% | 100% |
| `runtime.futex` | 0.15s | 8.52% | 47.73% |

### Top Hotspots

#### 1. Signature Verification (28%)

**Location:** `block-builder/internal/txpool/verifier.go:126`

The `SignatureVerifier.worker` function performs ECDSA signature verification via CGO:

```
runtime.cgocall → secp256k1_ext_ecdsa_recover
```

This is the most CPU-intensive operation in the hot path.

#### 2. RPC Handling (12.5%)

**Location:** `block-builder/internal/rpc/server.go`

`handleRPC` and `handleSendRawTransactionFast` process incoming transactions.

#### 3. Transaction Parsing (5%)

**Location:** `block-builder/internal/txpool/parse.go`

`ParseTransactionLight` decodes RLP-encoded transactions.

### Proposed Fixes

#### Option A: Batch Signature Verification (High Impact)

Implement batch signature verification to amortize CGO overhead:

```go
func (v *SignatureVerifier) verifyBatch(hashes []common.Hash, sigs [][]byte) error {
    // Use go-ethereum's batch verification
    // Reduces CGO calls from N to 1 per batch
}
```

**Expected Impact:** 2-5x throughput improvement  
**Risk:** Medium - requires testing edge cases

#### Option B: Increase Worker Count

Scale signature verification workers based on CPU cores:

```go
numWorkers := runtime.NumCPU()
if v := os.Getenv("SIGNATURE_WORKERS"); v != "" {
    if n, err := strconv.Atoi(v); err == nil && n > 0 {
        numWorkers = n
    }
}
```

**Expected Impact:** +20-50% with 4→8 workers  
**Risk:** Low - diminishing returns beyond 8 workers

#### Option C: Async Verification Pipeline

Decouple verification from the hot path:

```
TX Queue → Light Parse → Async Verify Queue → Block Building
              ↓
         Quick reject
```

**Expected Impact:** Better throughput, slightly higher latency variance
**Risk:** Medium - requires reordering logic

---

## Additional Observations

### Goroutine Count

| State | Count |
|-------|-------|
| Total goroutines | 109 |
| HTTP persist conn (read) | 22 |
| HTTP persist conn (write) | 22 |
| Net poll wait | 39 |
| SignatureVerifier workers | 8 |
| NoncePrefetcher workers | 4 |
| PreconfHub writers | 3 |

**Assessment:** Goroutine count is healthy and expected for the workload.

### No Issues Detected

- ✅ No mutex contention
- ✅ No goroutine leaks
- ✅ No obvious blocking patterns
- ✅ Memory appears stable (no continuous growth)

---

## Recommendations

### Immediate (Low Risk)

1. **Reduce `DefaultMaxSeenHashes`** from 10M to 1M (32 MB vs 320 MB)
2. **Add `MAX_SEEN_HASHES` environment variable** for tuning

### Short Term (Medium Risk)

3. **Add batch size configuration** for signature verification
4. **Profile with higher load** (200+ TPS) to identify additional bottlenecks

### Long Term (High Risk)

5. **Implement batch signature verification** for 2-5x throughput gains
6. **Consider BLS signatures** for batch-friendly crypto

---

## Profiles

CPU and heap profiles saved to: `/tmp/pprof-output/`

```bash
# View CPU profile
go tool pprof -http :8080 /tmp/pprof-output/cpu.prof

# View heap profile
go tool pprof -http :8080 /tmp/pprof-output/heap.prof
```

---

## Appendix: Test Configuration

```json
{
  "pattern": "constant",
  "constantRate": 100,
  "durationSec": 120,
  "numAccounts": 50,
  "transactionType": "eth-transfer"
}
```

### Results

| Metric | Value |
|--------|-------|
| TPS | 100.2 |
| TX Sent | 707 |
| TX Confirmed | 675 |
| Avg Latency | 511 ms |
| Preconf Latency | 489 ms |
| MGas/s | 3.6 |
| Peak MGas/s | 12.98 |
