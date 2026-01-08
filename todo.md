I've researched the problem and written a detailed plan. Here are the key findings:

  Why Previous Pipelining Failed:
  1. SYNCING recovery used blocking retry loops that caused cascade failures
  2. Nonce cache desync between async FCU and next block's filter
  3. State machine complexity across goroutines was hard to debug

  Research Insights:
  - https://www.paradigm.xyz/2024/04/reth-perf: State root calculation is 75% of block sealing time
  - https://github.com/ethereum/go-ethereum/issues/28242: Engine API getPayload can lag ~2 seconds if block building started late
  - https://writings.flashbots.net/parallel-builder: Pipelining phases + simulation caching for conflict resolution

  The Core Constraint: We can't modify op-reth's internal block building. GetPayloadV3 latency (100-500ms) is largely out of our control.

  Proposed Approach: Simpler "optimistic pipelining" that overlaps TX collection and nonce prefetching with Engine API calls, avoiding the multi-block speculation that caused previous failures