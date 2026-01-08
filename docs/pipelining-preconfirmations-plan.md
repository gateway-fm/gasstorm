# Implementation Plan: Pipelining & Preconfirmations

**Date**: 2026-01-07
**Status**: Draft
**Scope**: Block-builder enhancements for improved throughput and UX

---

## Overview

This plan details two complementary features to enhance block production:

1. **Pipelining** - Overlap block production phases to reduce effective block time
2. **Preconfirmations** - Stream transaction status updates for faster UX feedback

Both features are enabled via environment variable flags, allowing gradual rollout and A/B testing.

---

## Feature 1: Pipelining

### Problem Statement

Current block production is sequential:

```
Block N:  [Collect] → [Filter] → [FCU+Attrs] → [GetPayload] → [FCU Finalize]
                                                                    │
Block N+1:                                                          └→ [Collect] → ...
```

Each phase waits for the previous to complete. The 3 Engine API calls add ~30-50ms of latency that could be overlapped with transaction collection.

### Solution: Overlapped Block Production

Pipeline block production so that transaction collection for block N+1 happens concurrently with block N's Engine API finalization:

```
Block N:    [Collect] → [Filter] → [FCU+Attrs] → [GetPayload] ─────────────────→
Block N+1:                                  └─── [Collect] → [Filter] → [FCU+Attrs] → ...
                                            ↑
                                      Overlap starts here
```

### Design

#### New Configuration Flags

```go
// Environment variables
ENABLE_PIPELINING     bool   // Enable pipelined block production (default: false)
PIPELINE_OVERLAP_MS   int    // How early to start next block's collection (default: 50)
```

#### New Data Structures

```go
// PipelineStage represents a block in progress
type PipelineStage struct {
    BlockNumber     uint64
    Transactions    []*PendingTx
    ExecutableTxs   []executableTx
    PayloadID       *hexutil.Bytes
    ParentHash      common.Hash
    Timestamp       uint64
    Stage           PipelineState  // collecting, filtering, building, finalizing
    StartedAt       time.Time
}

type PipelineState int
const (
    StageCollecting PipelineState = iota
    StageFiltering
    StageBuilding      // FCU + GetPayload
    StageFinalizing    // Async FCU
    StageComplete
)

// PipelineManager coordinates overlapped block production
type PipelineManager struct {
    current   *PipelineStage    // Block currently being finalized
    next      *PipelineStage    // Block being prepared (collecting/filtering)
    mu        sync.Mutex
    builder   *BlockBuilder
    overlapMs int
}
```

#### Core Algorithm

```go
func (pm *PipelineManager) Run(ctx context.Context) {
    ticker := time.NewTicker(pm.builder.config.BlockTimeMS)
    defer ticker.Stop()

    for {
        select {
        case <-ctx.Done():
            return
        case <-ticker.C:
            pm.advancePipeline(ctx)
        }
    }
}

func (pm *PipelineManager) advancePipeline(ctx context.Context) {
    pm.mu.Lock()
    defer pm.mu.Unlock()

    // Step 1: If current block is still building, wait
    if pm.current != nil && pm.current.Stage < StageComplete {
        // Current block not done yet - don't advance
        // This is the backpressure mechanism
        return
    }

    // Step 2: Promote next → current if ready
    if pm.next != nil && pm.next.Stage == StageFiltering {
        pm.current = pm.next
        pm.next = nil

        // Start building current block (async)
        go pm.buildAndFinalize(ctx, pm.current)
    }

    // Step 3: Start collecting for next block
    if pm.next == nil {
        pm.next = &PipelineStage{
            Stage:     StageCollecting,
            StartedAt: time.Now(),
        }
        go pm.collectAndFilter(ctx, pm.next)
    }
}
```

#### Integration Points

**block-builder/main.go modifications:**

1. **Line 67-117** - Add `PipelineManager` field to `BlockBuilder` struct
2. **Line 1311-1380** - Replace `StartBlockProduction()` with `StartPipelinedProduction()` when flag enabled
3. **Line 1088-1308** - Split `BuildBlock()` into discrete pipeline stages:
   - `CollectTransactions()` - Drain txQueue into stage
   - `FilterTransactions()` - Nonce validation, executable selection
   - `BuildPayload()` - FCU + GetPayload calls
   - `FinalizeBlock()` - Async FCU + nonce commit

