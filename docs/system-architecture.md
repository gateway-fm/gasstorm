# System Architecture

A high-level overview of the Sequencer PoC architecture, service boundaries, critical paths, and design patterns.

## Architecture Style

Modular monolith with capability-based execution layer abstraction. Services communicate via HTTP and WebSocket APIs, with no shared code between services.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Sequencer PoC                                      │
│  Preconfirmation sequencer proof-of-concept with sub-second block times      │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
                    ▼                 ▼                 ▼
           ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
           │  Block Builder │ │ Load Generator │ │   Dashboard    │
           │    (op-reth)   │ │  (Go + SQLite) │ │ (Next.js + TS) │
           └────────────────┘ └────────────────┘ └────────────────┘
                    │                 │                 │
                    ▼                 ▼                 ▼
           ┌────────────────┐ ┌────────────────┐
           │    op-reth     │ │  SQLite (data) │
           │  (L2 node)     │ │                │
           └────────────────┘ └────────────────┘
                    │
                    ▼
           ┌────────────────┐
           │    Anvil       │
           │   (L1 node)    │
           └────────────────┘
```

## Service Map

### block-builder

**Purpose**: External block building via Engine API for op-reth. Manages transaction pool, nonce tracking, and preconfirmations.

**Entry Points**:
- `main.go` - Service initialization, graceful shutdown
- `builder.go` - BlockBuilder struct, StartBlockProduction, queue management
- `internal/rpc/server.go` - HTTP RPC handlers (eth_sendRawTransaction, /status)

**Dependencies**:
- op-reth Engine API (port 18551, authenticated via JWT)
- L2 RPC (port 18546) for nonce lookups

**Key Files**:
| File | Purpose |
|------|---------|
| `internal/builder/builder.go` | Core block building logic via Engine API (FCU, GetPayload) |
| `internal/txpool/nonce_cache.go` | Unified nonce management with LRU eviction |
| `internal/txpool/filter.go` | Transaction filtering and ordering |
| `internal/preconf/hub.go` | WebSocket preconfirmation event broadcasting |
| `internal/engine/client.go` | Authenticated Engine API client with JWT caching |

### load-generator

**Purpose**: High-throughput load testing with multiple transaction types and patterns. Manages accounts, metrics, and verification.

**Entry Points**:
- `cmd/loadgen/main.go` - LoadGenerator orchestration, test lifecycle management

**Dependencies**:
- block-builder HTTP (port 13000) for eth_sendRawTransaction
- L2 RPC (port 18546) for block subscriptions and nonce lookups
- SQLite for test run persistence

**Key Files**:
| File | Purpose |
|------|---------|
| `internal/account/account.go` | Account with reservation pattern (ReserveNonce/Commit/Rollback) |
| `internal/account/manager.go` | Dynamic account generation, funding, initialization |
| `internal/execnode/capabilities.go` | Capability flags for different execution layers |
| `internal/execnode/registry.go` | Registry of built-in execution layers |
| `internal/rpc/client.go` | RPC client with nonce fetching |
| `internal/metrics/collector.go` | Latency and throughput tracking |
| `internal/storage/sqlite.go` | SQLite persistence for test runs |
| `internal/transport/http.go` | HTTP API handlers for load-gen REST API |

### dashboard

**Purpose**: Next.js UI for load test control, metrics visualization, and test history.

**Entry Points**:
- `app/load-test/page.tsx` - Main load test page with runner controls
- `app/load-test/history/page.tsx` - Test history detail view

**Dependencies**:
- load-generator API (port 13001) for test control and metrics
- block-builder /status endpoint (port 13000) for builder configuration
- block-builder preconf WebSocket (port 13002) for real-time events

**Key Files**:
| File | Purpose |
|------|---------|
| `src/stores/metrics-store.ts` | Zustand store for MGas/s, TPS, block metrics |
| `src/stores/go-load-test-store.ts` | Load generator integration store |
| `src/types/load-test.ts` | TypeScript type definitions (API contract) |

### zisk-prover

**Purpose**: Validity proof backend alternative to SP1. ZisK zkVM-based prover.

**Entry Points**:
- `cmd/ziskprover/main.go` - Prover service initialization

**Dependencies**: None (standalone)

### bridge-ui

**Purpose**: Hyperlane bridge interface for L1↔L2 transfers.

**Dependencies**: bridge-relayer service

## Critical Paths

### 1. Transaction Flow (reth mode with external block builder)

```
Load Generator                    Block Builder                   op-reth
     │                                  │                            │
     │ eth_sendRawTransaction ──────────>│                            │
     │   (HTTP:13000)                   │                            │
     │                                  │                            │
     │                                  │ Parse & validate TX         │
     │                                  │ → txQueue (100k buffer)     │
     │                                  │                            │
     │                                  │ NonceCache lookup           │
     │                                  │ → Filter: executable/future │
     │                                  │                            │
     │                                  │ Engine API FCU ────────────>│
     │                                  │ (forkchoiceUpdated:18551)   │
     │                                  │                            │
     │                                  │ Engine API GetPayload ─────>│
     │                                  │ (Build block)               │
     │                                  │                            │
     │                                  │ Emit preconf events ───────>│
     │                                  │ (WebSocket:13002)           │
     │                                  │                            │
     │<──────────────────────────────────│ NewHeads subscription       │
     │   (WebSocket:18547)               │                            │
     │                                  │                            │
