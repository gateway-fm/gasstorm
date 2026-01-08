# Flashblocks Analysis & Block Builder Comparison

**Date**: 2025-01-06
**Purpose**: Evaluate Base's Flashblocks approach and identify learnings for our OP Stack sequencer POC

---

## Executive Summary

Flashblocks is a preconfirmation system developed by Flashbots (co-designed with Uniswap Labs and OP Labs) that reduces perceived latency on Base from 2 seconds to ~200-500ms. Rather than changing block times, it streams "sub-blocks" (flashblocks) every 200ms within the standard 2-second block interval.

Our block builder already achieves 150ms block times - faster than Flashblocks' 200ms sub-blocks. However, there are architectural patterns worth adopting, particularly around preconfirmation streaming and progressive gas allocation.

---

## How Flashblocks Works

### Core Concept

| Metric | Standard Base | With Flashblocks |
|--------|---------------|------------------|
| Block time | 2 seconds | 2 seconds (unchanged) |
| Confirmation UX | ~2000ms | ~300-500ms |
| Sub-block interval | N/A | 200ms |
| Sub-blocks per block | N/A | 10 |

Ten flashblocks progressively accumulate over 2 seconds to form one complete block. Users see "confirmed (pre)" status quickly, while final state settlement still takes the full 2 seconds.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    BASE FLASHBLOCKS                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Base Sequencer                                            │
│        │                                                    │
│        ▼                                                    │
│   ┌─────────────┐                                           │
│   │ Rollup-Boost│  ← Flashbots sidecar                      │
│   │  (Builder)  │                                           │
│   └──────┬──────┘                                           │
│          │                                                  │
│          │ Stream flashblocks every 200ms                   │
│          ▼                                                  │
│   ┌─────────────┐                                           │
│   │  Base Reth  │  ← Flashblocks module enabled             │
│   │   Nodes     │                                           │
│   └─────────────┘                                           │
│          │                                                  │
│          │ WebSocket: newHeads + preconfirmations           │
│          ▼                                                  │
│   ┌─────────────┐                                           │
│   │   Clients   │  ← See "confirmed (pre)" in 200-500ms     │
│   └─────────────┘                                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Progressive Gas Allocation

Flashblocks uses increasing gas limits across the 10 sub-blocks:

| Flashblock # | Gas Limit | Cumulative |
|--------------|-----------|------------|
| 1 | 1.4M | 1.4M |
| 2 | ~3M | ~4.4M |
| ... | ... | ... |
| 10 | Full remainder | 30M (full block) |

**Rationale**: Small, time-sensitive transactions (transfers, simple swaps) can confirm in the first flashblock without waiting for large compute-heavy transactions.

### Transaction Ordering Guarantees

Once a flashblock is built and broadcast, its transaction ordering is **locked**:
- Later-arriving transactions with higher priority fees cannot jump ahead
- Creates a time-based FCFS guarantee within each 200ms window
- Reduces MEV extraction opportunities

### Failure Handling

- If Flashblocks system fails, chain falls back to standard 2-second blocks
- SLA target: 99.9% uptime
- Preconfirmed transactions can theoretically be dropped if sequencer crashes

---

## Our Block Builder: Current State

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    TRANSACTION INGESTION                    │
│  HTTP POST /eth_sendRawTransaction (Port 13000)             │
│  ├─ Pre-parse transaction in handler goroutine              │
│  ├─ Extract nonce, sender, hash                             │
│  └─ Queue into txQueue channel (100k buffer)                │
└────────────────┬────────────────────────────────────────────┘
                 │
         ┌───────▼──────────┐
         │  BLOCK BUILDER   │
         │   (Go Service)   │ ← Every 150ms
         └───────┬──────────┘
                 │
    ┌────────────┴────────────────┐
    │                             │
    ▼                             ▼
