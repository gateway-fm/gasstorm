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
make loadtest-external-privacy PRIVACY=<name>
```

This brings up only the **load generator + dashboard + privacy-token-receiver**,
pointed at your proxy. Then:

1. Open the dashboard at <http://localhost:18000>.
2. Log into your privacy proxy separately and copy a fresh JWT.
3. In the load-test panel, choose **Through Privacy Proxy**, **paste the JWT**,
   and click **Start**.

The UI decodes the token's `exp` and **blocks Start** if the token is expired or
would expire before the test finishes (prod tokens are short-lived). Pick a test
duration shorter than the token's remaining lifetime, or paste a fresher token.

`privacyMode`/route-all means all traffic goes through the proxy regardless.

## How it works

`make loadtest-external-privacy` sources `config/privacy/<name>.env` and applies
`docker/docker-compose-external-privacy.yaml`, which sets on the load generator:

| Variable | Effect |
|----------|--------|
| `PRIVACY_RPC_URL` | The external proxy endpoint |
| `PRIVACY_ORG_ID` | Routes requests to `{PRIVACY_RPC_URL}/rpc/{org}` (omit for single-org users) |
| `PRIVACY_ROUTE_ALL=true` | Routes **all** RPC (not just sends) through the proxy with the token |
| `PRIVACY_AUTH_TOKEN_FILE` | `/shared/loadtest-jwt.txt` — written by the receiver from the pasted JWT, re-read each test |
| `PRECONF_WS_URL` (empty) | No preconfirmation WebSocket against an external proxy |

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
