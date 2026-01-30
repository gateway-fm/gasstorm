# Architecture

Deep dive into the sequencer PoC architecture.

## System Overview

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

## Nonce Management

### Ethereum Nonce Fundamentals

A **nonce** is a sequential counter per account starting at 0. Each outbound transaction increments it by 1.

**Nonce Rules:**
1. **Sequential**: Nonce N can't be mined until nonces 0 through N-1 are mined
2. **No gaps**: If you send nonce 5 before 4, nonce 5 waits in mempool
3. **No reuse**: Same nonce = replacement (RBF), requires higher gas price (10% bump)
4. **Immutable after mining**: Once mined, nonce is consumed forever

**Common Pitfalls:**
- **Stuck transactions**: Low-fee TX blocks all subsequent TXs from that account
- **Nonce gaps**: Dropped TX leaves gap, all higher nonces stuck until gap filled
- **Race conditions**: Two systems querying nonce can get different values
- **Cache staleness**: Using old nonce values causes rejection or gaps

### Block Builder NonceCache

The block builder uses a **single unified NonceCache** (`block-builder/internal/txpool/nonce_cache.go`) for all nonce tracking:

```go
type NonceCache struct {
    entries     map[common.Address]*nonceCacheEntry
    l2Client    *l2client.Client    // For RPC lookups
    lruList     *list.List          // LRU eviction for memory bounds
    maxAccounts int                 // Memory limit
    maxCacheAge time.Duration       // Freshness tracking
    nonceGroup  singleflight.Group  // Coalesces concurrent RPC calls
}
```

**Key Features:**
- **LRU eviction**: Bounds memory by evicting least-recently-used entries
- **Freshness tracking**: `GetFresh()` forces RPC lookup if cache is stale
- **Singleflight**: Concurrent lookups for same address share one RPC call
- **SetIfHigher semantics**: Prevents stale writes from overwriting newer data

### Load Generator Reservation Pattern

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

### Nonce Fetch Strategy

```go
// internal/rpc/client.go
func (c *Client) getNonce(address common.Address) (uint64, error) {
    // 1. Try pending nonce from block builder
    nonce, err := c.pendingNonceAt(context.Background(), address)
    if err != nil {
        // 2. Fall back to transaction count with pending
        return c.TransactionCount(context.Background(), address)
    }
    return nonce, nil
}
```

### Circuit Breaker Recovery

The circuit breaker opens when:
- **Failure rate > 5%**: Too many rejected transactions
- **Revocation rate > 20%**: Too many nonce rollbacks

On open:
```go
func (cb *CircuitBreaker) onOpen() {
    cb.rateLimiter.SetRate(10)  // Reduce to 10 TPS
    cb.resyncAllNonces()         // Fetch fresh nonces from chain
}
```

**Rollback Limitation:**
- Rollback only works for the most recent nonce
- Middle nonce failures create gaps recovered via circuit breaker resync

## Transaction Lifecycle

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

### Filter Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Pending    │────▶│  Filter     │────▶│  Executable │
│  TXs        │     │  (nonce)    │     │  (sorted)   │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                     ┌─────────────┐
                     │  Future TXs │
                     │  (re-queue) │
                     └─────────────┘
```

## Block Builder Pipeline

### Pipeline Modes

**Single Mode:**
- Builds one block at a time
- Waits for Engine API response before starting next
- Simpler, lower throughput

**Overlap Mode (Default):**
- Pipelined block production
- Builds block N+1 while block N is being committed
- Higher throughput, more complex recovery

### Engine API Flow

```
Block Builder                          op-reth
    │                                      │
    │──FCU (forkchoiceUpdated)────────────▶│
    │     Set head, start building          │
    │◀─────────────────────────────────────│
    │     SYNCING or OK                     │
    │                                      │
    │──GetPayload──────────────────────────▶│
    │     Retrieve built block              │
    │◀─────────────────────────────────────│
    │     Block                             │
    │                                      │
    │──NewPayload──────────────────────────▶│
    │     Validate and commit               │
    │◀─────────────────────────────────────│
    │     VALID                             │
```

## Preconfirmations

Preconfirmations are promises that a transaction will be included in a future block, issued before actual block confirmation.

### Flow

```
1. TX accepted into block-builder
2. Block production starts
3. Preconf event emitted: {txHash, blockNumber, timestamp}
4. WebSocket clients receive preconf
5. Block is built and committed
6. Final confirmation emitted
```

### WebSocket Event

```json
{
  "type": "preconfirmation",
  "data": {
    "txHash": "0x...",
    "blockNumber": 1234,
    "timestamp": 1700000000000,
    "gasUsed": 21000,
    "status": "promised"
  }
}
```

## Glossary

| Term | Definition |
|------|------------|
| **Preconfirmation** | Promise that TX will be included (before actual block confirmation) |
| **Inflight nonce** | Nonce assigned to block being built, not yet confirmed by reth |
| **FCU** | forkchoiceUpdated - Engine API call to set chain head and request new payload |
| **GetPayload** | Engine API call to retrieve built block after FCU |
| **Deposit TX** | L1→L2 system transaction, must be first in every block |
| **RBF** | Replace-by-fee, requires 10% gas price bump to replace pending TX |
| **Singleflight** | Go pattern that coalesces concurrent identical requests |
| **LRU** | Least Recently Used - cache eviction strategy |

## Performance Characteristics

### Tested Sustainable Throughput

- **100 TPS**: 99% success rate, ~235ms avg latency
- **200+ TPS**: Nonce batching becomes bottleneck
- **Block rate**: ~4 blocks/sec at 250ms block time

### Known Bottlenecks

1. **Engine API SYNCING** - If op-reth falls behind, builder gets stuck
2. **Nonce filtering** - Each block can only include sequential nonces per account
3. **Engine API latency** - FCU + GetPayload take 100-500ms

### Key Benchmarks

| Operation | Time |
|-----------|------|
| FilterExecutable (5000tx/500 senders) | 415µs |
| BuildBlock (empty) | 458µs |
| Engine API FCU roundtrip | 305µs |
| Preconf emit (1000tx batch) | 2.1µs |

## When to Modify What

| Task | File(s) to Change |
|------|-------------------|
| Change nonce caching/lookup | `block-builder/internal/txpool/nonce_cache.go` |
| Change nonce filtering logic | `block-builder/internal/txpool/filter.go` |
| Add new block production mode | `block-builder/builder.go` |
| Change preconfirmation events | `block-builder/internal/preconf/hub.go` |
| Modify Engine API calls | `block-builder/internal/engine/client.go` |
| Add transaction type | `load-generator/internal/txbuilder/` |
| Change load patterns | `load-generator/internal/pipeline/` |

See [Configuration](./configuration.md) for env vars and [Execution Layers](./execution-layers.md) for mode comparison.