```

### 2. Load Generator Test Lifecycle

```
StartTest
    │
    ├── Initialize accounts (generate/fund)
    ├── Deploy contracts (if needed)
    ├── Start workers
    ├── Send transactions via async sender
    ├── Track via preconf WS & L2 WS
    ├── Collect metrics
    │
StopTest
    │
    ├── Grace period (3s for late confirmations)
    ├── On-chain verification
    ├── Persist to SQLite
    │
Test Complete
```

### 3. Metrics Collection Path

```
Block Builder           Load Generator              Dashboard
    │                        │                           │
    │ block-metrics WS ──────>│                           │
    │                        │ Time series (200ms) ─────>│
    │                        │                           │
    │                        │ L2 newHeads WS ──────────>│
    │                        │                           │
    │                        │ Store → SQLite            │
    │                        │                           │
    │<────────────────────────────────────────────────────│
    │              API polling (metrics, history)         │
```

## Execution Layer Selection

The project supports multiple execution layer backends via a **capability-based architecture**. Select via `EXECUTION_LAYER` environment variable.

### Capability-Based Architecture

The load-generator uses capability checks instead of string comparisons:

```go
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

### reth Mode (Default)

Uses the custom block-builder with op-reth via Engine API. Supports preconfirmations.

```
load-generator → block-builder:13000 → op-reth Engine API:8551
```

### gravity-reth Mode

High-performance parallel EVM with Grevm. Direct sequencer mode.

```
load-generator → gravity-reth:8545 (direct sequencer)
```

### cdk-erigon Mode

Uses Polygon's cdk-erigon as a standalone sequencer. Block-builder is bypassed.

```
load-generator → cdk-erigon:8545 (direct sequencer)
```

### Adding a New Execution Layer

1. Add capability function in `loadgenerator:internal/execnode/registry.go`
2. Register in `DefaultRegistry()`
3. Create `docker-compose-new-node.yaml`
4. Add Makefile target (optional)

**No changes needed to:** load-generator logic, dashboard code, API handlers

## Prover Selection

The project supports two validity proof backends, selected via `PROVER` environment variable:

| Prover | Description | Profile |
|--------|-------------|---------|
| `sp1` (default) | OP Succinct with SP1 zkVM | `prover-sp1` |
| `zisk` | ZisK zkVM (Polygon) | `prover-zisk` |

| Aspect | SP1 (op-succinct) | ZisK |
|--------|-------------------|------|
| Architecture | RISC-V 32-bit | RISC-V 64-bit |
| Precompiles | keccak, sha256, secp256k1 | keccak, sha256 (no secp256k1) |
| Mode | Mock by default | Emulator by default |
| Port | 13337 | 13337 |

## Key Patterns

### Nonce Management

#### Block Builder: Unified NonceCache

Single unified nonce management system for all nonce tracking:

```go
type NonceCache struct {
    entries     map[common.Address]*nonceCacheEntry
    l2Client    *l2client.Client
    lruList     *list.List              // LRU eviction for memory bounds
    maxAccounts int
    maxCacheAge time.Duration           // Freshness tracking
    nonceGroup  singleflight.Group      // Coalesces concurrent RPC calls
}
```