TRANSACTION              ENGINE API CALLS
PROCESSING             (JWT Authenticated)
├─ Non-blocking drain   ├─ forkchoiceUpdatedV2
├─ Per-sender grouping  ├─ getPayloadV2
├─ Nonce validation     └─ forkchoiceUpdatedV2 (async)
├─ L1 attributes inject
└─ Batch & trim to gas limit
                 │
                 ▼
    ┌────────────────────────────┐
    │   op-reth (L2 Execution)   │
    │  Port 18546: JSON-RPC      │
    │  Port 18547: WebSocket     │
    │  Port 18551: Engine API    │
    └────────────────────────────┘
```

### Current Configuration

| Parameter | Value |
|-----------|-------|
| Block interval | 150ms |
| Max transactions per block | 7,000 |
| Gas limit | 150M |
| Transaction queue buffer | 100k |
| Skip empty blocks | true |

### Existing Optimizations

1. **Pre-parsing in HTTP handlers** - CPU load distributed across goroutines
2. **Zero-copy buffer swaps** - Double-buffering for pending transactions
3. **Cached values** - JWT tokens, gas limits, signers
4. **Connection pooling** - 500 max idle, 200 per-host
5. **Batch RPC calls** - Single call to fetch nonces for unknown accounts
6. **Memory pooling** - sync.Pool for sender batches
7. **Lock-free timestamps** - Atomic CAS for monotonic block times
8. **Async finalization** - Final FCU doesn't block next block

---

## Comparison Matrix

| Aspect | Our Block Builder | Flashblocks |
|--------|-------------------|-------------|
| **Block interval** | 150ms (full blocks) | 200ms (sub-blocks within 2s blocks) |
| **Confirmation model** | Final on block build | Preconfirmations (soft: 200ms, final: 2s) |
| **Gas allocation** | Full limit per block | Progressive (1.4M → full) |
| **Tx ordering** | FCFS with nonce validation | Time-locked per flashblock slice |
| **Architecture** | Standalone Go builder | Sidecar (Rollup-Boost) |
| **WebSocket streaming** | newHeads only | newHeads + preconfirmations |
| **Throughput target** | 5k+ TPS | Not specified |
| **Queue buffer** | 100k transactions | Not specified |

---

## Learnings & Recommendations

### 1. Preconfirmation Streaming

**What Flashblocks does**: Streams transaction status updates via WebSocket every 200ms, allowing UIs to show "confirmed (pre)" before final block settlement.

**Our gap**: We have WebSocket for `newHeads` but not for in-flight transaction confirmations.

**Recommendation**: Add a preconfirmation WebSocket endpoint:

```go
// Proposed endpoint: ws://host/ws/preconfirmations
type PreconfirmationEvent struct {
    TxHash      string `json:"txHash"`
    Status      string `json:"status"` // "pending" | "preconfirmed" | "confirmed"
    BlockNumber uint64 `json:"blockNumber,omitempty"`
    Position    int    `json:"position,omitempty"`
    Timestamp   int64  `json:"timestamp"`
}
```

**Implementation approach**:
1. Emit "pending" when tx enters queue
2. Emit "preconfirmed" when tx selected for current block build
3. Emit "confirmed" when block finalized via Engine API

### 2. Progressive Gas Allocation

**What Flashblocks does**: Allocates smaller gas limits to early flashblocks, allowing small transactions to confirm faster.

**Our opportunity**: Implement a "fast lane" for low-gas transactions:

```go
type GasTier struct {
    MaxGas      uint64
    MaxTxs      int
    BuildDelay  time.Duration // How long to wait before including in block
}

