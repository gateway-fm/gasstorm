#!/bin/bash
# Stop all Metal mode services via PID files
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DATA_DIR="${PROJECT_DIR}/data/metal"
PID_DIR="$DATA_DIR/pids"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Services in reverse start order (dashboard first, L1 last)
SERVICES="dashboard loadgen blockbuilder reth l1"

if [ ! -d "$PID_DIR" ]; then
    log_warn "No PID directory found at $PID_DIR — metal mode may not be running."
    exit 0
fi

stopped=0

for svc in $SERVICES; do
    pid_file="$PID_DIR/${svc}.pid"
    if [ ! -f "$pid_file" ]; then
        continue
    fi

    pid=$(cat "$pid_file" 2>/dev/null)
    if [ -z "$pid" ]; then
        rm -f "$pid_file"
        continue
    fi

    if kill -0 "$pid" 2>/dev/null; then
        log_info "Stopping $svc (PID $pid)..."
        kill "$pid" 2>/dev/null || true
        stopped=$((stopped + 1))

        # Give reth extra time to flush state
        if [ "$svc" = "reth" ]; then
            sleep 2
        fi
    else
        log_warn "$svc (PID $pid) already stopped"
    fi

    rm -f "$pid_file"
done

# Wait a moment for processes to exit
if [ $stopped -gt 0 ]; then
    sleep 1
fi

# Verify all stopped
remaining=0
for svc in $SERVICES; do
    pid_file="$PID_DIR/${svc}.pid"
    if [ -f "$pid_file" ]; then
        pid=$(cat "$pid_file" 2>/dev/null)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            log_warn "$svc (PID $pid) still running, sending SIGKILL..."
            kill -9 "$pid" 2>/dev/null || true
            remaining=$((remaining + 1))
        fi
        rm -f "$pid_file"
    fi
done

if [ $stopped -eq 0 ] && [ $remaining -eq 0 ]; then
    log_warn "No metal mode services were running."
else
    log_success "All metal mode services stopped."
fi
