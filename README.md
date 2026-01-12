# R&D Test Rig

A proof-of-concept sequencer using **reth** (op-reth) with the Engine API pattern, similar to how OP Stack works.

## Architecture

```
┌─────────────────────────────────────┐
│         Block Builder (Go)          │
│  - Collects txs via JSON-RPC :3000  │
│  - Batches into payloadAttributes   │
└───────────────┬─────────────────────┘
                │
  engine_forkchoiceUpdatedV3          engine_getPayloadV3
  (payloadAttrs.transactions)         engine_newPayloadV3
                │
                ▼
┌─────────────────┐           ┌──────────────────┐
│   L1 (Anvil)    │◀─────────▶│    op-reth       │
│   Port 8545     │ Hyperlane │   Port 8546 RPC  │
│                 │           │   Port 8551 Auth │
└─────────────────┘           └──────────────────┘
```

## How It Works

1. **Block Builder** collects transactions via `eth_sendRawTransaction` on port 3000
2. Every 2 seconds, it calls `engine_forkchoiceUpdatedV3` with:
   - `transactions`: RLP-encoded transactions to include
   - `noTxPool: true`: Ignore mempool, only use provided transactions
3. Gets the built payload via `engine_getPayloadV3`
4. Imports the block via `engine_newPayloadV3`
5. Updates fork choice to the new head

## Quick Start

```bash
cd rnd/sequencer-poc

# Start L1 + L2 + Block Builder
docker compose up --build

# In another terminal, send a test transaction
cast send --rpc-url http://localhost:13000 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
  --value 1ether

# Check L2 balance
cast balance 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 --rpc-url http://localhost:18546
```

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
| `uniswap-swap` | 180-250k | **Real Uniswap V3 AMM swaps** |
| `heavy-compute` | 500k | Compute-intensive operations |

The `uniswap-swap` type deploys full Uniswap V3 infrastructure (Factory, SwapRouter, NonfungiblePositionManager) with a WETH/USDC pool and executes real AMM swaps - the same code path as mainnet DEX transactions.

See [load-generator/README.md](load-generator/README.md) for detailed documentation on all transaction types and their realism.

## Ports

| Service | Port | Description |
|---------|------|-------------|
| Dashboard | 18000 | R&D Test Rig Dashboard |
| Load Generator | 13001 | Load test API |
| L1 (Anvil) | 18545 | Ethereum L1 RPC |
| L2 (op-reth) | 18546 | L2 JSON-RPC |
| L2 (op-reth) | 18547 | L2 WebSocket |
| L2 (op-reth) | 18551 | Engine API (JWT auth) |
| Block Builder | 13000 | Transaction submission RPC |

## Configuration

### Chain ID
- L1: 1 (Ethereum mainnet fork)
- L2: 42069 (custom)

### Pre-funded Accounts (Anvil defaults)

All accounts have 1,000,000 ETH on L2:

| Account | Private Key |
|---------|-------------|
| 0xf39F...2266 | 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 |
| 0x7099...79C8 | 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d |
| 0x3C44...93BC | 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a |

## Testing the Engine API

```bash
# Generate JWT token (valid for 60 seconds)
JWT_SECRET=$(cat config/jwt.hex)
JWT=$(python3 -c "
import jwt, time
print(jwt.encode({'iat': int(time.time())}, bytes.fromhex('$JWT_SECRET'), algorithm='HS256'))
")

# Test engine_forkchoiceUpdatedV3
curl -X POST http://localhost:8551 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d '{
    "jsonrpc": "2.0",
    "method": "engine_forkchoiceUpdatedV3",
    "params": [
      {
        "headBlockHash": "0x...",
        "safeBlockHash": "0x...",
        "finalizedBlockHash": "0x..."
      },
      {
        "timestamp": "0x...",
        "prevRandao": "0x...",
        "suggestedFeeRecipient": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        "withdrawals": [],
        "transactions": [],
        "noTxPool": true,
        "gasLimit": "0x1c9c380"
      }
    ],
    "id": 1
  }'
```

