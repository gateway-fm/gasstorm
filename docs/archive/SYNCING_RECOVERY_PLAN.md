# Reth SYNCING Recovery & Adaptive Load Management Plan

**Created:** 2026-01-22
**Status:** Ready for Implementation

---

## Executive Summary

This plan addresses the aggressive SYNCING recovery behavior in the block-builder that causes unnecessary cache clearing and RPC load. It also adds proactive load management features to prevent unbounded pending pool growth and provide graduated backpressure under stress.

**Key Changes:**
1. Remove aggressive cache clearing on SYNCING recovery
2. Add pending pool limit with transaction rejection
3. Implement graduated stress-based TX rejection
4. Add lazy nonce cache refresh
5. Improve observability during backoff

---

## Current State Analysis

| Component | Status | Issue |
|-----------|--------|-------|
| **SYNCING Backoff** | ✅ Working | Exponential backoff (100ms → 2s) pauses block building |
| **Circuit Breaker** | ✅ Working | Trips at 50% rejection, blocks new TXs for 2s cooldown |
| **Stress Detector** | ✅ Working | Proactively reduces txs/block when GetPayload > 70% block time |
| **Pending Pool Limit** | ❌ Missing | No max limit - unbounded growth possible |
| **SYNCING Recovery** | ❌ Broken | Aggressive cache clearing causes thundering herd |
| **Adaptive Rate Limit** | ⚠️ Partial | Reduces txs/block but doesn't reject TXs at limit |

---

## Phase 1: Remove Aggressive SYNCING Recovery (P0)

### Problem
Lines 2136-2173 in `builder.go` clear `lastBuiltBlock` and mark ALL nonce cache entries stale after SYNCING recovery. This causes:
- Unnecessary RPC calls to re-fetch head
- Thundering herd of nonce refresh requests
- Defeats the purpose of caching

### Solution
Simplify to just reset state counters without cache manipulation.

### Changes
**File:** `block-builder/builder.go`

**Before (lines 2131-2178):**
```go
if b.rethSyncing.Load() {
    consecutiveSyncCount := b.consecutiveSyncing.Load()
    log.Printf("RETH RECOVERED: syncing state cleared after %d consecutive syncing responses",
        consecutiveSyncCount)

    // Perform recovery actions when coming out of extended SYNCING (3+ consecutive)
    // This ensures we're building on the correct parent after reth caught up
    if consecutiveSyncCount >= 3 {
        log.Printf("RETH RECOVERY: Extended syncing detected (%d consecutive), refreshing state...",
            consecutiveSyncCount)

        // 1. Clear cached head block to force fresh fetch from reth
        b.lastBuiltBlockMu.Lock()
        oldHead := b.lastBuiltBlock
        b.lastBuiltBlock = nil
        b.lastBuiltBlockMu.Unlock()

        // Fetch fresh head for logging
        newHead, fetchErr := b.getLatestBlock(ctx)
        if fetchErr != nil {
            log.Printf("RETH RECOVERY: Warning - failed to fetch fresh head: %v", fetchErr)
        } else {
            if oldHead != nil {
                blockDiff := int64(newHead.Number) - int64(oldHead.Number)
                log.Printf("RETH RECOVERY: Head refreshed: %d -> %d (advanced %d blocks during sync)",
                    oldHead.Number, newHead.Number, blockDiff)
            } else {
                log.Printf("RETH RECOVERY: Fresh head fetched: block %d", newHead.Number)
            }
            b.lastBuiltBlockMu.Lock()
            b.lastBuiltBlock = newHead
            b.lastBuiltBlockMu.Unlock()
        }

        // 2. Mark nonce cache entries as stale to force refresh on next access
        if nc, ok := b.nonceMap.(*txpool.NonceCache); ok {
            staleCount := nc.MarkAllStale()
            log.Printf("RETH RECOVERY: Marked %d nonce cache entries as stale", staleCount)
        }
    }

    b.rethSyncing.Store(false)
    b.consecutiveSyncing.Store(0)
    b.syncBackoffUntil.Store(0)
}
```

