# Sequencer PoC

Preconfirmation sequencer proof-of-concept with sub-second block times.

## Execution Layer Selection

The project supports two execution layer backends, selected via `EXECUTION_LAYER` environment variable:

### reth Mode (Default)
Uses the custom block-builder with op-reth via Engine API. Supports preconfirmations.

```
load-generator → block-builder:13000 → op-reth Engine API:8551
```

### cdk-erigon Mode
Uses Polygon's cdk-erigon as a standalone sequencer. Block-builder is bypassed.

```
load-generator → cdk-erigon:8545 (direct sequencer)
```

| Aspect | reth Mode | cdk-erigon Mode |
|--------|-----------|-----------------|
| Block Building | External (block-builder) | Internal (sequencer) |
| TX Submission | block-builder:13000 | cdk-erigon:8545 |
| Preconfirmations | Yes (WebSocket) | No |
| Engine API | Required | Not used |
| Services | l2-reth, block-builder | l2-cdk-erigon |

## Architecture (reth Mode)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Load Generator                              │
│  (transaction building, signing, sending via HTTP/WS)               │
└────────────────────────────┬────────────────────────────────────────┘
                             │ HTTP: eth_sendRawTransaction
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Block Builder                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐ │
│  │ TX Queue │→ │ TX Pool  │→ │ Filter   │→ │ Engine API (op-reth) │ │
│  │ (100k)   │  │ (sharded)│  │ (nonces) │  │ FCU + GetPayload     │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────────┘ │
│                     │                              │                 │
│                     ▼                              ▼                 │
│              Preconf Hub ────────────────→ WebSocket Events          │
└─────────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           op-reth                                   │
│              (execution layer, block production)                    │
└─────────────────────────────────────────────────────────────────────┘
```

## Required Features & Metrics

### Dashboard Load Test Page MUST Show:
- **Real-time chart** with MGas/s and TPS over time
- **Metrics snapshot**: Current MGas/s, Peak MGas/s, Total Gas Used
- **Latency histogram**: Confirmation and preconfirmation latencies
- **Percentile table**: p50/p75/p90/p95/p99 for latency, MGas/s, TPS, block fill rate
- **Verification summary**: TX sent/confirmed/failed counts

### Test History MUST Include:
- **Time series data**: MGas/s, TPS, block fill rate per sample
- **Summary stats**: Peak MGas/s, total gas used, average TPS
- **Latency percentiles**: Both confirmation and preconfirmation
- **Gas metrics per block**: gasUsed, gasLimit, fillRate

### API Response Format:
- ALL JSON responses use **camelCase** field names (not PascalCase)
- Go structs MUST have `json:"fieldName"` tags
- TypeScript types in `dashboard/src/types/` define the contract

## Quick Start

```bash
# Start with op-reth + block-builder (default)
make run-reth

# Start with cdk-erigon sequencer
make run-cdk-erigon

# Start with fast blocks and preconfirmations (reth mode only)
BLOCK_TIME_MS=250 ENABLE_PRECONFIRMATIONS=true make run-reth

# View logs
make logs

# Run load test via dashboard
open http://localhost:18000/load-test/

# Stop services
make stop

# Development mode (local load-generator)
make dev              # for reth
make dev-cdk-erigon   # for cdk-erigon
```

## Go Setup (gvm)

This project uses gvm (Go Version Manager). **Do not run `go` directly** - it won't work.

```bash
# ALWAYS source gvm first, then use gvm's go
source ~/.gvm/scripts/gvm && gvm use go1.25

# Run tests
source ~/.gvm/scripts/gvm && gvm use go1.25 && go test ./...

# Build
source ~/.gvm/scripts/gvm && gvm use go1.25 && go build ./...

