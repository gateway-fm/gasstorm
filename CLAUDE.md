# GasStorm

> This file is for Claude Code context. For user-facing docs, see [README.md](./README.md).

Blockchain sequencer load testing framework with sub-second block times.

**Task Tracking:** See [todo.md](./todo.md) for current tasks and priorities.

## Git Workflow

When committing, use `--no-gpg-sign` to avoid GPG timeout issues:
```bash
git commit --no-gpg-sign -m "commit message"
```

## External Dependencies

Both the block-builder and load-generator are maintained in separate repositories and pulled as Docker images:

| Component | Image | Source |
|-----------|-------|--------|
| block-builder | `gatewayfm/blockbuilder` | [github.com/gateway-fm/blockbuilder](https://github.com/gateway-fm/blockbuilder) |
| load-generator | `gatewayfm/loadgenerator` | [github.com/gateway-fm/loadgenerator](https://github.com/gateway-fm/loadgenerator) |

To use specific versions:
```bash
BLOCKBUILDER_VERSION=v1.0.0 make run-reth
LOADGENERATOR_VERSION=v1.0.0 make run-reth
```

For local development with sibling repos:
```bash
cp docker-compose.override.yaml.example docker-compose.override.yaml
# Edit paths if needed, then:
docker compose up --build -d
```

Dev mode (`make dev`) expects the loadgenerator repo at `../loadgenerator`.

## Execution Layer Selection [OVERHANGING]

The project supports multiple execution layer backends via a **capability-based architecture**. Select via `EXECUTION_LAYER` environment variable.

> **Note:** Only reth mode is core. cdk-erigon and gravity-reth are overhanging and will be extracted later.

### Capability-Based Architecture

The load-generator uses capability checks instead of string comparisons:

```go
// github.com/gateway-fm/loadgenerator/internal/execnode/capabilities.go
type ExecutionLayerCapabilities struct {
    Name                     string
    HasExternalBlockBuilder  bool   // true = uses block-builder, false = direct sequencer
    SupportsPreconfirmations bool   // WebSocket preconf events
    SupportsBuilderStatusAPI bool   // GET /status endpoint
    SupportsBlockMetricsWS   bool   // WebSocket /ws/block-metrics
}
```

### Supported Execution Layers

| Layer | Block Builder | Preconfirmations | Builder Status | Block Metrics WS |
|-------|---------------|------------------|----------------|------------------|
| `reth` / `op-reth` | External | Yes | Yes | Yes |
| `gravity-reth` | None (direct) | No | No | No |
| `cdk-erigon` | None (direct) | No | No | No |

### Adding a New Execution Layer

1. Add capability function in the loadgenerator repo (`internal/execnode/registry.go`)
2. Register in `DefaultRegistry()`
3. Create `docker-compose-new-node.yaml`
4. Add Makefile target (optional)

**No changes needed to:** load-generator logic, dashboard code, API handlers

## Prover Selection [OVERHANGING]

| Prover | Description | Profile |
|--------|-------------|---------|
| `sp1` (default) | OP Succinct with SP1 zkVM | `prover-sp1` |
| `zisk` | ZisK zkVM (Polygon) | `prover-zisk` |

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

## Go Setup

Go 1.25 is installed locally at `~/go-local/go/bin`. Just run `go` directly:

```bash
go test ./...
go build ./...
```

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
| `BLOCKBUILDER_VERSION` | latest | Block builder Docker image tag |
| `LOADGENERATOR_VERSION` | latest | Load generator Docker image tag |
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

### Load Generator (external: [github.com/gateway-fm/loadgenerator](https://github.com/gateway-fm/loadgenerator))

See the loadgenerator repo's CLAUDE.md for its key files table.

### Dashboard (`dashboard/`)
| File | Purpose |
|------|---------|
| `src/app/load-test/page.tsx` | Main load test page |
| `src/app/load-test/history/page.tsx` | Test history detail view |
| `src/stores/metrics-store.ts` | Metrics state (MGas/s, TPS) |
| `src/stores/go-load-test-store.ts` | Go load generator integration |
| `src/types/load-test.ts` | TypeScript type definitions |
| `src/types/metrics.ts` | Metrics type definitions |

## Block Builder API

The block-builder (external Docker image) exposes these endpoints:

### HTTP (Port 13000)
- `POST /` - JSON-RPC endpoint for `eth_sendRawTransaction`
- `GET /status` - Builder status and metrics
- `GET /eth_getPendingNonce?address=0x...` - Get pending nonce for address

### WebSocket (Port 13002)
- `/ws/preconfirmations` - Preconfirmation events stream
- `/ws/block-metrics` - Block production metrics stream

## Load Generator Nonce Management

The load generator uses a **reservation pattern** for high-throughput nonce management:

```go
// Reserve nonce atomically
n := account.ReserveNonce()  // Increments immediately

// Send transaction asynchronously
queued := sender.SendAsync(ctx, txData, func(err error) {
    if err != nil {
        n.Rollback()  // Return nonce to pool on failure
    } else {
        n.Commit()    // Mark nonce as successfully used
    }
})
```

**Key Design Decisions:**
- **Local tracking**: Nonces are tracked locally (not fetched per-TX) for speed
- **Reservation pattern**: ReserveNonce increments immediately, preventing gaps
- **Commit in callback**: Never commit before async send completes
- **Reactive sync**: Resync only on circuit breaker open (not periodic)

**Nonce Fetch Strategy** (loadgenerator `internal/rpc/client.go`):
1. First tries `eth_getPendingNonce` (block builder's view)
2. Falls back to `eth_getTransactionCount("pending")` to include mempool

**Circuit Breaker Recovery:**
- Opens when failure rate > 5% or revocation rate > 20%
- Triggers `resyncAllNonces()` to fetch fresh nonces from builder
- Rate is reduced to 10 TPS until recovery

## Testing

### Unit Tests
```bash
make test                    # Dashboard lint
cd ../loadgenerator && make test  # Load generator tests (external repo)
```

### Integration Tests
```bash
make test-contract           # API contract tests (requires ../loadgenerator)
make test-e2e                # E2E tests (requires running stack + ../loadgenerator)
make test-integration        # Full integration suite (starts/stops stack)
```

### Benchmarks
```bash
cd ../loadgenerator && make bench  # Load generator benchmarks (external repo)
```

## Browser Automation Testing

When using Chrome browser automation for testing the dashboard:

1. **Window Size**: Resize to 1200x900 or larger for full page screenshots
2. **Screenshots**: Always capture full page to see all UI elements and metrics
3. **Before Tests**: Clear localStorage to avoid stale state issues
4. **After Actions**: Wait 2-3 seconds before taking screenshots to allow UI updates
