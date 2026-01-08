.PHONY: run stop restart logs status clean build test test-block-builder test-load-generator test-dashboard test-tx bench-block-builder bench-load-generator polycli-install polycli-eoa polycli-erc20 polycli-erc721 polycli-uniswap polycli-store polycli-mixed polycli-help dev dev-infra dev-builder dev-loadgen dev-dashboard dev-stop

# =============================================================================
# Configuration: Source .env file if it exists
# =============================================================================
-include .env
export

# =============================================================================
# Polycli Configuration
# =============================================================================
POLYCLI_RPC ?= http://localhost:13000
POLYCLI_TPS ?= 100
POLYCLI_DURATION ?= 30
POLYCLI_CONCURRENCY ?= 10
POLYCLI_ACCOUNTS ?= 10
POLYCLI_PRIVATE_KEY ?= 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
POLYCLI_GAS_MULTIPLIER ?= 1.5
POLYCLI_FUND_AMOUNT ?= 10000000000000000000

# =============================================================================
# Default Configuration (uses .env or inline defaults)
# =============================================================================

# Start the system (builds if needed) - uses .env configuration
run:
	docker compose up --build -d

# Start with logs attached
run-attached:
	docker compose up --build

# =============================================================================
# Performance Profiles
# =============================================================================

# High throughput: 1 gigagas, 100ms blocks, pipelining enabled
run-high-throughput:
	GAS_LIMIT=1000000000 \
	MAX_TXS_PER_BLOCK=50000 \
	BLOCK_TIME_MS=100 \
	ENABLE_PIPELINING=true \
	docker compose up --build -d

# Fast confirmations: 150M gas, 50ms blocks
run-fast-confirm:
	GAS_LIMIT=150000000 \
	MAX_TXS_PER_BLOCK=7000 \
	BLOCK_TIME_MS=50 \
	docker compose up --build -d

# Experimental: All features enabled
run-experimental:
	GAS_LIMIT=1000000000 \
	MAX_TXS_PER_BLOCK=50000 \
	BLOCK_TIME_MS=100 \
	ENABLE_PIPELINING=true \
	ENABLE_PRECONFIRMATIONS=true \
	docker compose up --build -d

# Conservative: Smaller blocks, longer intervals (for stability testing)
run-conservative:
	GAS_LIMIT=30000000 \
	MAX_TXS_PER_BLOCK=1000 \
	BLOCK_TIME_MS=2000 \
	SKIP_EMPTY_BLOCKS=false \
	docker compose up --build -d

# Flashblocks-style: 500ms blocks with preconfirmations
run-flashblocks:
	GAS_LIMIT=500000000 \
	MAX_TXS_PER_BLOCK=25000 \
	BLOCK_TIME_MS=500 \
	ENABLE_PRECONFIRMATIONS=true \
	docker compose up --build -d

# Stop all services
stop:
	docker compose down

# Restart all services
restart:
	docker compose down && docker compose up --build -d

# View logs (follow mode)
logs:
	docker compose logs -f

# View logs for specific service (usage: make logs-service SERVICE=block-builder)
logs-service:
	docker compose logs -f $(SERVICE)

# Show status of all services
status:
	docker compose ps

# Clean up volumes and rebuild
clean:
	docker compose down -v
	docker system prune -f

# Build without starting
build:
	docker compose build

# =============================================================================
# Testing
# =============================================================================

# Run all tests with race detector
test: test-block-builder test-load-generator test-dashboard

# Test block-builder (Go)
test-block-builder:
	cd block-builder && go test -race -v ./...

# Test load-generator (Go)
test-load-generator:
	cd load-generator && go test -race -v ./...

# Test dashboard (Next.js - lint only for now)
test-dashboard:
	cd dashboard && npm run lint

# Run benchmarks for block-builder
bench-block-builder:
	cd block-builder && go test -bench=. -benchmem ./...

# Run benchmarks for load-generator
bench-load-generator:
	cd load-generator && go test -bench=. -benchmem ./...

# Send a test transaction (integration test)
test-tx:
	cast send --rpc-url http://localhost:13000 \
		--private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
		0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
		--value 1ether

# Check L2 balance
balance:
	cast balance 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 --rpc-url http://localhost:18546

# Start with AggLayer profile
run-agglayer:
	docker compose --profile agglayer up -d

# Stop AggLayer
stop-agglayer:
	docker compose --profile agglayer down

# =============================================================================
# Polycli Load Testing
# =============================================================================

# Install polygon-cli if not found
polycli-install:
	@if ! command -v polygon-cli >/dev/null 2>&1; then \
		echo "Installing polygon-cli via go install..."; \
		go install github.com/0xPolygon/polygon-cli@latest; \
		echo "polygon-cli installed to $(shell go env GOPATH)/bin/polygon-cli"; \
	else \
		echo "polygon-cli already installed: $$(which polygon-cli)"; \
	fi