### Implementation Steps

| Step | Description | Files | Effort |
|------|-------------|-------|--------|
| 1.1 | Add `ENABLE_PIPELINING` flag to config | `main.go:38-48` | S |
| 1.2 | Define `PipelineStage` and `PipelineManager` structs | `main.go` (new section) | M |
| 1.3 | Refactor `BuildBlock()` into discrete stages | `main.go:1088-1308` | L |
| 1.4 | Implement `PipelineManager.Run()` loop | `main.go` (new) | M |
| 1.5 | Add backpressure handling (slow block delays next) | `main.go` (new) | S |
| 1.6 | Add pipeline metrics (`pipelineDepth`, `overlapMs`) | `main.go:88-95` | S |
| 1.7 | Update `/status` endpoint with pipeline stats | `main.go` (status handler) | S |
| 1.8 | Add load test comparing pipelined vs sequential | `load-generator/` | M |

### Expected Performance Improvement

| Metric | Current | With Pipelining | Improvement |
|--------|---------|-----------------|-------------|
| Effective block time | 150ms | ~120ms | 20% |
| Engine API wait time | Blocking | Overlapped | ~30ms saved |
| Transaction collection | Sequential | Parallel | Continuous |

### Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Race condition on parent hash | Pipeline stage tracks its own parent; validated before FCU |
| Memory pressure from double-buffering | Already using double-buffer; pipeline adds one more stage |
| Backpressure cascade | Pipeline manager enforces max depth of 2 (current + next) |
| Nonce tracking complexity | Nonces committed only on StageComplete; requeued on failure |

---

## Feature 2: Preconfirmations

### Problem Statement

Clients currently have no visibility into transaction status between submission and block confirmation. With 150ms blocks, this is less critical than Base's 2-second blocks, but still valuable for:

1. **UI feedback** - Show "pending" → "preconfirmed" → "confirmed" progression
2. **MEV protection signaling** - Indicate when ordering is locked
3. **Debugging** - Track exactly where transactions are in the pipeline

### Solution: WebSocket Preconfirmation Stream

Add a WebSocket endpoint that streams transaction lifecycle events:

```
Client submits tx → "pending"
Tx selected for block → "preconfirmed" (ordering locked)
Block finalized → "confirmed"
```

### Design

#### New Configuration Flags

```go
// Environment variables
ENABLE_PRECONFIRMATIONS  bool   // Enable preconfirmation WebSocket (default: false)
PRECONF_LISTEN_ADDR      string // WebSocket bind address (default: :3001)
PRECONF_BUFFER_SIZE      int    // Event buffer per client (default: 1000)
```

#### Event Types

```go
type PreconfirmationEvent struct {
    TxHash      string          `json:"txHash"`
    Status      PreconfStatus   `json:"status"`
    BlockNumber uint64          `json:"blockNumber,omitempty"`
    Position    int             `json:"position,omitempty"`
    Timestamp   int64           `json:"timestamp"` // Unix millis
    Metadata    *PreconfMeta    `json:"metadata,omitempty"`
}

type PreconfStatus string
const (
    StatusPending      PreconfStatus = "pending"      // In queue
    StatusPreconfirmed PreconfStatus = "preconfirmed" // Selected for current block
    StatusConfirmed    PreconfStatus = "confirmed"    // Block finalized
    StatusDropped      PreconfStatus = "dropped"      // Nonce too low
    StatusRequeued     PreconfStatus = "requeued"     // Future nonce, will retry
)

type PreconfMeta struct {
    GasUsed       uint64 `json:"gasUsed,omitempty"`
    EffectiveGas  uint64 `json:"effectiveGas,omitempty"`
    QueuePosition int    `json:"queuePosition,omitempty"`
    QueueDepth    int    `json:"queueDepth,omitempty"`
}
```

#### WebSocket Hub Architecture

