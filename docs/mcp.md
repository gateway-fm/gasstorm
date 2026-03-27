# GasStorm MCP Server

GasStorm includes a unified [MCP](https://modelcontextprotocol.io/) (Model Context Protocol) server that combines all block builder tools, load generator tools, and Docker Compose stack management into a single server. It exposes 24 tools over stdio transport.

## Setup

### Claude Code

The `.mcp.json` in the repo root auto-configures the server. Open the project in Claude Code and the tools are available immediately.

### OpenCode

The `opencode.json` in the repo root auto-configures the server. Open the project in OpenCode and the tools are available immediately.

### Manual

```bash
# Build and run via stdio (used by MCP clients)
BUILDER_URL=http://localhost:13000 \
LOADGEN_URL=http://localhost:13001 \
GASSTORM_DIR=. \
go run ./mcp
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `BUILDER_URL` | `http://localhost:13000` | Block builder HTTP endpoint |
| `LOADGEN_URL` | `http://localhost:13001` | Load generator HTTP endpoint |
| `GASSTORM_DIR` | `.` | Path to gasstorm repo root (for docker compose and .env) |

## Tools

### Stack Management (7 tools)

#### `stack_status`

Show Docker Compose service states and ports.

**Parameters:** None

#### `stack_up`

Start the GasStorm stack with a profile. **Mutating.**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `profile` | string | No | Docker Compose profile: `reth` (default), `cdk-erigon`, `gravity-reth` |
| `with` | string | No | Optional features CSV: `blob`, `privacy`, `explorer`, `bridge`, `bridge-ui` |
| `metal` | boolean | No | Start in metal mode (core services only) |
| `gasless` | boolean | No | Enable gasless mode (`reth` only) |
| `bridge` | boolean | No | Legacy compatibility flag (same as adding `bridge` to `with`) |
| `bridge_ui` | boolean | No | Legacy compatibility flag (same as adding `bridge-ui` to `with`) |
| `blob` | boolean | No | Legacy compatibility flag (same as adding `blob` to `with`) |

Default `with` behavior:
- `profile=reth` -> `blob,privacy,explorer`
- `profile=cdk-erigon` / `gravity-reth` -> `privacy,explorer`

Validation rules:
- `blob` requires `profile=reth` or `profile=cdk-erigon` (`profile=cdk-erigon` maps to `blob-cdk`)
- `bridge`, `bridge-ui` require `profile=reth`
- `bridge-ui` requires `bridge`
- `metal=true` does not allow optional features

#### `stack_down`

Stop the GasStorm stack. **Mutating.**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `volumes` | boolean | No | Also remove volumes (default: false) |

#### `stack_restart`

Restart a specific service or all services. **Mutating.**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `service` | string | No | Service name (e.g., `block-builder`, `load-generator`). If empty, restarts all. |

#### `stack_logs`

Get recent logs for a service.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `service` | string | Yes | Service name (e.g., `block-builder`, `load-generator`, `l2-reth`) |
| `lines` | number | No | Number of lines to tail (default: 50) |

#### `stack_config`

Read current `.env` configuration values.

**Parameters:** None

#### `stack_config_set`

Update a `.env` value. Requires service restart to take effect. **Mutating.**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `key` | string | Yes | Configuration key (e.g., `BLOCK_TIME_MS`, `GAS_LIMIT`) |
| `value` | string | Yes | New value |

### Block Builder (7 tools)

All [block builder tools](https://github.com/gateway-fm/blockbuilder/blob/main/docs/mcp.md#tools) are available with the same names and parameters: `builder_status`, `builder_health`, `builder_txpool_status`, `builder_txpool_inspect`, `builder_get_nonce`, `builder_send_tx`, `builder_reset_nonces`.

### Load Generator (10 tools)

All [load generator tools](https://github.com/gateway-fm/loadgenerator/blob/main/docs/mcp.md#tools) are available with the same names and parameters: `loadgen_status`, `loadgen_health`, `loadgen_start`, `loadgen_stop`, `loadgen_reset`, `loadgen_recycle`, `loadgen_history`, `loadgen_test_detail`, `loadgen_test_txs`, `loadgen_delete_run`.

## Example Usage

With Claude Code or OpenCode, you can manage the full stack conversationally:

- "Start the stack with the reth profile"
- "Start the stack with reth plus bridge and bridge-ui"
- "Start the stack in metal mode"
- "What's the stack status?"
- "Show me the block builder logs"
- "Set BLOCK_TIME_MS to 250 and restart the block builder"
- "Start a constant 100 TPS uniswap swap test for 60 seconds"
- "What's the builder status? Any circuit breaker issues?"
- "Stop the test and show me the results"
- "Tear down the stack"
