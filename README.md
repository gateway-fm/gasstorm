# Sequencer PoC

Preconfirmation sequencer proof-of-concept with sub-second block times using **op-reth** and the Engine API.

## Architecture

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

## Quick Start

```bash
# Start with op-reth + block-builder (default)
make run-reth

# Start with fast blocks and preconfirmations
BLOCK_TIME_MS=250 ENABLE_PRECONFIRMATIONS=true make run-reth

# View logs
make logs

# Run load test via dashboard
open http://localhost:18000/load-test/

# Stop services
make stop
```

### Alternative: cdk-erigon Mode

```bash
# Start with cdk-erigon sequencer (block-builder bypassed)
make run-cdk-erigon
```

| Aspect | reth Mode | cdk-erigon Mode |
|--------|-----------|-----------------|
| Block Building | External (block-builder) | Internal (sequencer) |
| TX Submission | block-builder:13000 | cdk-erigon:18546 |
| Preconfirmations | Yes (WebSocket) | No |

## Load Testing

The load generator creates realistic blockchain transaction workloads for benchmarking sequencer throughput.

```bash
# Start a Uniswap swap load test at 100 TPS for 60 seconds
curl -X POST http://localhost:13001/start \
  -H "Content-Type: application/json" \
  -d '{"pattern":"constant","durationSec":60,"constantRate":100,"transactionType":"uniswap-swap"}'

# Or use the dashboard
open http://localhost:18000/load-test/
```

### Transaction Types

| Type | Gas | Description |
|------|-----|-------------|
| `eth-transfer` | 21k | Basic ETH transfers |
| `erc20-transfer` | 65k | ERC20 token transfers |
| `uniswap-swap` | 180-250k | Real Uniswap V3 AMM swaps |
| `heavy-compute` | 500k | Compute-intensive operations |
| `storage-heavy` | Variable | Storage-intensive operations |

The `uniswap-swap` type deploys full Uniswap V3 infrastructure (Factory, SwapRouter, NonfungiblePositionManager) with a WETH/USDC pool and executes real AMM swaps.

### Dashboard Metrics

The dashboard shows:
- **Real-time chart** with MGas/s and TPS over time
- **Metrics snapshot**: Current MGas/s, Peak MGas/s, Total Gas Used
- **Latency histogram**: Confirmation and preconfirmation latencies
- **Percentile table**: p50/p75/p90/p95/p99 for latency, MGas/s, TPS, block fill rate
- **Verification summary**: TX sent/confirmed/failed counts

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `EXECUTION_LAYER` | reth | Execution layer: `reth` or `cdk-erigon` |
| `BLOCK_TIME_MS` | 1000 | Block interval in milliseconds |
| `GAS_LIMIT` | 1000000000 | Block gas limit (1 gigagas) |
| `MAX_TXS_PER_BLOCK` | 25000 | Maximum transactions per block |
| `TX_ORDERING` | fifo | Transaction ordering: `fifo`, `tip_desc`, `tip_asc` |
| `ENABLE_PRECONFIRMATIONS` | true | WebSocket preconf events |
| `SKIP_EMPTY_BLOCKS` | false | Don't produce blocks without transactions |

### Chain Configuration

- **L1 Chain ID**: 1 (Ethereum mainnet fork)
- **L2 Chain ID**: 42069 (custom)

### Pre-funded Accounts

All accounts have 1,000,000 ETH on L2:

| Account | Private Key |
|---------|-------------|
| 0xf39F...2266 | 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 |
| 0x7099...79C8 | 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d |
| 0x3C44...93BC | 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a |

## Services & Ports

| Service | Port | Description |
|---------|------|-------------|
| Dashboard | 18000 | Web UI for testing |
| Block Builder | 13000 | Transaction submission RPC |
| Block Builder | 13002 | Preconfirmation WebSocket |
| Load Generator | 13001 | Load test API |
| L1 (Anvil) | 18545 | Ethereum L1 RPC |
| L2 (op-reth) | 18546 | L2 JSON-RPC |
| L2 (op-reth) | 18547 | L2 WebSocket |

## Development

### Prerequisites

- Go 1.25+
- Docker & Docker Compose
- Node.js 18+ (for dashboard)

### Testing

```bash
# Run all tests with race detector
make test

# Run specific test suites
make test-block-builder
make test-load-generator
make test-contract

# Run benchmarks
make bench-block-builder
make bench-load-generator

# Development mode (local load-generator)
make dev
```

### Project Structure

```
sequencer-poc/
├── block-builder/           # Go block builder service
│   ├── internal/
│   │   ├── builder/         # Core block building logic
│   │   ├── engine/          # Engine API client
│   │   ├── preconf/         # Preconfirmation hub
│   │   ├── txpool/          # Transaction pool & filtering
│   │   └── rpc/             # JSON-RPC server
│   └── pkg/pools/           # Object pools
├── load-generator/          # Go load testing service
│   ├── internal/
│   │   ├── account/         # Nonce management
│   │   ├── metrics/         # Latency & throughput tracking
│   │   ├── pipeline/        # TX pipeline
│   │   ├── txbuilder/       # Transaction builders
│   │   └── verification/    # TX verification
│   └── pkg/types/           # Public API types
├── dashboard/               # Next.js web UI
├── config/                  # Configuration files
└── genesis/                 # L2 genesis configuration
```

## Performance

### Tested Throughput

- **100 TPS**: 99% success rate, ~235ms avg latency
- **Block rate**: ~4 blocks/sec at 250ms block time
- **Gas throughput**: Up to 6+ MGas/s sustained

### Key Benchmarks

| Operation | Time |
|-----------|------|
| FilterExecutable (5000tx/500 senders) | 415µs |
| BuildBlock (empty) | 458µs |
| Engine API FCU roundtrip | 305µs |
| Preconf emit (1000tx batch) | 2.1µs |

## AggLayer Integration

Run the full AggLayer stack with SP1 mock prover for validity proofs.

```bash
# Start with AggLayer profile
./scripts/start-agglayer.sh

# Or manually
docker compose --profile agglayer up -d

# Check health
curl http://localhost:15577/health
```

### AggLayer Ports

| Service | Port | Description |
|---------|------|-------------|
| PostgreSQL | 15432 | Database |
| OP Succinct | 13337 | SP1 mock prover |
| AggLayer RPC | 15577 | Settlement layer RPC |
| AggLayer gRPC | 14443 | Settlement layer gRPC |
| Bridge Service | 18080 | Bridge backend REST |

## Troubleshooting

### "Invalid JWT" errors

```bash
openssl rand -hex 32 > config/jwt.hex
docker compose restart l2-reth block-builder
```

### No blocks being produced

```bash
docker compose logs block-builder
```

The builder should log block production at the configured interval.

### Pipeline gets stuck

If blocks stop being produced and pending count grows, the Engine API may have returned SYNCING. Restart the stack:

```bash
make stop && make run-reth
```

### Low throughput

- Check Engine API latency in logs
- Monitor pending count - if growing, nonce filtering may be slow
- Increase number of accounts to distribute nonces