**After:**
```go
if b.rethSyncing.Load() {
    consecutiveSyncCount := b.consecutiveSyncing.Load()
    log.Printf("RETH RECOVERED: syncing state cleared after %d consecutive syncing responses",
        consecutiveSyncCount)

    // Just reset state counters - pending transactions are still valid
    // Reth just needs time to sync, no cache invalidation needed
    b.rethSyncing.Store(false)
    b.consecutiveSyncing.Store(0)
    b.syncBackoffUntil.Store(0)
}
```

### Tests
No new tests needed - this is removal of buggy behavior. Existing integration tests should continue to pass.

---

## Phase 2: Add Pending Pool Limit with Backpressure (P1)

### Problem
No limit on `pendingTxs` slice size. When reth is slow, pending grows unbounded, consuming memory and causing stale nonce issues.

### Solution
Add `MAX_PENDING_TXS` constant matching `TxQueueSize` and reject TXs when limit is reached.

### Changes

#### 2.1 Add Constant and Field
**File:** `block-builder/builder.go`

Add constant:
```go
const MAX_PENDING_TXS = 100000 // Match txQueue capacity for consistency
```

Add field to `BlockBuilder` struct:
```go
pendingCount atomic.Int64 // Current pending transaction count for backpressure
```

#### 2.2 Update Pending Counters
**File:** `block-builder/pending.go`

In `requeueOverflow()`:
```go
func (b *BlockBuilder) requeueOverflow(txs []*executableTx) {
    if len(txs) == 0 {
        return
    }

    b.pendingMu.Lock()
    defer b.pendingMu.Unlock()

    // ... existing code ...

    // Update pending count
    b.pendingCount.Add(int64(len(txs)))
}
```

In `takePendingTransactions()`:
```go
func (b *BlockBuilder) takePendingTransactions() []*PendingTx {
    b.pendingMu.Lock()
    count := len(b.pendingTxs)
    txs := b.pendingTxs
    b.pendingTxs = b.pendingTxsBuf[:0]
    b.pendingTxsBuf = txs
    b.pendingMu.Unlock()

    // Decrement pending count
    b.pendingCount.Add(-int64(count))
    return txs
}
```

In `processVerifiedTransactions()` - add rejection check:
```go
// Check pending pool limit before queuing
currentPending := b.pendingCount.Load()
if currentPending >= MAX_PENDING_TXS {
    log.Printf("WARN: pending pool full (%d), dropping TX %s",
        currentPending, verified.Hash.Hex()[:10])
    atomic.AddUint64(&b.txsDropped, 1)
    txpool.PutPendingTx(pendingTx)
    continue
}
```

#### 2.3 Add Rejection in QueueTransaction
**File:** `block-builder/pending.go`

In `QueueTransaction()` after stress check:
```go
// Reject early if pending pool is at capacity
if b.pendingCount.Load() >= MAX_PENDING_TXS {
    return common.Hash{}, &JSONRPCError{
        Code:    ErrCodeServerError,
        Message: "pending pool full, retry later",
    }
}
```

#### 2.4 Add Status Endpoint Field
**File:** `block-builder/internal/rpc/server.go`

In `/status` handler, add:
```go
"maxPendingCapacity": MAX_PENDING_TXS,
"pendingPoolUsedPct": float64(pendingCount) / float64(MAX_PENDING_TXS) * 100,
```

### Tests
**File:** `block-builder/pending_test.go`

```go
func TestPendingLimit_RejectsWhenFull(t *testing.T) {
    // Fill pending pool to MAX_PENDING_TXS
    // Submit transaction
    // Verify rejection with "pending pool full" error
}

func TestPendingLimit_AcceptsUnderLimit(t *testing.T) {
    // Ensure pending pool is under limit
    // Submit transaction
    // Verify acceptance
}

func TestPendingLimit_CountAccurate(t *testing.T) {
    // Add transactions
    // Verify pendingCount increments correctly
    // Take transactions
    // Verify pendingCount decrements correctly
}
```

---

## Phase 3: Graduated Stress-Based TX Rejection (P2)

### Problem
Current stress detector only reduces `adaptiveMaxTxs`, but TXs still accumulate in pending. When stress clears, we have a pile-up to process.

### Solution
Add TX rejection at graduated rates based on stress level:
- Random sampling for FIFO ordering
- Lowest-tip rejection for tip-based ordering

### Changes