## AggLayer FEP (Full Execution Proofs)

Run the full AggLayer stack with SP1 mock prover for validity proofs.
This enables pessimistic proofs for cross-chain bridging security.

### Quick Start

```bash
# Option 1: Use startup script (recommended)
./scripts/start-agglayer.sh

# Option 2: Manual startup
docker compose --profile agglayer up -d

# Check AggLayer health
curl http://localhost:15577/health

# View logs
docker compose logs -f agglayer aggkit
```

### Docker Images (from kurtosis-cdk 2025-01)

| Component | Image | Version |
|-----------|-------|---------|
| AggLayer | `europe-west2-docker.pkg.dev/.../agglayer` | 0.4.4 |
| AggKit | `ghcr.io/agglayer/aggkit` | 0.8.0-beta5 |
| OP Succinct | `ghcr.io/agglayer/op-succinct/op-succinct-agglayer` | v3.4.0-rc.1 |
| Bridge Service | `ghcr.io/0xpolygon/zkevm-bridge-service` | v0.6.4-RC1 |
| Bridge UI | `europe-west2-docker.pkg.dev/.../zkevm-bridge-ui` | 0006445 |
| Contracts | `europe-west2-docker.pkg.dev/.../agglayer-contracts` | v12.2.1 |

### AggLayer Ports

| Service | Port | Description |
|---------|------|-------------|
| PostgreSQL | 15432 | Database for AggLayer services |
| OP Succinct | 13337 | SP1 mock prover API |
| AggLayer RPC | 15577 | Settlement layer RPC |
| AggLayer gRPC | 14443 | Settlement layer gRPC |
| AggLayer Admin | 15578 | Admin API |
| AggKit Node | 15579 | AggKit connector |
| Bridge Service | 18080 | Bridge backend REST API |
| Bridge UI | 18088 | Web interface for bridging |

### AggLayer Architecture

```
L1 (Anvil:18545)
    │
    ├── op-reth (:18546)
    │       └── block-builder (:13000)
    │
    ├── op-succinct-server (:13337)  ← SP1 mock prover
    │
    ├── agglayer (:15577)            ← Settlement layer
    │
    ├── aggkit-node (:15579)         ← OP Stack → AggLayer connector
    │
    └── bridge-ui (:18088)           ← Bridge frontend
```

### Configuration Files

- `config/op-succinct.env` - OP Succinct prover configuration
- `config/agglayer.toml` - AggLayer node configuration
- `config/aggkit.toml` - AggKit connector configuration

## Hyperlane Bridge (Alternative)

To enable the Hyperlane bridge instead of AggLayer:

```bash
# Start with bridge profile
docker compose --profile bridge up

# Deploy contracts (requires foundry)
cd contracts/hyperlane
forge script Deploy.s.sol --broadcast
```

## Files

```
sequencer-poc/
├── docker-compose.yml      # Service orchestration
├── genesis/
│   └── genesis.json        # L2 genesis (chain 42069)
├── config/
│   └── jwt.hex             # Engine API JWT secret
├── block-builder/
│   ├── main.go             # Block builder service
│   ├── go.mod
│   └── Dockerfile
└── contracts/
    └── hyperlane/          # Bridge deployment scripts
```

## Troubleshooting

### "Invalid JWT" errors
Regenerate the JWT secret:
```bash
openssl rand -hex 32 > config/jwt.hex
docker compose restart l2-reth block-builder
```

### op-reth not starting
Check logs:
```bash
docker compose logs l2-reth
```

Common issues:
- Invalid genesis config
- JWT secret format (must be 32 bytes hex)

### No blocks being produced
Check block builder logs:
```bash
docker compose logs block-builder
```

The builder should log "Block N successfully built and imported!" every 2 seconds.
