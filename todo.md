# Sequencer PoC - TODO

## Performance Optimizations

### High Priority
- [x] **Reduce SeenHashTracker memory** - Changed `DefaultMaxSeenHashes` from 10M to 1M (32 MB vs 320 MB)
- [x] **Add MAX_SEEN_HASHES env var** - Make seen hash limit configurable via environment variable
- [ ] **Implement batch signature verification** - Amortize CGO overhead for 2-5x throughput improvement
- [ ] **Profile block-builder with pprof** - Run benchmarks with CPU/memory profiling, identify optimization opportunities via code review

### Medium Priority
- [ ] **Engine API SYNCING recovery** - When op-reth returns SYNCING, builder gets stuck. Implement recovery in `pipeline.go`
- [ ] **Increase signature worker scaling** - Add `SIGNATURE_WORKERS` env var, default to `runtime.NumCPU()`
- [ ] **Track errors by category** - See TODO in `load-generator/internal/metrics/collector.go`

## Features

### Hyperlane Integration
- [ ] **Finalize hyperlane-init setup** - New untracked directory needs integration
- [ ] **Document Hyperlane relayer configuration** - See `docs/hyperlane.md`

### ZisK Prover
- [ ] **Complete ZisK prover integration** - Untracked `zisk-prover/` directory
- [ ] **Document SP1 to ZisK differences** - See `docs/zisk-sp1-mapping.md`

## Code Quality

### Testing
- [ ] **Add more integration tests** - Current coverage focused on unit tests
- [ ] **Profile at higher load** - Run profiling at 200+ TPS to identify additional bottlenecks
- [x] **Add pre-commit hook** - Run full test suite before commits (`make setup-hooks` to install)

### Documentation
- [ ] **Update architecture diagrams** - Reflect current state after recent changes
- [ ] **Document broadcast system** - Untracked `broadcast/` directory

## Known Issues

- **Pipeline gets stuck** - Engine API SYNCING state not handled gracefully
- **200+ TPS bottleneck** - Nonce batching limits throughput beyond 200 TPS
- **Engine API latency** - FCU + GetPayload take 100-500ms

## Completed

_Move items here when done_
