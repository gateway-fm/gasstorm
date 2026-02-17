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

## Metal Mode (Bare Metal)

Run all components natively on the host machine with no Docker overhead. Eliminates the ~2-3x I/O penalty from Docker-on-Mac's VM layer, unlocking higher TPS for performance testing.

**Prerequisites:** op-reth (or reth), Go, Node.js, and sibling repos (`../blockbuilder`, `../loadgenerator`)

```bash
# Start (builds Go binaries, starts all 4 services)
make run-metal

# Stop
make stop-metal

# Restart
make restart-metal

# Clean data
make clean-metal
```

Services use the same ports as Docker mode (dashboard: 3000, builder: 13000, loadgen: 13001, reth: 18546). Configuration is read from `.env` just like Docker mode.

Metal mode writes PID files to `data/metal/pids/` and logs to `data/metal/logs/`. The MCP tools (`stack_status`, `stack_logs`, etc.) auto-detect which mode is active.

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

## Optional Profiles

GasStorm uses additive Docker Compose profiles for optional services. These run alongside the core stack without affecting block builder performance.

```bash
# Blob DA (EIP-4844 data availability)
make run-with-blob

# Hyperlane bridge
make run-with-bridge
```

### Blob DA

Syncs L2 batches, packs them into EIP-4844 blobs, and posts to L1. Requires the sibling repo at `../blob-da`.

| Service | Port | Description |
|---------|------|-------------|
| blob-da | 18125 | JSON-RPC (`data_getOffChainBlobs`) |
| blob-da-db | 15435 | Postgres (blob storage) |

The dashboard auto-detects blob-da and shows live online/offline status in the system diagram.

## Components

| Component | Repository | Description |
|-----------|-----------|-------------|
| block-builder | [gateway-fm/blockbuilder](https://github.com/gateway-fm/blockbuilder) | Transaction pool, nonce management, Engine API block production |
| load-generator | [gateway-fm/loadgenerator](https://github.com/gateway-fm/loadgenerator) | High-throughput TX sender, multiple TX types, REST API |
| blob-da | `../blob-da` | EIP-4844 blob packing and L1 posting (optional, `--profile blob`) |
| dashboard | `./dashboard` | Next.js UI for load test control and metrics |

## Documentation

| Document | Description |
|----------|-------------|
| [MCP Server](./docs/mcp.md) | AI tool integration (24 tools: stack management, builder, load generator) |
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

See [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) for common issues including pipeline stuck, invalid JWT, low throughput, and Engine API SYNCING recovery.

## Metal Mode (Native Execution)

GasStorm supports "Metal Mode", running all components directly on the host machine without Docker. This provides maximum performance and easier debugging.

### Prerequisites
- **Go**: 1.21+
- **Node.js**: 18+
- **Rust**: (for building reth if needed)
- **Foundry**: `anvil` (for L1)
- **op-reth**: Installed via cargo or binary
- **Sibling Repos**: `../blockbuilder` and `../loadgenerator` must exist relative to this repo.

### Running in Metal Mode

1.  **Start the stack**:
    ```bash
    make run-metal
    ```
    This script checks for prerequisites, builds binaries, and starts: L1 (Anvil), op-reth, Block Builder, Load Generator, and Dashboard.

2.  **Stop the stack**:
    ```bash
    make stop-metal
    ```
    Stops all services and cleans up PID files.

3.  **Logs**:
    Logs are written to `data/metal/logs/`.
