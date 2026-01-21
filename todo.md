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
- [x] **Hyperlane cross-chain messaging** - Integrated hyperlane-init, warp routes, and relayer config
- [x] **Document Hyperlane relayer configuration** - See `docs/hyperlane.md`
- [ ] **Test L1<->L2 bridge flow end-to-end** - Verify message passing works with deployed contracts

### ZisK Prover
- [x] **ZisK prover integration** - Added zisk-prover/ with Go wrapper and Dockerfile
- [x] **Document SP1 to ZisK differences** - See `docs/zisk-sp1-mapping.md`
- [ ] **Run ZisK prover in CI** - Verify prover works in test environment

## Code Quality

### Testing
- [ ] **Add more integration tests** - Current coverage focused on unit tests
- [ ] **Profile at higher load** - Run profiling at 200+ TPS to identify additional bottlenecks
- [x] **Add pre-commit hook** - Run full test suite before commits (`make setup-hooks` to install)

### Documentation
- [ ] **Update architecture diagrams** - Reflect current state after recent changes

## Known Issues

- **Pipeline gets stuck** - Engine API SYNCING state not handled gracefully
- **200+ TPS bottleneck** - Nonce batching limits throughput beyond 200 TPS
- **Engine API latency** - FCU + GetPayload take 100-500ms

## Completed

- [x] **Reduce SeenHashTracker memory** - Changed from 10M to 1M hashes (32 MB vs 320 MB)
- [x] **Add MAX_SEEN_HASHES env var** - Configurable memory limit
- [x] **Add pre-commit hook** - Run full test suite before commits
- [x] **Add txpool namespace RPC methods** - txpool_status, txpool_content, txpool_contentFrom, txpool_inspect
- [x] **Hyperlane integration** - Cross-chain messaging with warp routes
- [x] **ZisK prover integration** - Alternative zkVM backend
- [x] **Dashboard bridge panel** - Dynamic Hyperlane address loading
