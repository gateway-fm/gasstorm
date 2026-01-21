# Hyperlane Bridge Integration

**Date**: 2026-01-21
**Purpose**: Documentation for Hyperlane interchain messaging and ETH bridging in the sequencer PoC

---

## Overview

Hyperlane is an open interchain messaging protocol that enables communication between blockchains. This project uses Hyperlane's **Warp Routes** to bridge ETH between L1 (Ethereum) and L2 (op-reth).

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         L1 (Ethereum)                               │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Mailbox Contract                                             │  │
│  │  └─ dispatch() sends messages to L2                          │  │
│  │                                                              │  │
│  │  Warp Router (Token Router)                                  │  │
│  │  └─ Locks ETH, sends interchain message                      │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                               │                                     │
│                               │ Interchain Message                  │
│                               ▼                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Relayer (off-chain agent)                                   │  │
│  │  └─ Monitors Mailbox, delivers messages to destination       │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               │ Relayer delivers message
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         L2 (op-reth)                                │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Mailbox Contract                                             │  │
│  │  └─ handle() processes incoming messages                     │  │
│  │                                                              │  │
│  │  Warp Router (Token Router)                                  │  │
│  │  └─ Mints wrapped ETH on deposit, burns on withdrawal        │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### Mailbox Contract

Deployed on both L1 and L2 chains. Each Mailbox has two key functions:

| Function | Chain | Purpose |
|----------|-------|---------|
| `dispatch()` | L1 | Sends an interchain message to the destination chain |
| `handle()` | L2 | Processes messages delivered by relayers |

The Mailbox assigns each message a unique ID (IM) that can be used to track delivery status.

### Interchain Security Module (ISM)

Validates message authenticity on the destination chain. This project uses the default ISM configuration which provides basic security guarantees. In production, you might configure:
- **Multisig ISM**: Requires signatures from multiple validators
- **Optimistic ISM**: Allows challenge period before finalization
- **Threshold ISM**: Requires N-of-M signatures

### Warp Routes

Hyperlane's token bridge mechanism. For ETH bridging:

| Action | L1 Operation | L2 Operation |
|--------|--------------|--------------|
| **Deposit** | Lock ETH in Warp Router | Mint wrapped ETH (HyperlaneETH) |
| **Withdraw** | Burn wrapped ETH | Unlock ETH from Warp Router |

### Relayer

Off-chain agent that:
1. Monitors origin chain Mailboxes for dispatched messages
2. Picks up messages and delivers them to destination chains
3. Earns rewards for successful delivery

The relayer configuration is in `config/hyperlane-relayer.json`.

---

## Warp Route Token Flow

### Deposit: L1 ETH → L2 HyperlaneETH

```
User ────ETH────▶ ┌──────────────────┐
                  │  L1 Warp Router  │ ──dispatch(IM)──▶ Relayer
                  │  (locks ETH)     │
                  └──────────────────┘
                                                   ┌──────────────────┐
                                                   │  L2 Warp Router  │
                                                   │  (mints tokens)  │ ──▶ User
                                                   └──────────────────┘
```

1. User calls `deposit()` on L1 Warp Router with ETH
2. Router locks ETH and calls `dispatch()` on L1 Mailbox
3. Relayer picks up the message and delivers it to L2 Mailbox
4. L2 Mailbox calls `handle()` on L2 Warp Router
5. Router mints HyperlaneETH tokens to user's L2 address

### Withdraw: L2 HyperlaneETH → L1 ETH

```
User ──HyperlaneETH ──▶ ┌──────────────────┐
                        │  L2 Warp Router  │ ──dispatch(IM)──▶ Relayer
                        │  (burns tokens)  │
                        └──────────────────┘
                                                  ┌──────────────────┐
                                                  │  L1 Warp Router  │
                                                  │  (unlocks ETH)   │ ──▶ User
                                                  └──────────────────┘
```

1. User calls `withdraw()` on L2 Warp Router with HyperlaneETH
2. Router burns tokens and calls `dispatch()` on L2 Mailbox
3. Relayer picks up the message and delivers it to L1 Mailbox
4. L1 Mailbox calls `handle()` on L1 Warp Router
5. Router unlocks ETH to user's L1 address

---

## Project-Specific Configuration

### Chain Configuration

| Property | L1 | L2 |
|----------|----|----|
| Chain ID | 1 (Ethereum) | l2 (custom) |
| RPC URL | From env | http://localhost:18545 |
| Mailbox | Deployed | Deployed |
| ISM | Deployed | Deployed |
| Warp Router | Deployed | Deployed |

### Deployment Files