```go
// PreconfHub manages WebSocket connections and broadcasts
type PreconfHub struct {
    clients    map[*websocket.Conn]*ClientState
    broadcast  chan PreconfirmationEvent
    register   chan *websocket.Conn
    unregister chan *websocket.Conn
    mu         sync.RWMutex

    // Subscription filters
    subscriptions map[common.Hash][]*websocket.Conn // txHash → interested clients
}

type ClientState struct {
    Conn         *websocket.Conn
    Subscribed   map[common.Hash]bool  // Specific tx subscriptions
    SubscribeAll bool                   // Receive all events
    Buffer       chan PreconfirmationEvent
}

func (h *PreconfHub) Run() {
    for {
        select {
        case client := <-h.register:
            h.addClient(client)
        case client := <-h.unregister:
            h.removeClient(client)
        case event := <-h.broadcast:
            h.broadcastEvent(event)
        }
    }
}
```

#### Integration Points

**Emission Points in block-builder/main.go:**

1. **Line 1382-1412** (`QueueTransaction`) - Emit `pending` when tx enters queue
2. **Line 1102-1116** (`filterExecutable`) - Emit `dropped` or `requeued` for invalid nonces
3. **Line 1118-1196** (after tx selection) - Emit `preconfirmed` for selected txs
4. **Line 1265-1280** (after successful FCU) - Emit `confirmed` for included txs

```go
// Example integration in QueueTransaction
func (bb *BlockBuilder) QueueTransaction(ctx context.Context, txRLP []byte) (common.Hash, error) {
    // ... existing parsing logic ...

    // Emit preconfirmation event
    if bb.preconfHub != nil {
        bb.preconfHub.broadcast <- PreconfirmationEvent{
            TxHash:    pendingTx.Hash.Hex(),
            Status:    StatusPending,
            Timestamp: time.Now().UnixMilli(),
            Metadata: &PreconfMeta{
                QueuePosition: len(bb.pendingTxs),
                QueueDepth:    len(bb.txQueue),
            },
        }
    }

    bb.txQueue <- pendingTx
    return pendingTx.Hash, nil
}
```

#### Client Protocol

**Connection:**
```
ws://host:3001/ws/preconfirmations
```

**Subscription Messages (client → server):**
```json
// Subscribe to specific transaction
{"type": "subscribe", "txHash": "0x..."}

// Subscribe to all transactions
{"type": "subscribe_all"}

// Unsubscribe
{"type": "unsubscribe", "txHash": "0x..."}
```

**Event Messages (server → client):**
```json
{
    "txHash": "0xabc...",
    "status": "preconfirmed",
    "blockNumber": 12345,
    "position": 42,
    "timestamp": 1704672000000,
    "metadata": {
        "queuePosition": 42,
        "queueDepth": 1500
    }
}
```

### Implementation Steps

| Step | Description | Files | Effort |
|------|-------------|-------|--------|
| 2.1 | Add `ENABLE_PRECONFIRMATIONS` flag | `main.go:38-48` | S |
| 2.2 | Add gorilla/websocket dependency | `go.mod` | S |
| 2.3 | Implement `PreconfHub` struct | `main.go` or `preconf.go` (new) | M |
| 2.4 | Add WebSocket endpoint `/ws/preconfirmations` | `main.go` (HTTP section) | M |
| 2.5 | Emit `pending` in `QueueTransaction` | `main.go:1382-1412` | S |
| 2.6 | Emit `dropped`/`requeued` in `filterExecutable` | `main.go:1102-1116` | S |
| 2.7 | Emit `preconfirmed` after tx selection | `main.go:~1196` | S |
| 2.8 | Emit `confirmed` after successful block | `main.go:~1280` | S |
| 2.9 | Add preconf metrics (events/sec, clients) | `main.go:88-95` | S |
| 2.10 | Dashboard integration | `dashboard/src/hooks/use-websocket.ts` | M |
| 2.11 | Add e2e test for preconf flow | `load-generator/` or new test | M |

### Dashboard Integration

**dashboard/src/hooks/use-websocket.ts additions:**

