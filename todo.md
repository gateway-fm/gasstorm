# Sequencer PoC - TODO

## Review
- [ ] **Bridge testing** - review the bridge and ensure that e2e tests and manual testing show that it is fully functional with post-verification on-chain of the bridging activity

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