| File | Purpose |
|------|---------|
| `contracts/hyperlane/config.yaml` | Core deployment config (Mailbox, ISM) |
| `contracts/hyperlane/warp-config.yaml` | Warp Route deployment config |
| `config/hyperlane-relayer.json` | Relayer configuration |
| `scripts/deploy-hyperlane.sh` | Deployment script |

### Deployment Artifacts

After running `./scripts/deploy-hyperlane.sh`, artifacts are saved to:
- `~/.hyperlane/chains/l1/` - L1 chain config
- `~/.hyperlane/chains/l2/` - L2 chain config
- `~/.hyperlane/deployments/warp_routes/ETH/` - Warp Route addresses

---

## Usage

### Prerequisites

1. Deploy Hyperlane contracts:
   ```bash
   ./scripts/deploy-hyperlane.sh
   ```

2. Start the relayer:
   ```bash
   docker compose --profile bridge up -d hyperlane-relayer
   ```

3. Check relayer logs:
   ```bash
   docker compose logs -f hyperlane-relayer
   ```

### Bridging ETH to L2 (Deposit)

```bash
./scripts/bridge-deposit.sh --amount 0.1 --l2-url http://localhost:18545
```

This script:
1. Creates an L2 account (if needed)
2. Funds it via the L1 faucet
3. Deposits ETH from L1 to L2 via Hyperlane Warp Route

### Bridging ETH to L1 (Withdrawal)

```bash
./scripts/bridge-withdraw.sh --amount 0.05 --l2-url http://localhost:18545
```

This script:
1. Checks L2 balance
2. Withdraws ETH from L2 to L1 via Hyperlane Warp Route
3. Waits for message delivery and confirmation

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `HYP_L1_WARP_ADDRESS` | L1 Warp Router address (auto-detected) |
| `HYP_L2_WARP_ADDRESS` | L2 Warp Router address (auto-detected) |
| `HYP_MAILBOX_L1` | L1 Mailbox address |
| `HYP_MAILBOX_L2` | L2 Mailbox address |
| `HYP_CHAIN_L1` | L1 chain ID (default: ethereum) |
| `HYP_CHAIN_L2` | L2 chain ID (default: l2) |

---

## Troubleshooting

### Relayer Not Running

```bash
# Check if relayer is running
docker compose ps hyperlane-relayer

# Start the relayer
docker compose --profile bridge up -d hyperlane-relayer

# View logs
docker compose logs -f hyperlane-relayer
```

### Bridge Transactions Stuck

1. Check relayer is processing messages:
   ```bash
   docker compose logs hyperlane-relayer | grep -i "dispatch\|deliver"
   ```

2. Verify chain configurations:
   ```bash
   cat ~/.hyperlane/chains/l1/addresses.yaml
   cat ~/.hyperlane/chains/l2/addresses.yaml
   ```

3. Check warp route deployment:
   ```bash
   cat ~/.hyperlane/deployments/warp_routes/ETH/l1-addresses.yaml
   cat ~/.hyperlane/deployments/warp_routes/ETH/l2-addresses.yaml
   ```

### Deployment Issues

1. Ensure L1 and L2 are running before deployment
2. Check RPC URLs are accessible
3. Verify wallet has sufficient ETH for deployment

---

## Hyperlane CLI Reference

```bash
# Deploy core contracts (Mailbox, ISM)
npx @hyperlane-xyz/cli deploy core --config contracts/hyperlane/config.yaml

# Deploy warp route
npx @hyperlane-xyz/cli deploy warp --config contracts/hyperlane/warp-config.yaml

# View deployed addresses
npx @hyperlane-xyz/cli chains list --registry ~/.hyperlane
npx @hyperlane-xyz/cli core status --registry ~/.hyperlane --chain l1 --chain l2
```

---

## Security Considerations

1. **Relayer Trust**: Relayers are off-chain and must be trusted to deliver messages correctly
2. **ISM Configuration**: Default ISM provides basic security; production should use multisig
3. **Message Ordering**: Hyperlane does not guarantee message ordering across chains
4. **Finality**: Bridging waits for L1 finality before delivery

---

## References

- [Hyperlane Documentation](https://docs.hyperlane.xyz/)
- [Hyperlane GitHub](https://github.com/hyperlane-xyz/hyperlane)
- [Warp Routes](https://docs.hyperlane.xyz/docs/protocol/warp-routes)
- [Relayers](https://docs.hyperlane.xyz/docs/protocol/relayers)
- [Interchain Security](https://docs.hyperlane.xyz/docs/protocol/sovereign-consensus)
