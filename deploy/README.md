# Remote Deployment Guide

GasStorm supports two deployment topologies: **single-server** (all-in-one) and **3-way split** (chain, explorer, main on separate servers). Both deploy from your local machine via SSH — source code is rsync'd and Docker images are built on the remote servers.

## Prerequisites

- SSH access to target server(s) (key-based auth recommended)
- Sibling repos cloned locally alongside `gasstorm/`:
  ```
  gateway/
  ├── gasstorm/         # this repo
  ├── blockbuilder/
  ├── loadgenerator/
  ├── block-explorer/
  └── privacy-proxy/
  ```
- Docker will be auto-installed on the remote server if not present

## Single-Server Deploy

Deploys the entire stack (L1, L2, block builder, load generator, dashboard, explorer) on one server.

```bash
# Required: GASSTORM_DOMAIN must be set (in env or .env)
export GASSTORM_DOMAIN=gasstorm.example.com

# Deploy
make deploy-server SERVER=<server-ip>

# Clean deploy (tears down existing stack first, removes volumes)
make deploy-server-clean SERVER=<server-ip>
```

### Ports exposed

| Port  | Service          |
|-------|------------------|
| 80    | Dashboard (nginx)|
| 13000 | Block builder    |
| 18200 | L2 Explorer API  |
| 18201 | L2 Explorer UI   |

## 3-Way Split Deploy

Splits the stack across three servers for better performance and isolation. Each server runs a subset of the services:

| Server   | Services                                        | Makefile target     |
|----------|--------------------------------------------------|---------------------|
| Chain    | L1 (Anvil), L2 (op-reth), Block Builder          | `deploy-chain`      |
| Explorer | Block Explorer (L1+L2), Privacy Proxy, Privacy UI | `deploy-explorer`   |
| Main     | Dashboard, Load Generator, Docs, Bridge           | `deploy-main`       |

### Step 1: Deploy the Chain Server

```bash
make deploy-chain SERVER=<chain-ip>
```

This starts L1 (Anvil), L2 (op-reth), and the block builder. The block builder listens on port 13000.

### Step 2: Deploy the Explorer Server

```bash
make deploy-explorer \
  SERVER=<chain-ip> \
  EXPLORER_SERVER=<explorer-ip> \
  MAIN_SERVER=<main-ip>
```

`SERVER` is the chain server IP (the explorer indexer connects to its RPC). `MAIN_SERVER` is needed for SSO redirect URLs.

### Step 3: Deploy the Main Server

```bash
make deploy-main \
  SERVER=<chain-ip> \
  EXPLORER_SERVER=<explorer-ip> \
  MAIN_SERVER=<main-ip>
```

The dashboard on the main server proxies RPC calls to the chain server and explorer API calls to the explorer server.

### Full 3-Way Example

```bash
CHAIN=<chain-server-ip>
EXPLORER=<explorer-server-ip>
MAIN=<main-server-ip>

# Deploy in order: chain first, then explorer, then main
make deploy-chain SERVER=$CHAIN
make deploy-explorer SERVER=$CHAIN EXPLORER_SERVER=$EXPLORER MAIN_SERVER=$MAIN
make deploy-main SERVER=$CHAIN EXPLORER_SERVER=$EXPLORER MAIN_SERVER=$MAIN
```

### Clean Deploy (Full Teardown + Redeploy)

Append `-clean` to any target to tear down the existing stack and remove volumes before deploying:

```bash
make deploy-chain-clean SERVER=$CHAIN
make deploy-explorer-clean SERVER=$CHAIN EXPLORER_SERVER=$EXPLORER MAIN_SERVER=$MAIN
make deploy-main-clean SERVER=$CHAIN EXPLORER_SERVER=$EXPLORER MAIN_SERVER=$MAIN
```

## Separate Load Generator

For high-throughput testing, run the load generator on its own server to avoid contention:

```bash
make deploy-loadgen \
  SERVER=<chain-ip> \
  LOADGEN_SERVER=<loadgen-ip>
```

## Configuration

### Common Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SSH_USER` | `ubuntu` | SSH username for remote servers |
| `COMPOSE_PROFILE` | `reth` | Execution layer: `reth` or `cdk-erigon` |

### External L1 (Bridge)

To bridge to an external L1 chain instead of the local Anvil L1:

```bash
make deploy-main \
  SERVER=$CHAIN \
  EXPLORER_SERVER=$EXPLORER \
  MAIN_SERVER=$MAIN \
  EXTERNAL_L1_RPC=https://rpc.example.com \
  EXTERNAL_L1_CHAIN_NAME=mychain \
  EXTERNAL_L1_CHAIN_ID=1234 \
  EXTERNAL_L1_DISPLAY_NAME="My Chain"
```

### Pinning Warp Contracts

After the first bridge deployment, Hyperlane warp contracts are deployed on-chain. To keep the same contract addresses across redeployments (avoiding the need to re-deploy):

```bash
export L1_ETH_WARP_ADDR=0x...
export L2_ETH_WARP_ADDR=0x...
export L1_ERC20_WARP_ADDR=0x...
export L2_ERC20_WARP_ADDR=0x...
```

Leave these unset for a fresh deployment.

## Architecture

```
                    ┌─────────────────────┐
                    │    Chain Server      │
                    │                     │
                    │  L1 (Anvil) :18545  │
                    │  L2 (op-reth) :18546│
                    │  Builder :13000     │
                    └────────┬────────────┘
                             │ RPC
              ┌──────────────┼──────────────┐
              │              │              │
    ┌─────────▼──────┐  ┌───▼──────────┐  ┌▼─────────────┐
    │ Explorer Server│  │ Main Server  │  │ LoadGen Server│
    │                │  │              │  │  (optional)   │
    │ L2 Explorer    │  │ Dashboard    │  │               │
    │ L1 Explorer    │  │ Load Gen     │  │ Load Gen      │
    │ Privacy Proxy  │  │ Docs         │  │               │
    │ Privacy UI     │  │ Bridge       │  │               │
    └────────────────┘  └──────────────┘  └───────────────┘
```

## Troubleshooting

**Docker not found**: The deploy scripts auto-install Docker via `get.docker.com` if missing.

**Permission denied**: The deploy scripts add the SSH user to the `docker` group automatically. If the first run fails, re-run the deploy command.

**Services not connecting**: Verify that the servers can reach each other on the required ports (13000, 18200, 18545, 18546). Security groups / firewalls must allow inter-server traffic.

**Stale state**: Use the `-clean` variants to tear down and remove volumes before redeploying.
