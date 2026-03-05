# GasStorm

Local devnet and stress-testing toolkit for EVM sequencers — spins up an L1/L2 stack, block builder, and load generator with a real-time dashboard to measure throughput, latency, and gas metrics.

## What is GasStorm?

GasStorm is a local-first blockchain sequencer testbed that orchestrates an op-reth node, an external block builder, and a high-throughput load generator via Docker Compose. It provides a dashboard UI for real-time metrics (MGas/s, TPS, latency), supports multiple execution layers and ZK prover backends, and is designed to validate sequencer performance at up to 25,000 tx/s. Use it to benchmark block production, test transaction ordering strategies, and experiment with preconfirmations.

## Quick Start

```bash
# Default stack (op-reth + block-builder + Hyperlane bridge + Blob DA infra)
make run

# op-reth + block-builder only (disable default bridge + blob infra)
ENABLE_HYPERLANE_BRIDGE=false ENABLE_BLOB_DA=false make run

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
| explorer-api | 18200 | Block explorer REST API (optional) |
| explorer-ui | 18201 | Block explorer web UI (optional) |
| privacy-proxy | 18300 | Privacy proxy API (optional) |
| privacy-ui | 18301 | Privacy proxy UI (optional) |

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
MAX_TXS_PER_BLOCK=50000 # Max TXs per block
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
# Block explorer
make run-with-explorer

# Privacy proxy (RPC access control)
make run-with-privacy

# Both explorer + privacy
make run-with-explorer-privacy

# Blob DA (EIP-4844 data availability)
make run-with-blob

# Hyperlane bridge + Warp UI
make run-with-bridge
```

### Block Explorer

Indexes blocks and transactions from the RPC endpoint. Requires `../block-explorer`.

| Service | Port | Description |
|---------|------|-------------|
| explorer-api | 18200 | REST API |
| explorer-ui | 18201 | Web UI |
| explorer-db | 15436 | PostgreSQL |

### Privacy Proxy

RPC access control with ZK-proof-based KYC and RBAC. Requires `../privacy-proxy`.

| Service | Port | Description |
|---------|------|-------------|
| privacy-proxy | 18300 | Proxy API |
| privacy-ui | 18301 | Management UI |
| privacy-db | 15437 | PostgreSQL |

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
| privacy-proxy | [gateway-fm/privacy-proxy](https://github.com/gateway-fm/privacy-proxy) | RPC access control with ZK proofs (optional, `--profile privacy`) |
| block-explorer | [gateway-fm/block-explorer](https://github.com/gateway-fm/block-explorer) | Block/TX indexer with web UI (optional, `--profile explorer`) |
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

- **15K TPS** (realistic mixed load): 99.8% confirmed, 1327 MGas/s peak (Metal mode, 1s blocks)
- **25K TPS** (ETH transfers): 100% confirmed, p99 preconf 385ms (Metal mode)
- **12K TPS** (realistic, Docker): 99% confirmed, 458 MGas/s
- Key bottleneck: ECDSA sig verification (~40% builder CPU at high TPS)

See [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) for common issues including pipeline stuck, invalid JWT, low throughput, and Engine API SYNCING recovery.
