# Priority Tasks

## 1. UI Test Stop Behavior (Bug Fix)
- [ ] Dashboard continues showing live data after test stops - should freeze/stop streaming
- [ ] Handle pending transactions when test run stops (show verification phase clearly)
- [ ] Files: `dashboard/src/stores/go-load-test-store.ts`, `dashboard/src/app/load-test/page.tsx`

## 2. Split builder.go (2953 lines -> max 300 per file) ✅ COMPLETE

Circuit breaker and stress detector already extracted. All extraction complete:

- [x] Extract `block-builder/filtering.go` (395 lines)
  - `filterExecutable()`, `sortExecutableByTip()`, sorting comparators
  - `executableTx` and `senderBatch` types
  - Slice pool functions (returnExecutableSlice, etc.)

- [x] Extract `block-builder/rejection.go` (274 lines)
  - `analyzeRejectedTxs()`, `probeRejectionReasons()`, `classifyRejection()`
  - `getUnknownTxDetails()`, `formatGwei()`, `formatEther()`

- [x] Extract `block-builder/nonces.go` (315 lines)
  - `getOnChainNoncesBatch()`, `refreshNoncesForRejectedTxs()`
  - `commitNonces()`, `recoverFromStuckState()`
  - Nonce-related recovery logic

- [x] Extract `block-builder/pending.go` (304 lines)
  - `collectPendingTransactions()`, `takePendingTransactions()`
  - `clearPendingPool()`, `requeueOverflow()`
  - `QueueTransaction()`, `processVerifiedTransactions()`
  - Pending pool helpers (getPendingByKey, addToPendingPool, etc.)

- [x] Extract `block-builder/stats.go` (353 lines)
  - All `Get*()` methods (GetPendingCount, GetBlocksBuilt, etc.)
  - `Pressure()`, `GetTxPoolStatus()`, `GetTxPoolContent()`

- [x] Extract `block-builder/production.go` (270 lines)
  - `StartBlockProduction()`, `startTimerBasedProduction()`
  - `startEventDrivenProduction()`, `drainNotify()`
  - `Stop()`, `WaitForPendingCount()`

- [x] Reduce `block-builder/builder.go` to core only (1158 lines)
  - BlockBuilder struct and NewBlockBuilder
  - BuildBlock() (the main block building logic)
  - Engine API helpers (engineCall, engineCallWithRetry, l2Call)
  - Timestamp and block helpers (getNextTimestamp, getLatestBlock)

## 3. Split load-generator main.go (3844 lines -> separate packages) - DEFERRED

Note: Marked as DEFERRED in main todo.md - major architectural refactoring needed.
60+ functions, would require significant effort to extract cleanly.