var GasTiers = []GasTier{
    {MaxGas: 50_000, MaxTxs: 100, BuildDelay: 0},           // Transfers: immediate
    {MaxGas: 100_000, MaxTxs: 200, BuildDelay: 25*time.Millisecond}, // Simple ERC20
    {MaxGas: 500_000, MaxTxs: 500, BuildDelay: 50*time.Millisecond}, // Swaps
    {MaxGas: math.MaxUint64, MaxTxs: 7000, BuildDelay: 75*time.Millisecond}, // All others
}
```

**Benefit**: Time-sensitive low-gas transactions don't wait behind compute-heavy operations.

### 3. Ordering Guarantees as a Feature

**What Flashblocks does**: Explicitly markets time-locked ordering as an MEV protection feature.

**Our opportunity**: We already have FCFS within 150ms windows. This should be documented and exposed as a sequencer guarantee:

> "Transactions are ordered by arrival time within each 150ms block window.
> Later-arriving transactions cannot front-run earlier ones regardless of gas price."

### 4. Failure Mode Handling

**What Flashblocks does**: Falls back to 2-second blocks if flashblocks system fails.

**Our consideration**: Document failure modes and ensure graceful degradation:
- What happens if Engine API calls fail?
- How do we handle op-reth restarts?
- Is there a fallback path?

---

## Implementation Priority

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| **High** | Preconfirmation WebSocket | Medium | High UX improvement |
| **Medium** | Progressive gas tiers | Medium | Better latency for simple txs |
| **Low** | Document ordering guarantees | Low | Marketing/positioning |
| **Low** | Failure mode documentation | Low | Operational clarity |

---

## Technical Spike: Preconfirmation WebSocket

### Proposed Changes

**1. Add WebSocket hub to block builder**

```go
type PreconfHub struct {
    clients    map[*websocket.Conn]bool
    broadcast  chan PreconfirmationEvent
    register   chan *websocket.Conn
    unregister chan *websocket.Conn
    mu         sync.RWMutex
}
```

**2. Emit events at key points**

```go
// In HTTP handler after tx queued
hub.broadcast <- PreconfirmationEvent{
    TxHash: tx.Hash().Hex(),
    Status: "pending",
    Timestamp: time.Now().UnixMilli(),
}

// In BuildBlock after tx selected
hub.broadcast <- PreconfirmationEvent{
    TxHash: tx.Hash().Hex(),
    Status: "preconfirmed",
    BlockNumber: blockNum,
    Position: i,
    Timestamp: time.Now().UnixMilli(),
}

// After successful Engine API response
for _, tx := range includedTxs {
    hub.broadcast <- PreconfirmationEvent{
        TxHash: tx.Hash().Hex(),
        Status: "confirmed",
        BlockNumber: blockNum,
        Timestamp: time.Now().UnixMilli(),
    }
}
```

**3. Dashboard integration**

Update `use-websocket.ts` to subscribe to preconfirmations:

```typescript
const ws = new WebSocket(`ws://${host}/ws/preconfirmations`);
ws.onmessage = (event) => {
    const preconf = JSON.parse(event.data);
    updateTransactionStatus(preconf.txHash, preconf.status);
};
```

---

## References

- [Chainstack: Flashblocks on Base](https://docs.chainstack.com/docs/flashblocks-on-base)
- [Base Blog: Flashblocks Deep Dive](https://blog.base.dev/flashblocks-deep-dive)
- [Base Blog: Accelerating Base with Flashblocks](https://blog.base.dev/accelerating-base-with-flashblocks)
- [QuickNode: How to Use Flashblocks](https://www.quicknode.com/guides/base/flashblocks-in-your-app)
- [Preconfirmations, Flashblocks, Shreds](https://gogol.substack.com/p/preconfirmations-flashblocks-shreds)
- [The Block: Base activates Flashblocks](https://www.theblock.co/post/363109/coinbase-base-flashblocks)

---

## Appendix: Block Builder File Locations

| Component | Path |
|-----------|------|
| Block Builder Core | `block-builder/main.go` |
| Load Generator | `load-generator/main.go` |
| Dashboard WebSocket Hook | `dashboard/src/hooks/use-websocket.ts` |
| Transaction Builder | `dashboard/src/lib/transaction-builder.ts` |
| Docker Compose | `docker-compose.yml` |
