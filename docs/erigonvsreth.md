# CDK-Erigon vs Op-Reth + Block Builder: Performance Comparison

**Date:** 2026-02-09
**Platform:** macOS (Docker Desktop), Apple Silicon

## Results Summary

### CDK-Erigon v2.65.0-RC1 (Sovereign Mode)

**Load Type:** Realistic mixed transactions (40% ETH transfer, 30% ERC20 transfer, 10% ERC20 approve, 15% storage write, 5% heavy compute)
**Test Duration:** 60 seconds per test

| Input TPS | On-chain TPS | Avg MGas/s | Peak MGas/s | Fail Rate | Status |
|-----------|-------------|-----------|------------|-----------|--------|
| 1,000 | 971 | 47.2 | 159.1 | 0.8% | Sustainable |
| **2,000** | **1,885** | **91.7** | **163.8** | **0.0%** | **Sustainable ceiling** |
| 2,500 | 868 | 42.1 | 173.9 | 5.0% | Degraded (roTxsLimiter) |
| 3,000 | 773 | 37.9 | 196.3 | 3.5% | Degraded |

**Sustainable ceiling: ~2,000 TPS realistic (~92 MGas/s)**
**Breaking point: ~2,500 TPS (roTxsLimiter bottleneck)**

### Op-Reth v1.9.3 + Block Builder (External)

**Load Type:** Realistic mixed transactions
**Test Duration:** 60 seconds per test

#### Baseline (pre-optimization)

| Input TPS | Confirmed | Avg MGas/s | Peak MGas/s | Fail Rate | Preconf Rate | Latency p50/p99 |
|-----------|-----------|-----------|------------|-----------|-------------|-----------------|
| 5,000 | 300,502 | 249.4 | 288.3 | 0.0% | 100% | 127/202ms |
| **10,000** | **582,741** | **455.3** | **516.4** | **0.4%** | **97.1%** | **177/271ms** |
| 12,000 | 388,762 | 303.2 | 695.9 | 0.3% | 58.2% | 175/338ms |
| 15,000 | 111,204 | 90.7 | 704.5 | 0.5% | 12.4% | 115/497ms |

Baseline ceiling: ~10,000 TPS realistic (~455 MGas/s)

#### Optimized (post-pprof)

Optimizations applied:
- **Builder:** Disabled WebSocket compression (saved 1.18 GB/30s allocations), doubled sig verifier workers (16 -> 32)
- **Loadgen:** Hash keys instead of hex strings (-94 MB heap), TxFlowTracker cleanup on terminal states (-105 MB), batch RPC support

| Input TPS | Confirmed | Confirm Rate | Avg MGas/s | Peak MGas/s | Fail Rate | Preconf Rate | Latency p50/p99 |
|-----------|-----------|-------------|-----------|------------|-----------|-------------|-----------------|
| 10,000 | 600,175 | 100% | 426.3 | 497.1 | 0.0% | 100% | - |
| **12,000** | **710,448** | **98.6%** | **457.8** | **569.2** | **0.0%** | **99.9%** | - |
| 13,000 | 362,147 | 46.4% | 240.1 | 573.8 | 0.3% | 98.6% | - |
| 15,000 | 203,219 | 22.5% | 137.9 | 609.3 | 0.3% | 97.8% | - |

**Optimized ceiling: ~12,000 TPS realistic (~458 MGas/s)**
**Breaking point: ~13,000 TPS (builder CPU saturation)**

#### ETH Transfer Only (Maximum Throughput)

**Load Type:** 100% EOA-to-EOA ETH transfers (~21K gas each)
**Test Duration:** 60 seconds per test, optimized stack

| Input TPS | Confirmed | Confirm Rate | Avg MGas/s | Peak MGas/s | Preconf Rate | Latency p50/p99 |
|-----------|-----------|-------------|-----------|------------|-------------|-----------------|
| 15,000 | 882,411 | 98.0% | 247.1 | 302.4 | 100% | -/227ms |
| **20,000** | **1,170,652** | **97.5%** | **329.8** | **391.2** | **99.7%** | **-/293ms** |
| 22,000 | 307,124 | 23.7% | 86.2 | 412.8 | 95.6% | - |
| 25,000 | 718,344 | 50.8% | 201.4 | 447.3 | 93.2% | - |

