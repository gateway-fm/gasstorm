# Execution Layers

The system supports multiple execution layer backends via a capability-based architecture.

## Mode Comparison

| Feature | reth | cdk-erigon | gravity-reth |
|---------|------|------------|--------------|
| Block Builder | External | None (direct) | None (direct) |
| Preconfirmations | Yes | No | No |
| Builder Status API | Yes | No | No |
| Block Metrics WS | Yes | No | No |
| Engine API | op-reth | N/A | N/A |
| TX Port | 13000 | 18545 | 8545 |

## Architecture

### reth Mode (Default)

Uses the custom block-builder with op-reth via Engine API.

```
load-generator → block-builder:13000 → op-reth Engine API:8551
```

**Features:**
- Sub-second block times (configurable via `BLOCK_TIME_MS`)
- WebSocket preconfirmations on port 13002
- Nonce caching and filtering
- Transaction ordering (fifo, tip_desc, tip_asc)

**Configuration:**
```bash
make run-reth BLOCK_TIME_MS=250 ENABLE_PRECONFIRMATIONS=true
```

### cdk-erigon Mode

Uses Polygon's cdk-erigon as a standalone sequencer. Block-builder is bypassed.

```
load-generator → cdk-erigon:8545 (direct sequencer)
```

**Features:**
- Built-in sequencer
- No preconfirmations
- Higher TPS potential for simple transfers

**Configuration:**
```bash
EXECUTION_LAYER=cdk-erigon make run-cdk-erigon
```

### gravity-reth Mode

High-performance parallel EVM with Grevm. Direct sequencer mode.

```
load-generator → gravity-reth:8545 (direct sequencer)
```

**Features:**
- Parallel EVM execution
- No preconfirmations
- Compiled from Rust source (15-25 min initial build)

**Configuration:**
```bash
EXECUTION_LAYER=gravity-reth make run-gravity-reth
```

## Capability-Based Architecture

The load-generator uses capability checks instead of string comparisons:

```go
// load-generator/internal/execnode/capabilities.go
type ExecutionLayerCapabilities struct {
    Name                     string
    HasExternalBlockBuilder  bool   // true = uses block-builder, false = direct sequencer
    SupportsPreconfirmations bool   // WebSocket preconf events
    SupportsBuilderStatusAPI bool   // GET /status endpoint
    SupportsBlockMetricsWS   bool   // WebSocket /ws/block-metrics
}
```

### Capability Functions

**reth:**
```go
func NewRethCapabilities() *ExecutionLayerCapabilities {
    return &ExecutionLayerCapabilities{
        Name:                     "reth",
        HasExternalBlockBuilder:  true,
        SupportsPreconfirmations: true,
        SupportsBuilderStatusAPI: true,
        SupportsBlockMetricsWS:   true,
    }
}
```

**cdk-erigon:**
```go
func NewCdkErigonCapabilities() *ExecutionLayerCapabilities {
    return &ExecutionLayerCapabilities{
        Name:                     "cdk-erigon",
        HasExternalBlockBuilder:  false,
        SupportsPreconfirmations: false,
        SupportsBuilderStatusAPI: false,
        SupportsBlockMetricsWS:   false,
    }
}
```

**gravity-reth:**
```go
func NewGravityRethCapabilities() *ExecutionLayerCapabilities {
    return &ExecutionLayerCapabilities{
        Name:                     "gravity-reth",
        HasExternalBlockBuilder:  false,
        SupportsPreconfirmations: false,
        SupportsBuilderStatusAPI: false,
        SupportsBlockMetricsWS:   false,
    }
}
```

## Adding a New Execution Layer

1. Add capability function in `load-generator/internal/execnode/registry.go`:

```go
func NewNodeCapabilities() *ExecutionLayerCapabilities {
    return &ExecutionLayerCapabilities{
        Name:                     "new-node",
        HasExternalBlockBuilder:  false,  // or true if uses block-builder
        SupportsPreconfirmations: false,
        SupportsBuilderStatusAPI: false,
        SupportsBlockMetricsWS:   false,
    }
}
```

2. Register in `DefaultRegistry()`:

```go
func DefaultRegistry() *CapabilityRegistry {
    return &CapabilityRegistry{
        layers: map[string]LayerCapability{
            "reth":         NewRethCapabilities(),
            "cdk-erigon":   NewCdkErigonCapabilities(),
            "gravity-reth": NewGravityRethCapabilities(),
            "new-node":     NewNodeCapabilities(),  // Add here
        },
    }
}
```

3. Create `docker-compose-new-node.yaml`:

```yaml
services:
  new-node:
    image: new-node:latest
    ports:
      - "8545:8545"
    environment:
      - RPC_URL=http://new-node:8545
```

4. Add Makefile target:

```makefile
run-new-node:
    docker compose -f docker-compose-base.yaml -f docker-compose-new-node.yaml up --build -d
```

**No changes needed to:** load-generator logic, dashboard code, API handlers.

See [Configuration](./configuration.md) for complete env var and Makefile reference.