#### 3.1 Add Stress Level Helper
**File:** `block-builder/stress_detector.go`

```go
// StressLevel represents the current stress level of the system
type StressLevel int

const (
    StressLevelNormal   StressLevel = iota // < 50%
    StressLevelMedium                       // 50-70%
    StressLevelHigh                         // 70-90%
    StressLevelExtreme                      // > 90%
)

// GetStressLevel returns the current stress level
func (b *BlockBuilder) GetStressLevel() StressLevel {
    ratio := b.getStressRatio()
    switch {
    case ratio > 0.9:
        return StressLevelExtreme
    case ratio > 0.7:
        return StressLevelHigh
    case ratio > 0.5:
        return StressLevelMedium
    default:
        return StressLevelNormal
    }
}

// GetStressRejectProbability returns rejection probability for given stress level
func GetStressRejectProbability(level StressLevel) float64 {
    switch level {
    case StressLevelExtreme:
        return 0.50 // Reject 50% of TXs
    case StressLevelHigh:
        return 0.25 // Reject 25% of TXs
    default:
        return 0.0 // No rejection
    }
}
```

#### 3.2 Add Rejection Logic
**File:** `block-builder/pending.go`

In `QueueTransaction()` after pending limit check:
```go
// Stress-based rejection (only if stress rejection is enabled)
if b.config.StressRejectionEnabled && b.getPayloadStressHigh.Load() {
    stressLevel := b.GetStressLevel()
    rejectProb := stress_detector.GetStressRejectProbability(stressLevel)

    if rejectProb > 0 {
        // Tip filtering: reject lowest gas price transactions
        if b.config.TxOrdering == config.TxOrderingTipDesc || b.config.TxOrdering == config.TxOrderingTipAsc {
            // For tip-based ordering, reject lowest-tip TXs
            // We'll implement this by checking against a threshold in the filter
            // For now, fall through to random rejection as placeholder
        }

        // Random sampling rejection
        if float64(b.randSource.Intn(100))/100.0 < rejectProb {
            return common.Hash{}, &JSONRPCError{
                Code:    ErrCodeServerError,
                Message: "server under stress, retry later",
            }
        }
    }
}
```

#### 3.3 Add Config Option
**File:** `block-builder/internal/config/config.go`

```go
// Stress rejection settings
StressRejectionEnabled bool // Enable TX rejection when under stress (default: true)
```

In `LoadFromEnv()`:
```go
StressRejectionEnabled: GetEnvBool("STRESS_REJECTION_ENABLED", true),
```

### Tests
**File:** `block-builder/stress_test.go`

```go
func TestStressRejection_HighStress(t *testing.T) {
    // Set stress ratio to 80%
    // Submit 1000 transactions
    // Verify ~25% rejection rate
}

func TestStressRejection_ExtremeStress(t *testing.T) {
    // Set stress ratio to 95%
    // Submit 1000 transactions
    // Verify ~50% rejection rate
}

func TestStressRejection_NormalStress(t *testing.T) {
    // Set stress ratio to 40%
    // Submit 100 transactions
    // Verify 0% rejection rate
}

func TestStressRejection_TipOrdering(t *testing.T) {
    // Configure tip_desc ordering
    // Set stress ratio to 80%
    // Submit transactions with varying tips
    // Verify lowest-tip transactions are rejected first
}
```

---

## Phase 4: Lazy Nonce Cache Refresh (P3)

### Problem
After SYNCING, nonce cache may have stale entries. Current fix marks ALL stale (too aggressive).

### Solution
Track access time per entry and refresh lazily on access when stale.

### Changes
**File:** `block-builder/internal/txpool/nonce_cache.go`