# One-liner pattern for any go command
source ~/.gvm/scripts/gvm && gvm use go1.25 && go <command>
```

**Why this matters**: The system `go` binary either doesn't exist or is the wrong version. gvm manages Go versions but requires sourcing its script first.

## Services

| Service | Port | Description |
|---------|------|-------------|
| block-builder | 13000 | TX reception + block building |
| block-builder | 13002 | Preconfirmation WebSocket |
| op-reth | 18545 (HTTP), 18546 (WS) | L2 execution layer |
| load-generator | 13001 | Load test API |
| dashboard | 18000 | Web UI for testing |

## Configuration (Environment Variables)

| Variable | Default | Description |
|----------|---------|-------------|
| `EXECUTION_LAYER` | reth | Execution layer: `reth` or `cdk-erigon` |
| `BLOCK_TIME_MS` | 1000 | Block interval in milliseconds (reth only) |
| `GAS_LIMIT` | 1000000000 | Block gas limit (1 gigagas) |
| `MAX_TXS_PER_BLOCK` | 25000 | Maximum transactions per block (reth only) |
| `TX_ORDERING` | fifo | Transaction ordering: `fifo`, `tip_desc`, `tip_asc` |
| `ENABLE_PRECONFIRMATIONS` | true | WebSocket preconf events (reth only) |
| `SKIP_EMPTY_BLOCKS` | false | Don't produce blocks without transactions (reth only) |

## Performance Characteristics

### Tested Sustainable Throughput:
- **100 TPS**: 99% success rate, ~235ms avg latency
- **200+ TPS**: Nonce batching becomes bottleneck
- **Block rate**: ~4 blocks/sec at 250ms block time

### Known Bottlenecks:
1. **Engine API SYNCING** - If op-reth falls behind, builder gets stuck
2. **Nonce filtering** - Each block can only include sequential nonces per account
3. **Engine API latency** - FCU + GetPayload take 100-500ms

## Key Files

### Block Builder (`block-builder/`)
| File | Purpose |
|------|---------|
| `builder.go` | Main BlockBuilder struct and StartBlockProduction |
| `pipeline.go` | Pipelined block production (overlap mode) |
| `internal/builder/builder.go` | Core block building logic |
| `internal/txpool/nonce.go` | Nonce caching with LRU |
| `internal/txpool/filter.go` | TX filtering and ordering |
| `internal/preconf/hub.go` | WebSocket preconf event broadcasting |
| `internal/engine/client.go` | Engine API client (FCU, GetPayload) |

### Load Generator (`load-generator/`)
| File | Purpose |
|------|---------|
| `cmd/loadgen/main.go` | Main entry, worker management |
| `internal/metrics/collector.go` | Latency and throughput tracking |
| `internal/storage/models.go` | Database models (MUST have json tags!) |
| `internal/storage/sqlite.go` | SQLite persistence |
| `internal/transport/http.go` | HTTP API handlers |
| `pkg/types/types.go` | Public API types |

### Dashboard (`dashboard/`)
| File | Purpose |
|------|---------|
| `src/app/load-test/page.tsx` | Main load test page |
| `src/app/load-test/history/page.tsx` | Test history detail view |
| `src/stores/metrics-store.ts` | Metrics state (MGas/s, TPS) |
| `src/stores/go-load-test-store.ts` | Go load generator integration |
| `src/types/load-test.ts` | TypeScript type definitions |
| `src/types/metrics.ts` | Metrics type definitions |

## Internal Architecture

### Nonce Tracking (Two Separate Systems)

The block builder has **two distinct nonce tracking systems** - don't confuse them:

#### 1. NonceMap (builder.go) - Simple Key-Value Store
- **Purpose**: Track expected nonces during block building
- **Implementations**: `SimpleNonceMap`, `ShardedNonceMap` (256 shards)
- **Config**: `USE_SHARDED_NONCE_MAP` (default: true)
- **Location**: `internal/txpool/sharded_nonce_map.go`
- **Interface**: `NonceMapInterface`

```go
// Used directly in builder.go
nonceMap txpool.NonceMapInterface
```

#### 2. NonceTracker (producer.go / filter.go) - Full-Featured
- **Purpose**: Chain lookups, LRU eviction, cache freshness for Filter
- **Implementation**: `NonceTracker` only (no sharded version)
- **Features**: L2 client integration, singleflight coalescing, `GetFresh()` for timeout fallback
- **Location**: `internal/txpool/nonce.go`

```go
// Used by SimpleProducer and Filter
type Filter struct {
    nonceTracker *NonceTracker  // Concrete type, not interface
}
```

### When to Modify What

| Task | File(s) to Change |
|------|-------------------|
| Change nonce storage behavior | `sharded_nonce_map.go` (NonceMapInterface) |
| Change nonce filtering logic | `filter.go` + `nonce.go` (NonceTracker) |
| Add new block production mode | `builder.go` or new file in root |
| Change preconfirmation events | `internal/preconf/hub.go` |
| Modify Engine API calls | `internal/engine/client.go` |

### Transaction Lifecycle

```
1. TX arrives via HTTP → QueueTransaction() in builder.go
2. Parsed and added to txQueue channel (100k buffer)
3. Block production loop drains txQueue → pendingTxs slice
4. Filter.FilterExecutable() sorts by nonce, identifies:
   - Executable: nonce matches expected → include in block
   - Future: nonce > expected → re-queue for later
   - Dropped: nonce < expected → already executed
