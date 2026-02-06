# GasStorm

Blockchain sequencer load testing framework with sub-second block times.

## What is GasStorm?

GasStorm is a local-first blockchain sequencer testbed that orchestrates an op-reth node, an external block builder, and a high-throughput load generator via Docker Compose. It provides a dashboard UI for real-time metrics (MGas/s, TPS, latency), supports multiple execution layers and ZK prover backends, and is designed to validate sequencer performance at up to 25,000 tx/s. Use it to benchmark block production, test transaction ordering strategies, and experiment with preconfirmations.

## Quick Start

```bash
# op-reth + block-builder (default)
make run-reth

# cdk-erigon standalone sequencer
make run-cdk-erigon

# Fast blocks with preconfirmations
BLOCK_TIME_MS=250 ENABLE_PRECONFIRMATIONS=true make run-reth

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
│                    Block Builder (Docker image)                     │
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

```bash
# Performance tuning
BLOCK_TIME_MS=250       # Block interval (default: 1000ms)
GAS_LIMIT=1000000000    # Block gas limit (1 gigagas)
MAX_TXS_PER_BLOCK=25000 # Max TXs per block
TX_ORDERING=tip_desc    # fifo | tip_desc | tip_asc

# Execution layer selection
EXECUTION_LAYER=reth         # Default
EXECUTION_LAYER=cdk-erigon   # Standalone sequencer
```

See [Configuration Reference](./docs/configuration.md) for the complete list of environment variables, Makefile targets, and Docker Compose profiles.

## Development

```bash
# Development mode (local load-generator + dashboard with HMR)
make dev              # reth mode
make dev-cdk-erigon   # cdk-erigon mode

# Run tests
make test

# View logs
make logs

# Stop services
make stop
```

## Components

| Component | Repository | Description |
|-----------|-----------|-------------|
| block-builder | [gateway-fm/blockbuilder](https://github.com/gateway-fm/blockbuilder) | Transaction pool, nonce management, Engine API block production |
| load-generator | [gateway-fm/loadgenerator](https://github.com/gateway-fm/loadgenerator) | High-throughput TX sender, multiple TX types, REST API |
| dashboard | `./dashboard` | Next.js UI for load test control and metrics |

## Documentation

| Document | Description |
|----------|-------------|
| [System Architecture](./docs/system-architecture.md) | Service map, critical paths, design patterns, nonce management |
| [Configuration](./docs/configuration.md) | Env vars, Makefile targets, Docker Compose profiles |
| [Execution Layers](./docs/execution-layers.md) | reth / cdk-erigon / gravity-reth comparison |
| [Troubleshooting](./docs/TROUBLESHOOTING.md) | Common issues and solutions |
| [Contributing](./CONTRIBUTING.md) | Development setup, testing, PR process |
| [Block Builder](https://github.com/gateway-fm/blockbuilder) | Pipeline, nonce cache, Engine API (external repo) |
| [Load Generator](https://github.com/gateway-fm/loadgenerator) | TX types, patterns, API reference (external repo) |
| [Dashboard](./dashboard/README.md) | Pages, metrics, TypeScript types |

## Performance

- **100 TPS**: 99% success rate, ~235ms avg latency
- **200+ TPS**: Nonce batching becomes bottleneck
- **Block rate**: ~4 blocks/sec at 250ms block time

## Troubleshooting

See [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) for common issues including pipeline stuck, invalid JWT, low throughput, and Engine API SYNCING recovery.
