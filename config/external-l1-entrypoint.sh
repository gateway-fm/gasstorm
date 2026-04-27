#!/bin/sh
# Entrypoint script for the external L1 nginx proxy.
# Parses EXTERNAL_L1_RPC (and optional EXTERNAL_L1_WS) to generate an nginx
# config that handles HTTPS upstream, basic auth, and WebSocket upgrades.
# Port 8545 serves both HTTP JSON-RPC and WebSocket (routes WS upgrades to
# the WS backend if EXTERNAL_L1_WS is set).
set -e

if [ -z "${EXTERNAL_L1_RPC:-}" ]; then
  echo "ERROR: EXTERNAL_L1_RPC is not set" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# URL parser
# ---------------------------------------------------------------------------
parse_url() {
  local url="$1" prefix="$2"
  local proto rest userinfo hostpath auth_header=""

  proto="${url%%://*}"
  rest="${url#*://}"

  if echo "$rest" | grep -q '@'; then
    userinfo="${rest%%@*}"
    hostpath="${rest#*@}"
    auth_header=$(printf '%s' "$userinfo" | base64 | tr -d '\n')
  else
    userinfo=""
    hostpath="$rest"
  fi

  local nginx_proto="$proto"
  case "$proto" in
    ws)  nginx_proto="http" ;;
    wss) nginx_proto="https" ;;
  esac

  eval "${prefix}_PROTO=\"$proto\""
  eval "${prefix}_UPSTREAM=\"${nginx_proto}://${hostpath}\""
  eval "${prefix}_AUTH=\"$auth_header\""
}

# ---------------------------------------------------------------------------
# Generate SSL directives
# ---------------------------------------------------------------------------
ssl_block() {
  local proto="$1"
  if [ "$proto" = "https" ] || [ "$proto" = "wss" ]; then
    cat <<BLOCK
        proxy_ssl_server_name on;
        proxy_ssl_verify off;
BLOCK
  fi
}

# ---------------------------------------------------------------------------
# Generate auth directive
# ---------------------------------------------------------------------------
auth_block() {
  local auth="$1"
  if [ -n "$auth" ]; then
    cat <<BLOCK
        proxy_set_header Authorization "Basic ${auth}";
BLOCK
  fi
}

# ---------------------------------------------------------------------------
# Build config
# ---------------------------------------------------------------------------
parse_url "$EXTERNAL_L1_RPC" "RPC"

if [ -n "${EXTERNAL_L1_WS:-}" ]; then
  parse_url "$EXTERNAL_L1_WS" "WS"
fi

CONF=""

# If we have a WS URL, use a map to route upgrades to the WS backend on port 8545
if [ -n "${EXTERNAL_L1_WS:-}" ]; then
  CONF="map \$http_upgrade \$l1_backend {
    default ${RPC_UPSTREAM};
    websocket ${WS_UPSTREAM};
}

map \$http_upgrade \$l1_connection {
    default \"\";
    websocket \"upgrade\";
}


"
fi

# --- Port 8545: HTTP + WS (unified) ---
CONF="${CONF}server {
    listen 8545;
    resolver 127.0.0.11 8.8.8.8 valid=10s;

    location / {
        proxy_hide_header 'Access-Control-Allow-Origin';
        proxy_hide_header 'Access-Control-Allow-Methods';
        proxy_hide_header 'Access-Control-Allow-Headers';
        proxy_hide_header 'Access-Control-Expose-Headers';
        proxy_hide_header 'Access-Control-Max-Age';
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Content-Type' always;
"

if [ -n "${EXTERNAL_L1_WS:-}" ]; then
  # Use map-based routing: HTTP → RPC, WS upgrade → WS backend
  CONF="${CONF}
        set \$backend \$l1_backend;
        proxy_pass \$backend;
        proxy_http_version 1.1;
        proxy_set_header Host \$proxy_host;
        proxy_set_header Content-Type application/json;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$l1_connection;
        proxy_connect_timeout 10s;
        proxy_read_timeout 86400s;
        proxy_send_timeout 30s;
        proxy_next_upstream error timeout http_502 http_503;
        proxy_next_upstream_tries 3;
$(ssl_block "$RPC_PROTO")$(auth_block "$RPC_AUTH")    }
}
"
else
  # HTTP only (no WS URL configured)
  CONF="${CONF}
        set \$backend \"${RPC_UPSTREAM}\";
        proxy_pass \$backend;
        proxy_http_version 1.1;
        proxy_set_header Host \$proxy_host;
        proxy_set_header Content-Type application/json;
        proxy_connect_timeout 10s;
        proxy_read_timeout 30s;
        proxy_send_timeout 30s;
        proxy_next_upstream error timeout http_502 http_503;
        proxy_next_upstream_tries 3;
$(ssl_block "$RPC_PROTO")$(auth_block "$RPC_AUTH")    }
}
"
fi

# --- Port 8546: dedicated WS (if configured) ---
if [ -n "${EXTERNAL_L1_WS:-}" ]; then
  CONF="${CONF}
server {
    listen 8546;
    resolver 127.0.0.11 8.8.8.8 valid=10s;

    location / {
        set \$ws_backend \"${WS_UPSTREAM}\";
        proxy_pass \$ws_backend;
        proxy_http_version 1.1;
        proxy_set_header Host \$proxy_host;
        proxy_set_header Content-Type application/json;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \"upgrade\";
        proxy_connect_timeout 10s;
        proxy_read_timeout 86400s;
        proxy_send_timeout 30s;
$(ssl_block "$WS_PROTO")$(auth_block "$WS_AUTH")    }
}
"
fi

# Write and start nginx
echo "$CONF" > /etc/nginx/conf.d/default.conf

rm -f /etc/nginx/templates/default.conf.template 2>/dev/null || true
rm -f /etc/nginx/conf.d/default.conf.template 2>/dev/null || true

echo "External L1 proxy configured:"
echo "  RPC -> ${RPC_UPSTREAM}"
if [ -n "${EXTERNAL_L1_WS:-}" ]; then
  echo "  WS  -> ${WS_UPSTREAM}"
  echo "  Port 8545 routes WS upgrades to WS backend"
fi

exec nginx -g "daemon off;"