# Base polycli command (requires polygon-cli in PATH)
# Uses multiple sending accounts to avoid nonce contention with high concurrency
POLYCLI_BASE = polygon-cli loadtest \
	--rpc-url $(POLYCLI_RPC) \
	--private-key $(POLYCLI_PRIVATE_KEY) \
	--requests $(POLYCLI_TPS) \
	--time-limit $(POLYCLI_DURATION) \
	--concurrency $(POLYCLI_CONCURRENCY) \
	--sending-accounts-count $(POLYCLI_ACCOUNTS) \
	--account-funding-amount $(POLYCLI_FUND_AMOUNT) \
	--pre-fund-sending-accounts \
	--adaptive-rate-limit \
	--gas-price-multiplier $(POLYCLI_GAS_MULTIPLIER)

# Check polygon-cli is installed before running
define CHECK_POLYCLI
	@if ! command -v polygon-cli >/dev/null 2>&1; then \
		echo "Error: polygon-cli not found. Run 'make polycli-install' first."; \
		exit 1; \
	fi
endef

# EOA transfers (simple ETH sends - 21k gas each)
polycli-eoa:
	$(CHECK_POLYCLI)
	@echo "Running polycli EOA transfer load test..."
	@echo "  TPS: $(POLYCLI_TPS), Duration: $(POLYCLI_DURATION)s, Concurrency: $(POLYCLI_CONCURRENCY), Accounts: $(POLYCLI_ACCOUNTS)"
	$(POLYCLI_BASE) --mode t

# ERC20 transfers
polycli-erc20:
	$(CHECK_POLYCLI)
	@echo "Running polycli ERC20 transfer load test..."
	@echo "  TPS: $(POLYCLI_TPS), Duration: $(POLYCLI_DURATION)s, Concurrency: $(POLYCLI_CONCURRENCY), Accounts: $(POLYCLI_ACCOUNTS)"
	$(POLYCLI_BASE) --mode 2

# ERC721 mints
polycli-erc721:
	$(CHECK_POLYCLI)
	@echo "Running polycli ERC721 mint load test..."
	@echo "  TPS: $(POLYCLI_TPS), Duration: $(POLYCLI_DURATION)s, Concurrency: $(POLYCLI_CONCURRENCY), Accounts: $(POLYCLI_ACCOUNTS)"
	$(POLYCLI_BASE) --mode 7

# Uniswap V3 swaps
polycli-uniswap:
	$(CHECK_POLYCLI)
	@echo "Running polycli Uniswap V3 swap load test..."
	@echo "  TPS: $(POLYCLI_TPS), Duration: $(POLYCLI_DURATION)s, Concurrency: $(POLYCLI_CONCURRENCY), Accounts: $(POLYCLI_ACCOUNTS)"
	$(POLYCLI_BASE) --mode v3

# Storage writes (contract state)
polycli-store:
	$(CHECK_POLYCLI)
	@echo "Running polycli storage write load test..."
	@echo "  TPS: $(POLYCLI_TPS), Duration: $(POLYCLI_DURATION)s, Concurrency: $(POLYCLI_CONCURRENCY), Accounts: $(POLYCLI_ACCOUNTS)"
	$(POLYCLI_BASE) --mode s

# Mixed workload (default polycli behavior)
polycli-mixed:
	$(CHECK_POLYCLI)
	@echo "Running polycli mixed workload..."
	@echo "  TPS: $(POLYCLI_TPS), Duration: $(POLYCLI_DURATION)s, Concurrency: $(POLYCLI_CONCURRENCY), Accounts: $(POLYCLI_ACCOUNTS)"
	$(POLYCLI_BASE)

# Polycli help
polycli-help:
	@echo "Polycli Load Test Targets:"
	@echo "  make polycli-install  - Install polycli via go install"
	@echo "  make polycli-eoa      - EOA transfers (21k gas)"
	@echo "  make polycli-erc20    - ERC20 transfers"
	@echo "  make polycli-erc721   - ERC721 mints"
	@echo "  make polycli-uniswap  - Uniswap V3 swaps"
	@echo "  make polycli-store    - Storage writes"
	@echo "  make polycli-mixed    - Mixed workload"
	@echo ""
	@echo "Configuration (env vars or command line):"
	@echo "  POLYCLI_TPS=100            - Requests per second (default: 100)"
	@echo "  POLYCLI_DURATION=30        - Test duration in seconds (default: 30)"
	@echo "  POLYCLI_CONCURRENCY=10     - Concurrent workers (default: 10)"
	@echo "  POLYCLI_ACCOUNTS=10        - Sending accounts to generate (default: 10)"
	@echo "  POLYCLI_GAS_MULTIPLIER=1.5 - Gas price multiplier (default: 1.5)"
	@echo ""
	@echo "Features enabled by default:"
	@echo "  - Multiple sending accounts (avoids nonce contention)"
	@echo "  - Adaptive rate limiting (AIMD congestion control)"
	@echo "  - Pre-funded accounts (faster startup)"
	@echo ""
	@echo "Example: make polycli-eoa POLYCLI_TPS=500 POLYCLI_DURATION=60"

