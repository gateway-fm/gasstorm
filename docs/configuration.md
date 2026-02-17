# Configuration

Complete configuration reference for GasStorm.

## Environment Variables

### Block Builder

| Variable | Default | Description |
|----------|---------|-------------|
| `BLOCK_TIME_MS` | 1000 | Block interval in milliseconds |
| `GAS_LIMIT` | 1000000000 | Block gas limit (1 gigagas) |
| `MAX_TXS_PER_BLOCK` | 50000 | Maximum transactions per block |
| `TX_ORDERING` | tip_desc | Transaction ordering: `fifo`, `tip_desc`, `tip_asc` |
| `ENABLE_PRECONFIRMATIONS` | true | WebSocket preconfirmation events |
| `SKIP_EMPTY_BLOCKS` | true | Don't produce blocks without transactions |

### Load Generator

| Variable | Default | Description |
|----------|---------|-------------|
| `EXECUTION_LAYER` | reth | Execution layer: `reth`, `cdk-erigon`, `gravity-reth` |
| `RPC_URL` | http://block-builder:13000 | Transaction submission endpoint |
| `L2_RPC_URL` | http://l2-reth:8545 | L2 node for confirmations |
| `HTTP_PORT` | 13001 | Load generator API port |
| `DATABASE_PATH` | /data/loadgen.db | SQLite database path |
| `CIRCUIT_BREAKER_FAILURE_THRESHOLD` | 0.05 | Failure rate threshold (5%) |
| `CIRCUIT_BREAKER_REVOCATION_THRESHOLD` | 0.20 | Revocation rate threshold (20%) |

### Execution Layer Selection

See [Execution Layers](./execution-layers.md) for detailed mode comparison.

```bash
# reth mode (default) - uses block-builder
make run-reth

# cdk-erigon mode - standalone sequencer
EXECUTION_LAYER=cdk-erigon make run-cdk-erigon

# gravity-reth mode - parallel EVM sequencer
EXECUTION_LAYER=gravity-reth make run-gravity-reth
```

### Prover Selection

| Prover | Description | Profile |
|--------|-------------|---------|
| `sp1` (default) | OP Succinct with SP1 zkVM | `prover-sp1` |
| `zisk` | ZisK zkVM (Polygon) | `prover-zisk` |

```bash
# SP1 prover (default)
make run-agglayer

# ZisK prover
PROVER=zisk make run-agglayer
```

## Makefile Targets

### Running the Stack

```bash
# Default: op-reth + block-builder
make run

# Explicit reth mode
make run-reth

# cdk-erigon standalone sequencer
make run-cdk-erigon

# gravity-reth parallel EVM
make run-gravity-reth

# Metal mode (native, no Docker)
make run-metal
```

### Performance Profiles

```bash
# High throughput: 1 gigagas, 100ms blocks
make run-high-throughput

# Fast confirmations: 150M gas, 50ms blocks
make run-fast-confirm
```

### Development

```bash
# Local development (runs load-generator outside Docker)
make dev              # reth mode
make dev-cdk-erigon   # cdk-erigon mode

# View logs
make logs

# Restart services
make restart

# Stop everything
make stop
```

### Testing

```bash
# All tests with race detector
make test

# Specific test suites
make test-load-generator
make test-dashboard
make test-contract

# Benchmarks
make bench-load-generator

# Integration tests
make test-integration  # Starts/stops stack
make test-e2e          # Requires running stack
```

### Polycli Commands

```bash
# Generate EOA accounts
polycli-eoa

# ERC20 transfers
polycli-erc20

# ERC721 mints
polycli-erc721

# Uniswap V3 swaps
polycli-uniswap

# Storage writes
polycli-store

# Mixed workload
polycli-mixed

# Show all polycli options
polycli-help
```

## Docker Compose Profiles

| Profile | Services | Use Case |
|---------|----------|----------|
| `reth` | block-builder, l2-reth, l1-anvil | Default block-builder mode |
| `cdk-erigon` | cdk-erigon, l1-anvil | Standalone sequencer |
| `gravity-reth` | gravity-reth, l1-anvil | Parallel EVM sequencer |
| `bridge` | bridge-ui, bridge-service | Hyperlane bridge UI |
| `prover-sp1` | op-succinct, agglayer-db | SP1 prover stack |
| `prover-zisk` | zisk-prover, agglayer-db | ZisK prover stack |

### Profile Usage

```bash
# Single profile
docker compose --profile reth up -d

# Multiple profiles
docker compose --profile reth --profile bridge up -d

# All prover profiles
docker compose --profile prover-sp1 up -d
```

## Service Ports

| Service | Port | Protocol | Description |
|---------|------|----------|-------------|
| dashboard | 18000 | HTTP | Web UI |
| block-builder | 13000 | HTTP | TX submission RPC |
| block-builder | 13002 | WS | Preconfirmation WebSocket |
| load-generator | 13001 | HTTP | Load test API |
| l1-anvil | 18545 | HTTP | L1 RPC |
| l2-reth | 18546 | HTTP/WS | L2 RPC/WebSocket |
| cdk-erigon | 18545 | HTTP/WS | L2 RPC (cdk-erigon mode) |

### AggLayer Ports

| Service | Port | Description |
|---------|------|-------------|
| PostgreSQL | 15432 | Database |
| OP Succinct | 13337 | SP1 mock prover |
| ZisK | 13337 | ZisK prover |
| AggLayer RPC | 15577 | Settlement layer RPC |
| AggLayer gRPC | 14443 | Settlement layer gRPC |
| Bridge Service | 18080 | Bridge backend REST |

## Chain Configuration

| Parameter | Value |
|-----------|-------|
| L1 Chain ID | 1 (Ethereum mainnet fork) |
| L2 Chain ID | 42069 |
| Block Time | Configurable (default: 1000ms) |
| Gas Limit | 1,000,000,000 (1 gigagas) |

### Pre-funded Accounts

All accounts have 1,000,000 ETH on L2:

| Account | Private Key |
|---------|-------------|
| 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 | 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 |
| 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 | 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d |
| 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC | 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a |

## JWT Configuration

```bash
# Generate JWT token
openssl rand -hex 32 > config/jwt.hex

# Restart services to apply
docker compose restart l2-reth block-builder
```

## Troubleshooting

### Invalid JWT Errors

```bash
openssl rand -hex 32 > config/jwt.hex
docker compose restart l2-reth block-builder
```

### No Blocks Being Produced

```bash
docker compose logs block-builder
```

### Low Throughput

- Check Engine API latency in logs
- Monitor pending count - if growing, nonce filtering may be slow
- Increase number of accounts to distribute nonces

### Pipeline Gets Stuck

```bash
make stop && make run-reth
```

See [System Architecture](./system-architecture.md) for deep dive on nonce management and transaction lifecycle.
