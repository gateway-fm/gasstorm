# Sequencer PoC

Preconfirmation sequencer proof-of-concept with sub-second block times.

## Quick Start

```bash
# op-reth + block-builder (default)
make run-reth

# cdk-erigon standalone sequencer
make run-cdk-erigon

# Fast blocks with preconfirmations
make run-reth BLOCK_TIME_MS=250 ENABLE_PRECONFIRMATIONS=true

# Open dashboard
open http://localhost:18000/load-test/
```

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

## Execution Layers

| Mode | Block Builder | Preconfirmations | TX Port |
|------|---------------|------------------|---------|
| reth (default) | External | Yes | 13000 |
| cdk-erigon | None (direct) | No | 18545 |
| gravity-reth | None (direct) | No | 8545 |

See [Execution Layers](./docs/execution-layers.md) for mode comparison and how to add new layers.

## Services

| Service | Port | Description |
|---------|------|-------------|
| dashboard | 18000 | Web UI |
| block-builder | 13000 | TX submission RPC |
| block-builder | 13002 | Preconfirmation WebSocket |
| load-generator | 13001 | Load test API |
| l2-reth | 18546 | L2 RPC/WebSocket |

## Load Testing

```bash
# Start a Uniswap swap load test at 100 TPS for 60 seconds
curl -X POST http://localhost:13001/start \
  -H "Content-Type: application/json" \
  -d '{"pattern":"constant","constantRate":100,"durationSec":60,"transactionType":"uniswap-swap"}'

# Or use the dashboard
open http://localhost:18000/load-test/
```

### Transaction Types

| Type | Gas | Description |
|------|-----|-------------|
| eth-transfer | 21k | Basic ETH transfers |
| erc20-transfer | 65k | ERC20 token transfers |
| uniswap-swap | 180-250k | Real Uniswap V3 AMM swaps |
| heavy-compute | 500k | Compute-intensive operations |

## Configuration

See [Configuration](./docs/configuration.md) for complete env var and Makefile reference.

```bash
# Performance tuning
BLOCK_TIME_MS=250       # Block interval (default: 1000ms)
GAS_LIMIT=1000000000    # Block gas limit (1 gigagas)
MAX_TXS_PER_BLOCK=25000 # Max TXs per block
TX_ORDERING=tip_desc    # fifo | tip_desc | tip_asc

# Execution layer selection
EXECUTION_LAYER=reth         # Default
EXECUTION_LAYER=cdk-erigon   # Standalone sequencer

# Prover selection (AggLayer)
PROVER=sp1   # Default
PROVER=zisk  # ZisK zkVM
```

## Development

```bash
# Run all tests
make test

# Run specific tests
make test-block-builder
make test-load-generator
make test-dashboard

# Development mode (local load-generator)
make dev              # reth mode
make dev-cdk-erigon   # cdk-erigon mode

# View logs
make logs

# Stop services
make stop
```

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](./docs/architecture.md) | Deep dive: nonce management, transaction lifecycle |
| [Configuration](./docs/configuration.md) | Env vars, Makefile targets, docker profiles |
| [Execution Layers](./docs/execution-layers.md) | reth/cdk-erigon/gravity-reth comparison |
| [Block Builder](https://github.com/gateway-fm/blockbuilder) | Pipeline, nonce cache, Engine API (external repo) |
| [Load Generator](https://github.com/gateway-fm/loadgenerator) | TX types, patterns, API reference (external repo) |
| [Dashboard](./dashboard/README.md) | Pages, metrics, TypeScript types |

## Performance

- **100 TPS**: 99% success rate, ~235ms avg latency
- **200+ TPS**: Nonce batching becomes bottleneck
- **Block rate**: ~4 blocks/sec at 250ms block time

See [Architecture](./docs/architecture.md#performance-characteristics) for benchmarks and bottlenecks.

## Troubleshooting

```bash
# Invalid JWT errors
openssl rand -hex 32 > config/jwt.hex
docker compose restart l2-reth block-builder

# No blocks being produced
docker compose logs block-builder

# Pipeline stuck
make stop && make run-reth

# Low throughput
docker compose logs block-builder | grep -i latency
```