**Features:**
- **LRU eviction**: Bounds memory by evicting least-recently-used entries
- **Freshness tracking**: `GetFresh()` forces RPC lookup if cache is stale
- **Singleflight**: Concurrent lookups for same address share one RPC call
- **SetIfHigher semantics**: Prevents stale writes from overwriting newer data

#### Load Generator: Reservation Pattern

High-throughput nonce management with atomic reservation:

```go
n := account.ReserveNonce()  // Increments immediately
defer n.Rollback()  // Auto-rollback on error
sender.SendAsync(ctx, txData, func(err error) {
    if err != nil { n.Rollback() } else { n.Commit() }
})
```

**Features:**
- **Local tracking**: Nonces tracked locally (not fetched per-TX) for speed
- **Reservation pattern**: ReserveNonce increments immediately, preventing gaps
- **Commit in callback**: Never commit before async send completes
- **Reactive sync**: Resync only on circuit breaker open (not periodic)

### Preconfirmation Flow

Events: `pending` → `preconfirmed` → `confirmed` | `dropped` | `requeued` | `revoked`

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Preconfirmation State Machine                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   [*] ──> Pending ──> Preconfirmed ──> Confirmed                       │
│     │         │             │                                            │
│     │         │             ├──> Dropped (block build failed)           │
│     │         │                                                        │
│     │         ├──> Dropped (nonce gap or timeout)                       │
│     │                                                                     │
│     └──> Revoked (preconfirmation revoked)                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Performance Optimizations

- **Buffer pooling**: Pre-allocated buffers reused per block
- **Lock-free seen hash tracker**: Epoch-based eviction (alternative to mutex-based ring buffer)
- **Async signature verification**: ECDSA recovery moved to worker pool
- **JWT caching**: Engine API tokens cached with 50s TTL
- **Pipelined block production**: Overlap mode in `pipeline.go` (reth only)
- **Rolling window metrics**: 5-second window for smooth MGas/s charts

## Known Bottlenecks

1. **Engine API SYNCING**: If op-reth falls behind, builder gets stuck (needs recovery)
2. **Nonce filtering**: Each block only includes sequential nonces per account (gaps cause drops)
3. **Engine API latency**: FCU + GetPayload take 100-500ms

## Service Ports

| Service | Port | Protocol | Description |
|---------|------|----------|-------------|
| block-builder | 13000 | HTTP | TX reception (eth_sendRawTransaction) |
| block-builder | 13002 | WebSocket | Preconfirmation events |
| load-generator | 13001 | HTTP | Load test API |
| dashboard | 18000 | HTTP | Web UI |
| op-reth | 18545 | HTTP | L2 RPC |
| op-reth | 18546 | WebSocket | L2 WebSocket |
| op-reth | 18551 | HTTP | Engine API (JWT auth) |
| l1-anvil | 18545 | HTTP | L1 RPC |

## Development Workflow

1. Make changes to Go code
2. Run `make test` to verify
3. Rebuild with `docker compose build`
4. Test with `make run` and dashboard
5. Check logs with `make logs`

## When to Modify What

| Task | File(s) to Change |
|------|-------------------|
| Change nonce caching/lookup | `block-builder/internal/txpool/nonce_cache.go` |
| Change nonce filtering logic | `block-builder/internal/txpool/filter.go` |
| Add new block production mode | `block-builder/builder.go` or new file in root |
| Change preconfirmation events | `block-builder/internal/preconf/hub.go` |
| Modify Engine API calls | `block-builder/internal/engine/client.go` |
| Add new execution layer | `loadgenerator:internal/execnode/registry.go` |
| Change load generator TX types | `loadgenerator:internal/txbuilder/builder.go` |
| Modify dashboard UI | `dashboard/src/app/load-test/page.tsx` |

## Glossary

| Term | Definition |
|------|------------|
| **Preconfirmation** | Promise that TX will be included (before actual block confirmation) |
| **Inflight nonce** | Nonce assigned to block being built, not yet confirmed by reth |
| **FCU** | forkchoiceUpdated - Engine API call to set chain head and request new payload |
| **GetPayload** | Engine API call to retrieve built block after FCU |
| **Deposit TX** | L1→L2 system transaction, must be first in every block |
| **RBF** | Replace-by-fee, requires 10% gas price bump to replace pending TX |
