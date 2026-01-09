# Ethereum Nonce Deep Dive

## Fundamentals

**Nonce** = A sequential counter per account starting at **0**. It represents the total number of transactions sent from that address.

**Key Rules:**
1. **Sequential**: Transaction with nonce N can't execute until nonces 0 through N-1 are all mined
2. **No gaps**: If you send nonce 5 before nonce 4, nonce 5 waits in mempool (queued, not pending)
3. **No reuse**: Same nonce = replacement (RBF), requires 10%+ higher gas price
4. **Immutable after mining**: Once a nonce is mined, it's consumed forever

## Nonce Terminology

| Term | Meaning | RPC Call |
|------|---------|----------|
| **Confirmed nonce** | Next nonce based on mined blocks only | `eth_getTransactionCount(addr, "latest")` |
| **Pending nonce** | Next nonce accounting for mempool txs | `eth_getTransactionCount(addr, "pending")` |
| **Expected nonce** | The nonce our system expects to see next | Internal tracking |

**Example:**
- Account has mined txs with nonces 0, 1, 2
- Mempool has pending txs with nonces 3, 4
- `eth_getTransactionCount("latest")` = **3** (next after last mined)
- `eth_getTransactionCount("pending")` = **5** (next after last pending)

## What Happens When Transactions Fail?

### Case 1: Transaction REVERTS during execution (included in block, but execution fails)

**Result:** Nonce IS consumed

When a transaction is included in a block but reverts:
- ✅ Transaction is recorded on-chain (with `status: 0` / failed)
- ✅ **Nonce is permanently consumed**
- ✅ Gas fees are lost (gas used up to revert point)
- ❌ State changes are rolled back

This is because the transaction WAS included - it just failed during execution.