```typescript
interface PreconfirmationEvent {
    txHash: string;
    status: 'pending' | 'preconfirmed' | 'confirmed' | 'dropped' | 'requeued';
    blockNumber?: number;
    position?: number;
    timestamp: number;
    metadata?: {
        queuePosition?: number;
        queueDepth?: number;
    };
}

export function usePreconfirmations(txHashes?: string[]) {
    const [events, setEvents] = useState<Map<string, PreconfirmationEvent>>();

    useEffect(() => {
        const ws = new WebSocket(`ws://${BLOCK_BUILDER_HOST}/ws/preconfirmations`);

        ws.onopen = () => {
            if (txHashes) {
                txHashes.forEach(hash =>
                    ws.send(JSON.stringify({ type: 'subscribe', txHash: hash }))
                );
            } else {
                ws.send(JSON.stringify({ type: 'subscribe_all' }));
            }
        };

        ws.onmessage = (event) => {
            const preconf: PreconfirmationEvent = JSON.parse(event.data);
            setEvents(prev => new Map(prev).set(preconf.txHash, preconf));
        };

        return () => ws.close();
    }, [txHashes]);

    return events;
}
```

### Visual Status Progression

```
┌─────────────────────────────────────────────────────────────┐
│  Transaction: 0xabc123...                                   │
│                                                             │
│  ○ ──────── ◐ ──────── ● ──────── ✓                        │
│  Submitted   Pending   Preconfirmed   Confirmed             │
│  (client)    (queued)  (selected)     (finalized)           │
│                                                             │
│  Timeline:                                                  │
│  ├─ 0ms: Submitted to RPC                                   │
│  ├─ 5ms: Pending (queue position: 42/1500)                  │
│  ├─ 75ms: Preconfirmed (block 12345, position 42)           │
│  └─ 150ms: Confirmed                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Feature 3 (Bonus): Progressive Gas Tiers

Based on Flashblocks research, an optional enhancement for differentiating confirmation latency by gas usage.

### Configuration

```go
ENABLE_GAS_TIERS  bool  // Enable progressive gas allocation (default: false)
```

### Design

```go
type GasTier struct {
    MaxGas     uint64
    MaxTxs     int
    Priority   int  // Lower = faster confirmation
}

var DefaultGasTiers = []GasTier{
    {MaxGas: 50_000, MaxTxs: 100, Priority: 0},      // ETH transfers: immediate
    {MaxGas: 100_000, MaxTxs: 200, Priority: 1},     // Simple ERC20: +25ms
    {MaxGas: 500_000, MaxTxs: 500, Priority: 2},     // Swaps: +50ms
    {MaxGas: math.MaxUint64, MaxTxs: 7000, Priority: 3}, // All else: +75ms
}
```

Lower-gas transactions would be prioritized in block building, allowing simple transfers to confirm before compute-heavy operations. This is a future enhancement beyond the core pipelining and preconfirmations work.

---

## Testing Strategy

### Unit Tests

| Test | Description |
|------|-------------|
| `TestPipelineStageTransitions` | Verify stage progression (collecting → filtering → building → complete) |
| `TestPipelineBackpressure` | Slow block should delay next block, not drop |
| `TestPreconfEventEmission` | Each stage emits correct event |
| `TestPreconfWebSocketBroadcast` | Connected clients receive events |
| `TestPreconfSubscriptionFilter` | Client only receives subscribed tx events |

### Integration Tests

| Test | Description |
|------|-------------|
| `TestPipelinedBlockProduction` | End-to-end block production with pipelining |
| `TestPreconfFullLifecycle` | Submit tx → pending → preconfirmed → confirmed |
| `TestPipelineWithPreconf` | Both features enabled simultaneously |

### Load Tests

```bash
# Compare sequential vs pipelined
./load-generator --mode ramp --duration 60s --target-tps 5000 | tee baseline.log
ENABLE_PIPELINING=true ./block-builder &
./load-generator --mode ramp --duration 60s --target-tps 5000 | tee pipelined.log

# Measure preconfirmation latency
ENABLE_PRECONFIRMATIONS=true ./block-builder &
./load-generator --mode constant --tps 1000 --measure-preconf
```

