# Regenesis profile

Run a gasstorm stack where the L2 chain (`l2-reth`) is **a cdk-erigon chain re-platformed onto reth-ext**, with the head block's state root and block hash byte-identical to the cdk-erigon source.

The implementation is in companion repositories — this page is the gasstorm-side how-to.

## Required tools

This profile depends on two private gateway-fm repos:

- **`gateway-fm/regenesis-toolkit`** — the standalone tools (state-export, sanitize-chainspec.py, docs).
- **`gateway-fm/reth-ext`** — the reth fork that provides the `genesis-import-cdk` subcommand. The published `gatewayfm/reth-ext` docker image must be built from a commit that includes that subcommand (see the repo's commit "gateway.fm reth-ext fork: OP-style ... + genesis-import-cdk"). Old `:dev` tags won't work.

Clone both alongside gasstorm:

```sh
mkdir -p ~/github/gateway/
cd ~/github/gateway
git clone git@github.com:gateway-fm/regenesis-toolkit.git
git clone --recurse-submodules git@github.com:gateway-fm/reth-ext.git
```

Build the binaries:

```sh
# state-export (vendored inside cdk-erigon — install per regenesis-toolkit/cdk-erigon/README.md)
cd ~/github/gateway/cdk-erigon
cp -r ~/github/gateway/regenesis-toolkit/cdk-erigon/cmd/state-export ./cmd/state-export
GOROOT=/usr/local/go PATH=/usr/local/go/bin:$PATH \
  /usr/local/go/bin/go build -o ./build/bin/state-export ./cmd/state-export/

# reth-ext (genesis-import-cdk lives here)
cd ~/github/gateway/reth-ext
cargo build --release --bin reth-ext
```

Or use a pre-built `gatewayfm/reth-ext:<tag>` image where `<tag>` corresponds to the regenesis-enabled commit.

## End-to-end run

### 1. Import: cdk-erigon datadir → reth-ext datadir

This step happens **on the host**, not inside Docker. The import needs ~8 GB peak RSS and runs ~13 min on Lumia-scale data; better to size against the host than a container.

```sh
cd ~/github/gateway/gasstorm

./scripts/regenesis-bootstrap.sh \
  --src-datadir /path/to/cdk-erigon-datadir \
  --workdir /tmp/my-regenesis

# Optional: --skip-export if you already have a genesis-v2.json under --workdir
# Optional: --skip-import if you already have a populated reth datadir under --workdir
```

After this, you'll have:
- `/tmp/my-regenesis/datadir/` — the populated reth-ext datadir
- `/tmp/my-regenesis/chainspec.json` — the reth-acceptable chainspec
- `./.env.regenesis` — the env file for the next step

### 2. Bring up the stack

```sh
set -a && source .env.regenesis && set +a

docker compose \
  -f docker/docker-compose.yml \
  -f docker/docker-compose-reth-ext.yaml \
  -f docker/docker-compose-regenesis.yaml \
  --profile reth-ext --profile regenesis --profile explorer \
  up -d
```

This:
- Boots `l2-reth` against the pre-populated datadir + chainspec.
- Runs `regenesis-fcu` one-shot — sends a single `engine_forkchoiceUpdatedV3` to wake reth's canonical-chain pointer.
- Brings up the explorer profile (chain-indexer + explorer-api + UI), with the chain-indexer configured to **start at the regenesis head block**, not block 0 (the 0..N-1 range is dummy stub headers from the import — no transactions, not worth indexing).

### 3. Verify

```sh
# Chain ID
curl -s -X POST -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
  http://localhost:18545 | jq -r '.result'
# → should equal the source's chainId

# Head block
curl -s -X POST -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","method":"eth_getBlockByNumber","params":["latest",false],"id":1}' \
  http://localhost:18545 | jq '.result | {number, hash, stateRoot}'
# → should equal the source's block hash + state root byte-for-byte

# Explorer UI
open http://localhost:18100  # or wherever the dashboard exposes the L2 explorer

# Indexer health
curl -s http://localhost:18200/api/blocks?limit=5 | jq
```

## Known caveats

1. **Dummy backfill headers blocks 1..N-1.** The genesis-import-cdk step writes empty stub headers for every block between the chainspec genesis and the regenesis head. These exist on disk but contain no transactions/receipts. The chain-indexer is configured to skip them via `START_BLOCK=$REGENESIS_HEAD_BLOCK_NUM`. If you query e.g. `eth_getBlockByNumber("0x1")` you'll get a near-empty block — that's expected.
2. **The FCU resets if reth restarts.** Reth's canonical-chain pointer is in-memory (for chains where the consensus engine sees no CL). After a `docker compose restart l2-reth`, you may need to re-run the `regenesis-fcu` one-shot:
   ```sh
   docker compose -f docker/docker-compose-regenesis.yaml run --rm regenesis-fcu
   ```
3. **No block production beyond N.** The regenesis chain is a static snapshot of the source at block N. Producing block N+1 onwards would require either (a) a separate sequencer feeding reth via Engine API, or (b) running reth in `--dev` mode (auto-mine; chain ID changes; head hash diverges from source on the next block). The current overlay does neither.
4. **No CDK runtime semantics.** No GERManager precompile, no datastream consumption, no zk-proof submission, no sequencer auth. The regenesis chain runs as vanilla L1. State queries match the source byte-for-byte; transaction execution rules diverge from the CDK chain.
5. **Old `gatewayfm/reth-ext:dev` images won't work.** The image MUST be built from a `gateway-fm/reth-ext` commit that has the `genesis-import-cdk` subcommand. Use `RETH_EXT_VERSION` env var to pin a specific tag.

## Architecture diagram

```
                          ┌──────────────────────────────────────┐
                          │ /path/to/cdk-erigon-datadir          │
                          │   chaindata/mdbx.dat (74 GB)         │
                          └──────────────────┬───────────────────┘
                                             │
       scripts/regenesis-bootstrap.sh        │  (HOST, ~13 min)
       (state-export + sanitize +            │
        reth-ext genesis-import-cdk)         ▼
                          ┌──────────────────────────────────────┐
                          │ /tmp/my-regenesis/                   │
                          │   genesis-v2.json    (5 GB)          │
                          │   chainspec.json     (5 GB)          │
                          │   datadir/           (10 GB)         │
                          │   .env.regenesis                     │
                          └──────────────────┬───────────────────┘
                                             │
                          docker compose with regenesis profile
                                             │
                                             ▼
   ┌──────────────────────────────────────────────────────────────────────┐
   │ docker network: gasstorm                                              │
   │                                                                       │
   │   l2-reth (gatewayfm/reth-ext)                                        │
   │     ↑ HTTP :8545   ↑ Engine :8551                                     │
   │     │              │                                                  │
   │     │              └─ regenesis-fcu (one-shot)                        │
   │     │                                                                 │
   │     └─ chain-indexer  (start_block = N)                               │
   │          ↓                                                            │
   │        chain-indexer-db  (postgres)                                   │
   │          ↓                                                            │
   │        explorer-api                                                   │
   │          ↓                                                            │
   │        explorer-ui                                                    │
   └──────────────────────────────────────────────────────────────────────┘
```

## See also

- `gateway-fm/regenesis-toolkit` — the standalone tools, full docs, source-of-truth for the import pipeline.
- `gateway-fm/reth-ext` — the reth fork carrying `genesis-import-cdk`.
- `docker/docker-compose-reth-ext.yaml` — base reth-ext profile (load-test mode, not regenesis).
- `docker/docker-compose.explorer.yaml` — base explorer profile.