**Sources:**
- [Etherscan: Reasons for Failed Transactions](https://info.etherscan.com/reason-for-failed-transaction/)
- [Alchemy: Ethereum Transactions States](https://www.alchemy.com/docs/ethereum-transactions-pending-mined-dropped-replaced)

### Case 2: Transaction is DROPPED from mempool (never mined)

**Result:** Nonce stays available

When a transaction never makes it on-chain:
- The nonce can be reused
- No gas is spent
- Common reasons: low gas price, timeout, replaced by RBF

### Case 3: Transaction REJECTED by block builder/sequencer (never proposed to chain)

**Result:** Nonce stays available

If the block builder decides not to include a transaction (validation failure, nonce mismatch, etc.):
- Transaction never hits the chain
- Nonce remains available for retry

## Block Builder Nonce Tracking

### The Core Challenge

Our block builder must track:
1. **Chain state** (confirmed nonces from reth)
2. **Pending state** (txs we've proposed but not yet confirmed)
3. **Inflight state** (txs in current block being built)

### Scenario Analysis

**Setup:** Account sends 3 txs with nonces 0, 1, 2

```
Time 0: Account state
  - Chain nonce: 0 (no txs ever mined)
  - Pending in our pool: [tx0, tx1, tx2]
  - Expected next nonce: 3 (if all pending execute)
```

**Block 1 Production:**
```
Block 1 proposed: [tx0]
Block 1 confirmed: [tx0] included successfully

Result:
  - Chain nonce: 1 (eth_getTransactionCount = 1)
  - Pending in our pool: [tx1, tx2]
  - Expected next nonce: 3
```

**Block 2 Production (success case):**
```
Block 2 proposed: [tx1, tx2]
Block 2 confirmed: both included

Result:
  - Chain nonce: 3
  - Pending in our pool: []
  - Expected next nonce: 3
```

**Block 2 Production (rejection case):**
```
Block 2 proposed: [tx1, tx2]
Block 2 result: tx1 REJECTED (e.g., insufficient balance, execution error)

What happens:
  - tx1 was not included → nonce 1 NOT consumed
  - tx2 CANNOT be included (depends on nonce 1 executing first)
  - Chain nonce: still 1
  - Pending in our pool: [tx1, tx2] (both need retry)
  - Expected next nonce: 1 (reset to match chain!)
```

### The Critical Insight

**When a transaction is rejected during block building (NOT included on-chain), ALL subsequent transactions from that sender in the same block are also invalid.**

This is because Ethereum enforces strict nonce ordering. If nonce N fails, nonce N+1 cannot execute regardless of whether it was technically valid.

### Two Types of "Rejection"

| Type | On-chain? | Nonce consumed? | Subsequent txs? |
|------|-----------|-----------------|-----------------|
| **Execution revert** (included but failed) | Yes | **Yes** | Can proceed (nonce was used) |
| **Validation rejection** (not included) | No | **No** | Must wait (nonce gap) |

**Execution revert example:** Contract require() fails → tx is ON chain with failed status, nonce IS consumed

**Validation rejection example:** Insufficient balance for gas → tx never hits chain, nonce available

## Our Implementation Requirements

### 1. Track Inflight vs Confirmed Separately

```
NonceCache needs:
- chainNonce[addr]: last confirmed from reth (source of truth)
- inflightNonce[addr]: highest nonce in current pending block
- expectedNonce[addr]: chainNonce + pending tx count
```

### 2. Handle Block Confirmation Properly

When Engine API confirms a block:
```go
for each tx in confirmedBlock:
    if tx.status == success OR tx.status == reverted:
        // Both cases: nonce was consumed
        chainNonce[tx.from] = tx.nonce + 1

// Key: reverted txs still consume nonces!
```

### 3. Handle Block Rejection Properly

When Engine API rejects a block (SYNCING, invalid, etc.):
```go
// Reset inflight state - nothing was committed
inflightNonce = copy(chainNonce)

// Re-queue all proposed transactions
for each tx in rejectedBlock:
    requeue(tx)
```

### 4. Handle Partial Block Success

If block builder simulates and some txs fail validation:
```go
for each sender in block:
    validTxs = filter(txs, tx => tx.nonce >= chainNonce[sender])
    // Sort by nonce ascending
    sort(validTxs, by: nonce)

    for tx in validTxs:
        if tx.nonce != expectedNonce[sender]:
            // Gap detected - can't include this or any subsequent
            requeueRemaining(sender, from: tx)
            break
        expectedNonce[sender]++
        include(tx)
```

## Mempool States (Geth terminology)

| State | Description | Can be mined? |
|-------|-------------|---------------|
| **Pending** | Ready to execute, nonce is next expected | Yes |
| **Queued** | Future nonce (gap exists) | No, waiting for gap fill |
| **Dropped** | Evicted from mempool | No |

**Sources:**
- [Geth txpool namespace docs](https://geth.ethereum.org/docs/interacting-with-geth/rpc/ns-txpool)
- [QuickNode: Pending vs Queued](https://www.quicknode.com/guides/ethereum-development/transactions/pending-and-queued-transactions-explained)

## Common Pitfalls

1. **Using stale pending nonce**: If RPC returns old pending count, you'll create gaps
2. **Not handling reverts**: Reverted txs consume nonces - don't re-send with same nonce
3. **Race conditions**: Two systems querying nonce simultaneously can get same value
4. **Mempool eviction**: Low-fee txs can be evicted, creating gaps you didn't expect

## eth_getTransactionCount Gotchas

The "pending" tag behavior varies by client:

| Client | "pending" behavior |
|--------|-------------------|
| Geth | Includes local mempool txs |
| Some L2s | May not have pending state |
| Our builder | Custom `eth_getPendingNonce` endpoint |

**Best practice:** For high-throughput systems, track nonces locally rather than querying per-tx.

**Sources:**
- [go-ethereum issue #2880](https://github.com/ethereum/go-ethereum/issues/2880)
- [Execution APIs: Deprecating pending state](https://github.com/ethereum/execution-apis/issues/495)

## Summary: Nonce State Machine

```
[NEW TX ARRIVES]
    |
    v
Is nonce == expected? ──No──> QUEUE (future nonce)
    |                            |
   Yes                    Gap filled?
    |                            |
    v                           Yes
[PENDING] ──────────────────────┘
    |
    v
[PROPOSED IN BLOCK]
    |
    ├── Block rejected by Engine API
    |       └── Return to PENDING (nonce not consumed)
    |
    └── Block accepted
            |
            ├── TX executed successfully
            |       └── Nonce consumed, next = N+1
            |
            └── TX reverted
                    └── Nonce STILL consumed, next = N+1
```

The key insight: **Once on-chain (even if reverted), nonce is gone forever.**