# =============================================================================
# Local Development (HMR)
# =============================================================================

# Start just the blockchain infrastructure in Docker
dev-infra:
	docker compose up -d l1 l2-reth
	@echo "Waiting for L1 and L2 to be ready..."
	@sleep 3
	@echo "Infrastructure ready. L1: localhost:18545, L2: localhost:18546"

# Run block-builder locally (requires dev-infra)
dev-builder:
	cd block-builder && \
	ENGINE_RPC_URL=http://localhost:18551 \
	L2_RPC_URL=http://localhost:18546 \
	JWT_SECRET_PATH=../genesis/jwt.hex \
	SEQUENCER_ADDRESS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
	LISTEN_ADDR=:13000 \
	PRECONF_LISTEN_ADDR=:13002 \
	BLOCK_TIME_MS=$${BLOCK_TIME_MS:-150} \
	SKIP_EMPTY_BLOCKS=$${SKIP_EMPTY_BLOCKS:-true} \
	GAS_LIMIT=$${GAS_LIMIT:-1000000000} \
	MAX_TXS_PER_BLOCK=$${MAX_TXS_PER_BLOCK:-50000} \
	TX_ORDERING=$${TX_ORDERING:-tip_desc} \
	ENABLE_PIPELINING=$${ENABLE_PIPELINING:-false} \
	ENABLE_PRECONFIRMATIONS=$${ENABLE_PRECONFIRMATIONS:-true} \
	go run .

# Run load-generator locally (requires dev-infra and dev-builder)
dev-loadgen:
	cd load-generator && \
	BUILDER_RPC_URL=http://localhost:13000 \
	L2_RPC_URL=http://localhost:18546 \
	PRECONF_WS_URL=ws://localhost:13002/ws/preconfirmations \
	LISTEN_ADDR=:13001 \
	DATABASE_PATH=./loadgen-dev.db \
	go run ./cmd/loadgen

# Run dashboard with HMR (requires dev-loadgen for API calls)
dev-dashboard:
	cd dashboard && npm run dev

# Stop dev infrastructure
dev-stop:
	docker compose stop l1 l2-reth
	@echo "Dev infrastructure stopped"

# Full local dev: run all services with cleanup on Ctrl+C
dev:
	@echo "=== Starting Local Development Mode ==="
	@echo "Killing any processes on ports 3000, 13000, 13001, 13002..."
	@-lsof -ti :3000 | xargs kill -9 2>/dev/null || true
	@-lsof -ti :13000 | xargs kill -9 2>/dev/null || true
	@-lsof -ti :13001 | xargs kill -9 2>/dev/null || true
	@-lsof -ti :13002 | xargs kill -9 2>/dev/null || true
	@if [ -f .env ]; then echo "Loading .env file..."; set -a; . ./.env; set +a; fi
	@docker compose up -d l1 l2-reth
	@echo "Waiting for L1/L2..."
	@sleep 3
	@echo "Starting services... (Ctrl+C to stop all)"
	@bash -c '\
		if [ -f .env ]; then set -a; . ./.env; set +a; fi; \
		cleanup() { \
			echo ""; \
			echo "Shutting down..."; \
			kill $$BUILDER_PID $$LOADGEN_PID $$DASHBOARD_PID 2>/dev/null; \
			wait $$BUILDER_PID $$LOADGEN_PID $$DASHBOARD_PID 2>/dev/null; \
			docker compose stop l1 l2-reth; \
			echo "Done."; \
			exit 0; \
		}; \
		trap cleanup INT TERM; \
		\
		( cd block-builder && \
		  ENGINE_RPC_URL=http://localhost:18551 \
		  L2_RPC_URL=http://localhost:18546 \
		  JWT_SECRET_PATH=../genesis/jwt.hex \
		  SEQUENCER_ADDRESS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
		  LISTEN_ADDR=:13000 \
		  PRECONF_LISTEN_ADDR=:13002 \
		  BLOCK_TIME_MS=$${BLOCK_TIME_MS:-150} \
		  SKIP_EMPTY_BLOCKS=$${SKIP_EMPTY_BLOCKS:-true} \
		  GAS_LIMIT=$${GAS_LIMIT:-1000000000} \
		  MAX_TXS_PER_BLOCK=$${MAX_TXS_PER_BLOCK:-50000} \
		  TX_ORDERING=$${TX_ORDERING:-tip_desc} \
		  ENABLE_PIPELINING=$${ENABLE_PIPELINING:-false} \
		  ENABLE_PRECONFIRMATIONS=$${ENABLE_PRECONFIRMATIONS:-true} \
		  go run . 2>&1 | sed "s/^/[builder] /" ) & \
		BUILDER_PID=$$!; \
		sleep 2; \
		\
		( cd load-generator && \
		  BUILDER_RPC_URL=http://localhost:13000 \
		  L2_RPC_URL=http://localhost:18546 \
		  PRECONF_WS_URL=ws://localhost:13002/ws/preconfirmations \
		  LISTEN_ADDR=:13001 \
		  DATABASE_PATH=./loadgen-dev.db \
		  go run ./cmd/loadgen 2>&1 | sed "s/^/[loadgen] /" ) & \
		LOADGEN_PID=$$!; \
		sleep 1; \
		\
		( cd dashboard && npm run dev 2>&1 | sed "s/^/[dashboard] /" ) & \
		DASHBOARD_PID=$$!; \
		\
		echo ""; \
		echo "=== All services running ==="; \
		echo "  Dashboard:      http://localhost:3000"; \
		echo "  Block Builder:  http://localhost:13000"; \
		echo "  Load Generator: http://localhost:13001"; \
		echo ""; \
		echo "Press Ctrl+C to stop all services"; \
		echo ""; \
		wait \
	'

