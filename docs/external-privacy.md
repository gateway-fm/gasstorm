# Load-testing an external privacy proxy

Point GasStorm's load generator at a **third party's already-configured privacy
proxy** and run load tests against it — without building or running the bundled
privacy proxy, privacy DB, or a local chain.

In this mode the proxy is the **only** RPC endpoint: every call (nonce queries,
account funding, `eth_sendRawTransaction`, receipts, on-chain verification) is
routed through the proxy and authenticated with a JWT.

## Prerequisites (on the proxy operator's side)

1. A reachable privacy-proxy RPC URL.
2. A way to obtain a Bearer **JWT** for a proxy user (DID) that already has RBAC
   permission for the methods the load test calls — at minimum:
   `eth_sendRawTransaction`, `eth_getTransactionCount`, `eth_getBlockByNumber`,
   `eth_getTransactionReceipt`, `eth_getBalance`, `eth_chainId`, `eth_gasPrice`.
   The load generator's sender addresses must also be authorised/linked as the
   proxy requires.
3. If that user belongs to **more than one org**, the org UUID to route through
   (`/rpc/{org}`) — a bare `/rpc` is ambiguous and the proxy denies it.

## How the token gets in

A prod proxy **can't be authenticated programmatically** (real DID/wallet or IdP
login is a human action). So you authenticate yourself, copy the short-lived JWT,
and **paste it into the dashboard**. The dashboard POSTs it to a small
`privacy-token-receiver` service, which writes it to the shared token file the
load generator reads. The load generator stays a pure token consumer.

## Build prerequisites

The standalone stack **builds from source** — the dashboard from this repo's
`dashboard/`, and the load generator from the
[`loadgenerator`](https://github.com/gateway-fm/loadgenerator) repo, which must
be cloned **as a sibling of this repo**:

```
parent/
├── gasstorm/        # this repo
└── loadgenerator/   # git clone https://github.com/gateway-fm/loadgenerator
```

```bash
git clone https://github.com/gateway-fm/loadgenerator ../loadgenerator
```

(`make loadtest-standalone` checks for `../loadgenerator` and errors with this
hint if it's missing.) The only image pulled is `postgres:15-alpine` for the
token receiver — no private/bundled images.

## Setup

```bash
cp config/privacy/example.env config/privacy/<name>.env
# edit <name>.env: set PRIVACY_RPC_URL and (if multi-org) PRIVACY_ORG_ID
```

Only the **stable** settings (proxy URL + org) live in the file. The JWT is not
stored — you paste it per session. `config/privacy/*.env` is git-ignored (only
`example.env` is tracked).

## Run

```bash
make loadtest-standalone PRIVACY=<name>
```

(`make loadtest-external-privacy` is kept as an alias.)

This brings up **only** the **load generator + dashboard + privacy-token-receiver**
(from `docker/docker-compose-standalone.yaml`), pointed at your proxy. It pulls in
**none** of the bundled services — no privacy proxy, block explorer, chain
indexer, L1/L2, bridge, etc. — and needs no pre-existing volumes or network, so
it runs on a fresh checkout. The load generator builds from the sibling
`../loadgenerator` repo and the dashboard from this repo's `dashboard/`. Then:

1. Open the dashboard at <http://localhost:18000>.
2. Log into your privacy proxy separately and copy a fresh JWT.
3. In the load-test panel, choose **Through Privacy Proxy**, **paste the JWT**,
   and click **Start**.

The UI decodes the token's `exp` and **blocks Start** if the token is expired or
would expire before the test finishes (prod tokens are short-lived). Pick a test
duration shorter than the token's remaining lifetime, or paste a fresher token.

`privacyMode`/route-all means all traffic goes through the proxy regardless.

## Gasless networks (no faucet keys needed)

If the target chain has **zero gas fees** and self-authorizes senders by
signature (`eth_sendRawTransaction`), you don't need funded or pre-authorized
keys at all. Set `GASLESS=true` in `config/privacy/<name>.env` (or flip the
dashboard **Gasless network** toggle per test). The load generator then:

- **skips account funding** — random accounts send immediately, no faucet,
- sends **0-value** ETH transfers (nothing to move, so no balance required),
- uses **zero** gas tip and fee caps.

Only the `eth-transfer` transaction type is supported in gasless mode (contract
types need a funded deployer). On a chain whose base fee is **0**, a
`maxFeePerGas=0` transaction is accepted; on a chain with any non-zero base fee
these transactions are rejected as underpriced, so leave `GASLESS` off there.

## How it works

`make loadtest-standalone` sources `config/privacy/<name>.env` and runs only
`docker/docker-compose-standalone.yaml`, which sets on the load generator:

| Variable | Effect |
|----------|--------|
| `PRIVACY_RPC_URL` | The external proxy endpoint |
| `PRIVACY_ORG_ID` | Routes requests to `{PRIVACY_RPC_URL}/rpc/{org}` (omit for single-org users) |
| `PRIVACY_ROUTE_ALL=true` | Routes **all** RPC (not just sends) through the proxy with the token |
| `PRIVACY_AUTH_TOKEN_FILE` | `/shared/loadtest-jwt.txt` — written by the receiver from the pasted JWT, re-read each test |
| `PRECONF_WS_URL` (empty) | No preconfirmation WebSocket against an external proxy |
| `GASLESS` | `true` on zero-fee chains: skip funding, send 0-value transfers, zero gas (see above) |

Token delivery: dashboard paste → `POST /api/privacy-token/token` (nginx →
`privacy-token-receiver:8080`) → writes `/shared/loadtest-jwt.txt` → the load
generator re-reads it at the start of each test.

## Reading results

- **Throughput / latency / sent / failed** and the on-chain **verification
  summary** are the metrics that matter here. A successful run shows `failed=0`
  and an on-chain verified tx count close to sent.
- The live **`txConfirmed`/preconfirmation** counters will read **0**: those rely
  on the builder's preconfirmation WebSocket, which an external prod proxy does
  not expose. Confirmation is established by **on-chain verification** (block
  polling through the proxy) at the end of the run — see the test history /
  `onChainTxCount`, not the live confirmed counter.

## Notes

- JWT lifetime is controlled by the proxy. If you see `HTTP 401`, your token has
  expired — paste a fresh one.
- `HTTP 404` on a method means the proxy's RBAC denies it for your user — grant
  the method (proxy side) and retry.
- `HTTP 429 "too many concurrent requests"` means you exceeded the proxy's
  per-user concurrency cap (`MAX_CONCURRENT_REQUESTS`) — lower the target TPS or
  raise that cap on the proxy.
