#!/usr/bin/env python3
"""Privacy token receiver.

Tiny HTTP endpoint for PROD/external privacy load testing: the dashboard POSTs a
JWT (obtained by the user logging into the privacy proxy) and this writes it to
the shared token file that the load generator reads. Keeps token delivery out of
the load generator (which stays a pure file consumer) and out of the browser
(which can't write the volume).

POST /token   body: {"token":"<jwt>", "orgId":"<uuid optional>"}
GET  /healthz
"""
import http.server
import json
import os

TOKEN_FILE = os.environ.get("PRIVACY_AUTH_TOKEN_FILE", "/shared/loadtest-jwt.txt")
ORG_ID_FILE = os.environ.get("PRIVACY_ORG_ID_FILE", "/shared/loadtest-org-id.txt")
LISTEN_PORT = int(os.environ.get("RECEIVER_PORT", "8080"))


def _looks_like_jwt(tok: str) -> bool:
    # header.payload.signature — three base64url segments
    return tok.count(".") == 2 and all(p for p in tok.split("."))


class Handler(http.server.BaseHTTPRequestHandler):
    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.rstrip("/") == "/healthz":
            return self._json(200, {"ok": True})
        return self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path.rstrip("/") != "/token":
            return self._json(404, {"error": "not found"})
        try:
            n = int(self.headers.get("Content-Length", "0"))
            data = json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            return self._json(400, {"error": "invalid JSON body"})

        token = (data.get("token") or "").strip()
        org_id = (data.get("orgId") or "").strip()
        if not _looks_like_jwt(token):
            return self._json(400, {"error": "value is not a JWT (expected header.payload.signature)"})

        os.makedirs(os.path.dirname(TOKEN_FILE), exist_ok=True)
        with open(TOKEN_FILE, "w") as f:
            f.write(token + "\n")
        if org_id:
            with open(ORG_ID_FILE, "w") as f:
                f.write(org_id + "\n")
        self._json(200, {"ok": True, "orgIdWritten": bool(org_id)})

    def log_message(self, *args):  # silence per-request access logs
        pass


if __name__ == "__main__":
    print(f"[privacy-token-receiver] listening on :{LISTEN_PORT}, token file {TOKEN_FILE}", flush=True)
    http.server.HTTPServer(("0.0.0.0", LISTEN_PORT), Handler).serve_forever()