# Show help
help:
	@echo "Available commands:"
	@echo ""
	@echo "  Basic:"
	@echo "    make run              - Start system (uses .env config)"
	@echo "    make run-attached     - Start system with logs"
	@echo "    make stop             - Stop all services"
	@echo "    make restart          - Restart all services"
	@echo "    make logs             - Follow all logs"
	@echo "    make status           - Show service status"
	@echo "    make clean            - Stop and remove volumes"
	@echo "    make build            - Build without starting"
	@echo ""
	@echo "  Performance Profiles (override .env):"
	@echo "    make run-high-throughput  - 1B gas, 100ms, pipelining (max TPS)"
	@echo "    make run-fast-confirm     - 150M gas, 50ms blocks (low latency)"
	@echo "    make run-experimental     - All features enabled"
	@echo "    make run-conservative     - 30M gas, 2s blocks (stability)"
	@echo "    make run-flashblocks      - 500M gas, 500ms + preconfirmations"
	@echo ""
	@echo "  Testing:"
	@echo "    make test             - Run all tests (with race detector)"
	@echo "    make test-block-builder  - Test block-builder only"
	@echo "    make test-load-generator - Test load-generator only"
	@echo "    make test-dashboard      - Lint dashboard"
	@echo "    make bench-block-builder - Run block-builder benchmarks"
	@echo "    make bench-load-generator - Run load-generator benchmarks"
	@echo "    make test-tx          - Send a test transaction"
	@echo "    make balance          - Check test account balance"
	@echo ""
	@echo "  AggLayer:"
	@echo "    make run-agglayer     - Start with AggLayer stack"
	@echo ""
	@echo "  Local Development (HMR):"
	@echo "    make dev              - Run all services locally with HMR (Ctrl+C to stop)"
	@echo "    make dev-infra        - Start only L1/L2 in Docker"
	@echo "    make dev-builder      - Run only block-builder locally"
	@echo "    make dev-loadgen      - Run only load-generator locally"
	@echo "    make dev-dashboard    - Run only dashboard with HMR"
	@echo "    make dev-stop         - Stop dev infrastructure"
	@echo ""
	@echo "  Polycli Load Testing:"
	@echo "    make polycli-install  - Install polycli via go install"
	@echo "    make polycli-eoa      - EOA transfers (21k gas)"
	@echo "    make polycli-erc20    - ERC20 transfers"
	@echo "    make polycli-erc721   - ERC721 mints"
	@echo "    make polycli-uniswap  - Uniswap V3 swaps"
	@echo "    make polycli-store    - Storage writes"
	@echo "    make polycli-mixed    - Mixed workload"
	@echo "    make polycli-help     - Full polycli options"
	@echo ""
	@echo "  Configuration (.env file - sourced automatically):"
	@echo "    GAS_LIMIT             - Block gas limit (default: 1000000000)"
	@echo "    MAX_TXS_PER_BLOCK     - Max txs per block (default: 50000)"
	@echo "    BLOCK_TIME_MS         - Block interval ms (default: 1000)"
	@echo "    ENABLE_PIPELINING     - Overlap block production (default: true)"
	@echo "    ENABLE_PRECONFIRMATIONS - WebSocket tx streaming (default: true)"
	@echo ""
	@echo "  Example: Override .env on command line:"
	@echo "    BLOCK_TIME_MS=200 make run"