---

## Rollout Plan

### Phase 1: Development (Week 1-2)
- Implement pipelining with flag disabled by default
- Implement preconfirmations with flag disabled by default
- Unit and integration tests passing

### Phase 2: Testing (Week 2-3)
- Load testing on testnet
- Compare metrics: block time, TPS, latency percentiles
- Dashboard integration for preconf visualization

### Phase 3: Staged Rollout
1. Enable preconfirmations only (low risk, read-only)
2. Monitor for 24h
3. Enable pipelining on 10% of traffic
4. Monitor for 24h
5. Full rollout if metrics stable

---

## Configuration Summary

All configuration is via environment variables, with Makefile profiles for common setups.

### Core Settings

| Environment Variable | Type | Default | Description |
|---------------------|------|---------|-------------|
| `GAS_LIMIT` | uint64 | `1000000000` | Block gas limit (1 gigagas) |
| `MAX_TXS_PER_BLOCK` | int | `50000` | Max transactions per block |
| `BLOCK_TIME_MS` | int | `150` | Block production interval |
| `SKIP_EMPTY_BLOCKS` | bool | `true` | Skip blocks with no transactions |

### Experimental Features

| Environment Variable | Type | Default | Description |
|---------------------|------|---------|-------------|
| `ENABLE_PIPELINING` | bool | `false` | Enable overlapped block production |
| `PIPELINE_OVERLAP_MS` | int | `50` | How early to start next block collection |
| `ENABLE_PRECONFIRMATIONS` | bool | `false` | Enable preconfirmation WebSocket |
| `PRECONF_LISTEN_ADDR` | string | `:3001` | WebSocket bind address |
| `PRECONF_BUFFER_SIZE` | int | `1000` | Event buffer per client |
| `ENABLE_GAS_TIERS` | bool | `false` | Enable progressive gas allocation |

### Makefile Profiles

```bash
make run                  # Default: 1 gigagas, 150ms blocks
make run-high-throughput  # 1B gas, 100ms, pipelining enabled
make run-fast-confirm     # 150M gas, 50ms blocks
make run-experimental     # All features enabled
make run-conservative     # 30M gas, 2s blocks (stability testing)
make run-flashblocks      # 500M gas, 500ms + preconfirmations

# Custom configuration
GAS_LIMIT=2000000000 BLOCK_TIME_MS=200 make run
```

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Pipelined block time | ≤120ms (20% improvement) |
| Preconf "pending" latency | <10ms from submission |
| Preconf "confirmed" accuracy | 100% (no false positives) |
| WebSocket connections | Support 100+ concurrent clients |
| Memory overhead | <10% increase from baseline |

---

## File Change Summary

| File | Changes |
|------|---------|
| `block-builder/main.go` | Pipeline manager, preconf hub, event emission |
| `block-builder/go.mod` | Add gorilla/websocket |
| `block-builder/preconf.go` | (New) Preconfirmation types and hub |
| `block-builder/pipeline.go` | (New) Pipeline manager logic |
| `dashboard/src/hooks/use-websocket.ts` | Preconf subscription hook |
| `dashboard/src/components/...` | UI for preconf status |
| `load-generator/main.go` | Preconf latency measurement |
| `docs/pipelining-preconfirmations-plan.md` | This document |

---

## Appendix: Current Block Production Flow

For reference, the current sequential flow in `main.go:1088-1308`:

```
BuildBlock()
├── collectPendingTransactions()     // Drain txQueue
├── takePendingTransactions()        // Double-buffer swap
├── filterExecutable()               // Nonce validation + batch RPC
├── Create L1 Attributes deposit tx
├── Build PayloadAttributes
├── engine_forkchoiceUpdatedV2 (with attrs)  ← Blocking
├── engine_getPayloadV2                       ← Blocking
├── Update lastBuiltBlock
├── engine_forkchoiceUpdatedV2 (async)        ← Non-blocking
├── commitNonces()
└── requeueOverflow()
```

The pipelining enhancement overlaps steps 1-3 of block N+1 with steps 5-8 of block N.
