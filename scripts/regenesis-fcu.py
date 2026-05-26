#!/usr/bin/env python3
"""Send a one-shot engine_forkchoiceUpdatedV3 to reth-ext's auth RPC so its
canonical-chain pointer adopts the regenesis-imported head block.

Reads the JWT secret from $JWT_PATH (default: /data/jwt.hex) and the head hash
from $HEAD_HASH. Used by the docker-compose-regenesis.yaml `regenesis-fcu`
one-shot service.
"""
import base64
import hashlib
import hmac
import json
import os
import sys
import time
import urllib.request

JWT_PATH = os.environ.get("JWT_PATH", "/data/jwt.hex")
AUTH_RPC = os.environ.get("AUTH_RPC", "http://l2-reth:8551")
HTTP_RPC = os.environ.get("HTTP_RPC", "http://l2-reth:8545")
HEAD_HASH = os.environ.get("HEAD_HASH")
if not HEAD_HASH:
    print("ERROR: HEAD_HASH env var is required", file=sys.stderr)
    sys.exit(2)


def b64u(b: bytes) -> bytes:
    return base64.urlsafe_b64encode(b).rstrip(b"=")


def make_jwt(secret_hex: str) -> str:
    secret = bytes.fromhex(secret_hex)
    header = b64u(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    claims = b64u(json.dumps({"iat": int(time.time())}, separators=(",", ":")).encode())
    signing_input = header + b"." + claims
    sig = b64u(hmac.new(secret, signing_input, hashlib.sha256).digest())
    return (signing_input + b"." + sig).decode()


def rpc(url: str, method: str, params, headers=None):
    body = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode()
    req = urllib.request.Request(url, body, headers=(headers or {}) | {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


secret_hex = open(JWT_PATH).read().strip()
token = make_jwt(secret_hex)
auth_headers = {"Authorization": f"Bearer {token}"}

print(f"engine_forkchoiceUpdatedV3 → head={HEAD_HASH}")
resp = rpc(
    AUTH_RPC,
    "engine_forkchoiceUpdatedV3",
    [
        {
            "headBlockHash":      HEAD_HASH,
            "safeBlockHash":      HEAD_HASH,
            "finalizedBlockHash": HEAD_HASH,
        },
        None,
    ],
    headers=auth_headers,
)
status = resp.get("result", {}).get("payloadStatus", {}).get("status")
print(f"  status: {status}")
if status != "VALID":
    print(f"  full response: {json.dumps(resp, indent=2)}", file=sys.stderr)
    sys.exit(1)

# Verify via HTTP RPC
time.sleep(0.5)
verify = rpc(HTTP_RPC, "eth_getBlockByNumber", ["latest", False])
result = verify.get("result") or {}
print(f"  eth_getBlockByNumber(latest).hash       = {result.get('hash')}")
print(f"  eth_getBlockByNumber(latest).stateRoot  = {result.get('stateRoot')}")
print(f"  eth_getBlockByNumber(latest).number     = {result.get('number')}")
if result.get("hash") != HEAD_HASH:
    print(f"  WARNING: HTTP RPC returned hash {result.get('hash')!r}, expected {HEAD_HASH!r}", file=sys.stderr)
    sys.exit(1)
print("FCU complete; chain canonical-head adopted.")