5. BuildBlock() sends to Engine API
6. On success: nonceMap updated, preconf events emitted
```

### Glossary

| Term | Definition |
|------|------------|
| **Preconfirmation** | Promise that TX will be included (before actual block confirmation) |
| **Inflight nonce** | Nonce assigned to block being built, not yet confirmed by reth |
| **FCU** | forkchoiceUpdated - Engine API call to set chain head and request new payload |
| **GetPayload** | Engine API call to retrieve built block after FCU |
| **Deposit TX** | L1→L2 system transaction, must be first in every block |
| **RBF** | Replace-by-fee, requires 10% gas price bump to replace pending TX |

## Testing

### Unit Tests
```bash
make test                    # All tests with race detector
make test-block-builder      # Block builder only
make test-load-generator     # Load generator only
```

### Integration Tests
```bash
make test-contract           # API contract tests (no stack needed)
make test-e2e                # E2E tests (requires running stack)
make test-integration        # Full integration suite (starts/stops stack)
```

### Benchmarks
```bash
make bench-block-builder     # Block builder benchmarks
make bench-load-generator    # Load generator benchmarks
```

## Common Issues

### Pipeline Gets Stuck
- **Symptom**: Blocks stop being produced, pending count grows
- **Cause**: Engine API returned SYNCING, builder didn't recover
- **Fix**: Restart the stack, or implement SYNCING recovery in pipeline.go

### Low Throughput (< 100 TPS)
- Check Engine API latency in logs
- Monitor pending count - if growing, nonce filtering is slow
- Increase number of accounts to distribute nonces

### Missing MGas/s in History
- Time series must include `gasUsed` per sample
- Go storage models must track block gas metrics
- Dashboard reads from `timeSeries.mgasPerSec` array

### API PascalCase Bug
- Go structs without `json:"fieldName"` tags serialize as PascalCase
- TypeScript expects camelCase
- Always add json tags to storage/models.go structs

## Browser Automation Testing

When using Chrome browser automation for testing the dashboard:

1. **Window Size**: Resize to 1200x900 or larger for full page screenshots
2. **Screenshots**: Always capture full page to see all UI elements and metrics
3. **Before Tests**: Clear localStorage to avoid stale state issues
4. **After Actions**: Wait 2-3 seconds before taking screenshots to allow UI updates

## Development Workflow

1. Make changes to Go code
2. Run `make test` to verify
3. Rebuild with `docker compose build`
4. Test with `make run` and dashboard
5. Check logs with `make logs`