**ETH transfer ceiling: ~20,000 TPS (~330 MGas/s, ~1.17M TXs in 60s)**
**Breaking point: ~22,000 TPS (sig verification CPU saturation)**

### Head-to-Head Comparison

| Metric | CDK-Erigon | Op-Reth (Baseline) | Op-Reth (Optimized) | Ratio (Optimized) |
|--------|-----------|-------------------|--------------------|--------------------|
| Sustainable TPS (realistic) | 2,000 | 10,000 | 12,000 | **6x** |
| Sustainable MGas/s (realistic) | 92 | 455 | 458 | **5x** |
| ETH transfer TPS | ~2,800 | - | 20,000 | **7.1x** |
| Peak MGas/s | 196 | 704 | 609 | **3.1x** |
| Preconfirmation latency | N/A | p50: 127ms, p99: 202ms | Similar | N/A |
| Breaking point TPS (realistic) | ~2,500 | ~12,000 | ~13,000 | **5.2x** |
| Primary bottleneck | MDBX roTxsLimiter | Preconf I/O | ECDSA sig verification | - |

## Collapse Analysis (Op-Reth at 25K TPS)

At 25K TPS input, the builder enters a cascading failure mode:

**Root Cause: CPU saturation from ECDSA signature verification**

pprof CPU profile during 25K TPS collapse:
- **Signature verification: 43.8%** of total CPU (secp256k1 ECDSA recovery)
- RPC handler: 12.1%
- Block building: 8.4%
- WebSocket I/O: 7.2%
- GC: 6.5%
- Total CPU utilization: 242% (2.4 cores saturated)

**Failure cascade:**
1. Sig verification can't keep up with 25K TPS input rate
2. Transactions queue, nonces arrive out-of-order
3. Gap resolver drops future TXs permanently: `"Gap resolution: dropped 17,128 future TXs from 285 senders"`
4. `txsGapResolved: 224,052` permanently lost transactions in a single 120s test
5. Only 170-177 TXs per block despite 25K input
6. `txsRequeued: 787,437` - massive churn in the mempool

**Goroutine count:** 2,101 (vs 764 at sustainable 10K load)

**Implication:** The hard ceiling is determined by CPU-bound ECDSA signature verification. To push beyond 20-25K TPS would require:
- Moving sig verification to GPU/FPGA
- Using BLS aggregate signatures
- Distributing verification across multiple builder instances
- Hardware with higher single-core IPC (currently Apple Silicon M-series)

## Test Setup

### CDK-Erigon Configuration

**Image:** `cdk-erigon:local` built from `v2.65.0-RC1` tag
**Mode:** Sovereign sequencer (`CDK_ERIGON_SEQUENCER=1`)

Key chainspec settings (`dynamic-devnet-chainspec.json`):
- `normalcyBlock: 0` (London/Shanghai/Cancun from genesis)
- `pmtEnabledBlock: 0` (Poseidon Merkle Tree from genesis)
- `sovereignModeBlock: 0` (no L1 dependency)
- `pragueTime: 0`, `fepTime: 0`
- `chainId: 42069`

Key YAML settings (`cdk-erigon.yaml`):
- `zkevm.disable-virtual-counters: true` (**critical** - 28x perf improvement)
- `zkevm.sequencer-block-seal-time: 500ms` (default 2s)
- `zkevm.allow-free-transactions: true`
- `zkevm.reject-low-gas-price-transactions: false`
- `zkevm.sequencer-block-gas-limit: 1500000000` (1.5 gigagas)
- `externalcl: true`
- `txpool.globalslots: 100000`, `txpool.globalqueue: 100000`
- `zkevm.rpc-ratelimit: 0` (disabled)

MDBX optimizations (environment variables):
- `NO_SYNC=true` (~10x faster writes, async flushes)
- `MDBX_DIRTY_SPACE_MB=2048` (2GB dirty space buffer)
- `--db.read.concurrency 9000` (roTxsLimiter semaphore)

Docker resource limits: **None** (unlimited CPU/memory)

### Op-Reth + Block Builder Configuration

**Reth image:** `ghcr.io/paradigmxyz/op-reth:v1.9.3`
**Builder image:** `gatewayfm/blockbuilder:latest`

Key reth settings:
- `--db.sync-mode safe-no-sync` (~10x faster writes)
- `--db.growth-step 4GB`
- `--db.max-readers 512`
- Block time: 150ms (configurable via `BLOCK_TIME_MS`)
- Gas limit: 1,000,000,000 (1 gigagas)
- Max TXs per block: 25,000