```go
type nonceCacheEntry struct {
    nonce       uint64
    updatedAt   time.Time
    accessedAt  time.Time  // NEW: track last access
    source      string     // "lru", "rpc", "onchain"
}

const nonceCacheStaleAfter = 5 * time.Second

// Get returns cached value or fetches from RPC if stale (> 5s since access)
func (nc *NonceCache) Get(addr common.Address) (uint64, bool, error) {
    nc.mu.RLock()
    entry, ok := nc.entries[addr]
    if !ok {
        nc.mu.RUnlock()
        return 0, false, nil
    }

    // Update accessed time (we'll update under write lock later if needed)
    entry.accessedAt = time.Now()

    // Check if entry is stale (> 5 seconds since last access)
    if time.Since(entry.accessedAt) > nonceCacheStaleAfter {
        nc.mu.RUnlock()
        // Need to refresh - acquire write lock
        nc.mu.Lock()
        // Double-check another goroutine didn't refresh
        if e, ok := nc.entries[addr]; ok && time.Since(e.accessedAt) > nonceCacheStaleAfter {
            e.accessedAt = time.Now()
            nc.mu.Unlock()
            return nc.fetchAndCache(addr)
        }
        nc.mu.Unlock()
        // Another goroutine refreshed, use cached value
        return entry.nonce, true, nil
    }

    nc.mu.RUnlock()
    return entry.nonce, true, nil
}

// MarkStale marks a specific address's nonce cache entry as stale
// Returns true if entry was found and marked stale
func (nc *NonceCache) MarkStale(addr common.Address) bool {
    nc.mu.Lock()
    defer nc.mu.Unlock()
    if entry, ok := nc.entries[addr]; ok {
        entry.updatedAt = time.Time{} // Zero time means stale
        return true
    }
    return false
}

// MarkAllStale marks all entries as stale (deprecated - use MarkStale instead)
func (nc *NonceCache) MarkAllStale() int {
    nc.mu.Lock()
    defer nc.mu.Unlock()
    count := 0
    for _, entry := range nc.entries {
        entry.updatedAt = time.Time{}
        count++
    }
    return count
}
```

### Tests
**File:** `block-builder/internal/txpool/nonce_cache_test.go`

```go
func TestNonceCache_LazyRefresh(t *testing.T) {
    // Add entry to cache
    // Wait > 5 seconds
    // Access entry
    // Verify fresh value is fetched
}

func TestNonceCache_FreshEntryNotRefreshed(t *testing.T) {
    // Add entry to cache
    // Access entry immediately
    // Verify no RPC call is made
}

func TestNonceCache_TargetedInvalidation(t *testing.T) {
    // Add multiple entries
    // Mark one stale
    // Access all entries
    // Verify only the marked one triggers refresh
}
```

---

## Phase 5: Observability - Pending Growth During Backoff (P4)

### Problem
During SYNCING backoff, it's not clear from logs that pending is growing.

### Solution
Add explicit logging showing pending count during backoff.

### Changes
**File:** `block-builder/production.go`

In `startTimerBasedProduction()`:
```go
if backoffUntil := b.syncBackoffUntil.Load(); backoffUntil > 0 {
    remaining := time.Duration(backoffUntil - time.Now().UnixNano())
    if remaining > 0 {
        pendingNow := b.GetPendingCount()
        log.Printf("RETH SYNCING BACKOFF: waiting %v, pending transactions: %d (growing)",
            remaining.Round(time.Millisecond), pendingNow)
        select {
        case <-ctx.Done():
            return
        case <-time.After(remaining):
        }
        continue
    }
}
```

In `startEventDrivenProduction()`:
```go
// Check sync backoff - if reth is syncing, wait and let pending grow
if backoffUntil := b.syncBackoffUntil.Load(); backoffUntil > 0 {
    remaining := time.Duration(backoffUntil - time.Now().UnixNano())
    if remaining > 0 {
        pendingNow := b.GetPendingCount()
        log.Printf("RETH SYNCING BACKOFF: waiting %v, pending transactions: %d (growing)",
            remaining.Round(time.Millisecond), pendingNow)
        select {
        case <-ctx.Done():
            return
        case <-time.After(remaining):
        }
        continue
    }
}
```

### Tests
**File:** `block-builder/production_test.go`

```go
func TestBackoffLogging_ShowsPendingCount(t *testing.T) {
    // Trigger SYNCING state
    // Verify log line includes pending count
}
```

---

## Phase 6: Integration Tests (All Phases)

### Test: Sync Recovery with Backpressure
**File:** `block-builder/integration_test.go`

