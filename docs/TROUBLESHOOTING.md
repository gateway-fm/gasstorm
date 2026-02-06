# Troubleshooting

Common issues and solutions for GasStorm.

## Pipeline Stuck / No Blocks Being Produced

**Symptom**: Blocks stop being produced, pending count grows, load test shows 0 TPS.

**Causes and fixes**:

1. **Engine API SYNCING**: op-reth fell behind and returned SYNCING status.
   ```bash
   docker compose logs block-builder | grep -i syncing
   # Fix: restart the stack
   make stop && make run-reth
   ```

2. **Block builder crash**: Check if the container is running.
   ```bash
   docker compose ps block-builder
   docker compose logs --tail 50 block-builder
   ```

3. **op-reth not responding**: Engine API port may be unreachable.
   ```bash
   docker compose logs --tail 50 l2-reth
   ```

## Invalid JWT Errors

**Symptom**: Block builder logs show "invalid JWT" or "unauthorized" errors.

**Fix**: Regenerate the JWT secret and restart services that use it.

```bash
openssl rand -hex 32 > genesis/jwt.hex
docker compose restart l2-reth block-builder
```

Both op-reth and the block builder must share the same `jwt.hex` file.

## Low Throughput (< 100 TPS)

**Diagnosis steps**:

1. Check Engine API latency:
   ```bash
   docker compose logs block-builder | grep -i "latency\|elapsed\|took"
   ```

2. Check pending transaction count:
   ```bash
   curl -s http://localhost:13000/status | jq '.pendingCount'
   ```
   If pending count is growing but TPS is low, the bottleneck is block production.

3. Check block fill rate:
   ```bash
   curl -s http://localhost:13001/api/status | jq '.metrics'
   ```

4. Increase accounts: More accounts distribute nonce contention. Use the dashboard to set higher account counts in test config.

## Nonce Gap / Stuck Transactions

**Symptom**: "nonce too low" or "nonce gap" errors in block builder logs.

**Causes**:
- Load generator nonce tracking fell out of sync with chain state
- Circuit breaker opened and reset nonces

**Fix**: The load generator's circuit breaker should auto-recover. If not:
```bash
# Restart load generator to resync nonces
docker compose restart load-generator
```

## Dashboard Not Connecting

**Symptom**: Dashboard shows "disconnected" or metrics aren't updating.

**Checks**:
1. Verify load generator is running:
   ```bash
   curl http://localhost:13001/api/health
   ```
2. Verify block builder status endpoint:
   ```bash
   curl http://localhost:13000/status
   ```
3. Check browser console for CORS or WebSocket errors.

## Docker / Port Conflicts

**Symptom**: "address already in use" errors on startup.

**Fix**: Stop conflicting services or check what's using the port:
```bash
# Check what's using a specific port
lsof -i :13000

# Stop all GasStorm services
make stop

# Nuclear option: stop and remove all volumes
make clean
```

## Service Port Reference

| Service | Port | Check |
|---------|------|-------|
| block-builder | 13000 | `curl http://localhost:13000/status` |
| preconf WebSocket | 13002 | WebSocket connection |
| load-generator | 13001 | `curl http://localhost:13001/api/health` |
| dashboard | 18000 | `open http://localhost:18000` |
| op-reth RPC | 18546 | `curl -X POST http://localhost:18546 -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'` |

## Getting Help

- Check logs: `make logs` or `docker compose logs -f <service>`
- File an issue: https://github.com/gateway-fm/gasstorm/issues