Block builder settings (optimized):
- FIFO transaction ordering (tip_desc used in some tests)
- Preconfirmations enabled (WebSocket, compression disabled)
- Batch JSON pre-marshaling
- 32 signature verifier workers (`runtime.NumCPU() * 2`)

### Load Generator Configuration

All realistic tests use the `realistic` pattern with:
- **Transaction mix:** 40% ETH transfer, 30% ERC20 transfer, 10% ERC20 approve, 15% storage write, 5% heavy compute
- **Tip distribution:** Exponential (0.001 - 10 Gwei)
- **Accounts:** Scaled with TPS (500-10,000 accounts)
- **Duration:** 60 seconds per test
- **TX logging:** Disabled (for performance)

ETH transfer tests use `constant` pattern with 100% EOA transfers and 500 accounts.

### Infrastructure

- **L1:** Anvil (Foundry) local Ethereum node
- **Docker:** Docker Desktop on macOS (Apple Silicon)
- **Network:** Docker bridge network (`gasstorm`)

## Bottleneck Analysis

### CDK-Erigon: MDBX roTxsLimiter

The primary bottleneck for cdk-erigon above 2,000 TPS is the MDBX read transaction limiter (`roTxsLimiter`). Despite setting `--db.read.concurrency 9000`, errors still occur at 2,500+ TPS:

```
mdbx.MdbxKV.BeginRo: roTxsLimiter error context canceled
```

This suggests the sequencer's internal block building creates many long-lived read transactions that consume the semaphore, leaving insufficient capacity for RPC `eth_sendRawTransaction` calls. The 500ms block seal time means each block holds read transactions for that duration.

Without virtual counters (`disable-virtual-counters: true`), the sequencer skips ZK-proof-related accounting, which was the previous bottleneck (only ~100 TPS without this setting).

### Op-Reth: ECDSA Signature Verification (CPU-bound)

Op-reth with the external block builder handles much higher throughput because:
1. **Separation of concerns:** Block building is offloaded to a dedicated Go service
2. **Engine API:** Efficient FCU + GetPayload cycle (~15-20ms per block)
3. **Preconfirmations:** WebSocket-based immediate confirmation feedback
4. **MDBX tuning:** `safe-no-sync` + large growth step + high reader limit

**pprof CPU profile at 10K TPS (30s sample):**

| Component | CPU % | Notes |
|-----------|-------|-------|
| ECDSA sig verification | 35.8% | secp256k1 CGO recovery |
| Preconf WebSocket I/O | 10.0% | Write + marshal per client |
| RPC handler | 8.7% | HTTP request parsing |
| Block building | 8.4% | Nonce filtering + assembly |
| GC | 6.5% | Heap pressure from allocations |

**Heap profile (optimized):**
- Builder: 63.6 MB in-use (lean - SeenHashTracker ring buffer is 30.5 MB pre-allocated)
- Loadgen: 522 MB in-use (TxFlowTracker sync.Map + hex string allocations, improved by ~200 MB post-optimization)

**Allocation hotspots (pre-optimization, 30s):**
- `compress/flate.dictDecoder.init`: 1.18 GB (WebSocket compression - **eliminated**)
- `json-iterator WriteStringHTMLEscaped`: 2.35 GB (JSON encoding per client)
- `bytes.growSlice`: 3.18 GB (buffer reallocation)

The hard ceiling is ECDSA signature verification at ~44% CPU. At 25K TPS, the builder saturates at 2.4 cores (242% utilization) and enters the cascading nonce-gap failure described above.

## Methodology Notes

- Each test uses a **fresh genesis** (data volume wiped between test levels) to avoid state accumulation bias
- CDK-erigon has no preconfirmation support, so `txConfirmed` is always 0 during real-time tracking. On-chain verification provides the true count.
- Op-reth's `onChainTps` metric appears lower than reality due to a known calculation bug (block range includes idle blocks before/after the test). `avgMgasPerSec` is the reliable real-time metric.
- "Realistic" transactions use ~49K gas/tx average (vs 21K for eth-transfer only), so MGas/s is the better comparison metric than raw TPS.
- Optimized results use the same test parameters as baseline; only builder/loadgen code was changed.