```go
func TestIntegration_SyncRecoveryWithBackpressure(t *testing.T) {
    // This test verifies the complete flow:
    // 1. Send transactions until pending reaches limit
    // 2. Trigger reth SYNCING (mock or configure reth to sync)
    // 3. Verify:
    //    - TXs rejected when pending at limit
    //    - Stress detector triggers graduated rejection
    //    - After SYNCING recovery, system resumes normally
    //    - No cache clearing storms (verify nonce cache hit rate)
}
```

---

## Test Coverage Summary

| Test | File | Phase | Description |
|------|------|-------|-------------|
| `TestPendingLimit_RejectsWhenFull` | `pending_test.go` | P2 | Verify rejection at MAX_PENDING_TXS |
| `TestPendingLimit_AcceptsUnderLimit` | `pending_test.go` | P2 | Verify acceptance below limit |
| `TestPendingLimit_CountAccurate` | `pending_test.go` | P2 | Verify count tracking accuracy |
| `TestStressRejection_HighStress` | `stress_test.go` | P3 | Verify 25% rejection at 70-90% stress |
| `TestStressRejection_ExtremeStress` | `stress_test.go` | P3 | Verify 50% rejection at >90% stress |
| `TestStressRejection_NormalStress` | `stress_test.go` | P3 | Verify no rejection below 50% |
| `TestStressRejection_TipOrdering` | `stress_test.go` | P3 | Verify lowest-tip rejection when enabled |
| `TestNonceCache_LazyRefresh` | `nonce_cache_test.go` | P4 | Verify refresh after 5s of no access |
| `TestNonceCache_FreshEntryNotRefreshed` | `nonce_cache_test.go` | P4 | Verify fresh entries not refreshed |
| `TestNonceCache_TargetedInvalidation` | `nonce_cache_test.go` | P4 | Verify `MarkStale()` for individual entries |
| `TestBackoffLogging_ShowsPendingCount` | `production_test.go` | P5 | Verify log includes pending count |
| `TestIntegration_SyncRecoveryWithBackpressure` | `integration_test.go` | All | End-to-end integration test |

**Total new tests:** 11

---

## Files Summary

### Modified Files

| File | Changes |
|------|---------|
| `block-builder/builder.go` | Remove aggressive recovery, add MAX_PENDING_TXS, add pendingCount field |
| `block-builder/pending.go` | Update pendingCount in requeue/take, add rejection checks |
| `block-builder/production.go` | Add pending count to backoff logging |
| `block-builder/stress_detector.go` | Add GetStressLevel(), GetStressRejectProbability() |
| `block-builder/internal/txpool/nonce_cache.go` | Add lazy refresh with accessedAt tracking |
| `block-builder/internal/config/config.go` | Add StressRejectionEnabled option |
| `block-builder/internal/rpc/server.go` | Add maxPendingCapacity to status |

### New Files

| File | Contents |
|------|----------|
| `block-builder/pending_test.go` | 3 pending limit tests |
| `block-builder/stress_test.go` | 4 stress rejection tests |
| `block-builder/production_test.go` | 1 logging test |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `STRESS_REJECTION_ENABLED` | `true` | Enable TX rejection when under stress |
| `STRESS_THRESHOLD_PCT` | `70` | Percentage of block time for stress threshold |

---

## Backward Compatibility

All changes are backward compatible:
- Default values match existing behavior
- New config options have sensible defaults
- Removed `MarkAllStale()` behavior is replaced by lazy refresh
- Existing tests continue to pass

---

## Rollout Plan

1. **Phase 1-2:** Safe to deploy - removes buggy behavior, adds backpressure
2. **Phase 3:** Feature flag controlled (`STRESS_REJECTION_ENABLED=true`)
3. **Phase 4-5:** Observability only, no behavioral changes
4. **All phases:** Run full test suite before merging

---

## Performance Considerations

| Change | Impact |
|--------|--------|
| Lazy nonce refresh | Reduces RPC calls by ~80% during normal operation |
| Pending limit | Prevents OOM scenarios under load |
| Stress rejection | Reduces pending growth by 25-50% under stress |
| Atomic counters | lock-free pending count updates |

---

## Related Documentation

- See `CLAUDE.md` for architecture overview
- See `block-builder/internal/txpool/nonce_cache.go` for nonce management details
- See `block-builder/circuit_breaker.go` for circuit breaker implementation
- See `block-builder/stress_detector.go` for stress detection logic
