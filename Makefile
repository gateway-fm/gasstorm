.PHONY: run run-reth run-cdk-erigon stop restart logs status clean build test test-block-builder test-load-generator test-dashboard test-tx bench-block-builder bench-load-generator polycli-install polycli-eoa polycli-erc20 polycli-erc721 polycli-uniswap polycli-store polycli-mixed polycli-help dev dev-infra dev-builder dev-loadgen dev-dashboard dev-stop dev-cdk-erigon

# =============================================================================
# Configuration: Source .env file if it exists
# =============================================================================
-include .env
export

# =============================================================================
# Execution Layer Configuration
# =============================================================================
EXECUTION_LAYER ?= reth

# Derive docker compose profile from execution layer
ifeq ($(EXECUTION_LAYER),cdk-erigon)
  COMPOSE_PROFILE := cdk-erigon
else
  COMPOSE_PROFILE := reth
endif

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

# Start the system (builds if needed) - uses .env configuration and EXECUTION_LAYER
run:
	docker compose --profile $(COMPOSE_PROFILE) up --build -d

# Start with op-reth (block-builder + Engine API)
run-reth:
	docker compose --profile reth up --build -d

# Start with cdk-erigon (standalone sequencer)
run-cdk-erigon:
	docker compose --profile cdk-erigon up --build -d

# Start with logs attached
run-attached:
	docker compose --profile $(COMPOSE_PROFILE) up --build

# =============================================================================
# Performance Profiles (uses current EXECUTION_LAYER)
# =============================================================================

# High throughput: 1 gigagas, 100ms blocks
run-high-throughput:
	GAS_LIMIT=1000000000 \
	MAX_TXS_PER_BLOCK=25000 \
	BLOCK_TIME_MS=100 \
	docker compose --profile $(COMPOSE_PROFILE) up --build -d

# Fast confirmations: 150M gas, 50ms blocks
run-fast-confirm:
	GAS_LIMIT=150000000 \
	MAX_TXS_PER_BLOCK=7000 \
	BLOCK_TIME_MS=50 \
	docker compose --profile $(COMPOSE_PROFILE) up --build -d

# Preconfirmations enabled: 1 gigagas, 100ms blocks
run-with-preconf:
	GAS_LIMIT=1000000000 \
	MAX_TXS_PER_BLOCK=25000 \
	BLOCK_TIME_MS=100 \
	ENABLE_PRECONFIRMATIONS=true \
	docker compose --profile $(COMPOSE_PROFILE) up --build -d

# Conservative: Smaller blocks, longer intervals (for stability testing)
run-conservative:
	GAS_LIMIT=30000000 \
	MAX_TXS_PER_BLOCK=1000 \
	BLOCK_TIME_MS=2000 \
	SKIP_EMPTY_BLOCKS=false \
	docker compose --profile $(COMPOSE_PROFILE) up --build -d

# Flashblocks-style: 500ms blocks with preconfirmations
run-flashblocks:
	GAS_LIMIT=500000000 \
	MAX_TXS_PER_BLOCK=25000 \
	BLOCK_TIME_MS=500 \
	ENABLE_PRECONFIRMATIONS=true \
	docker compose --profile $(COMPOSE_PROFILE) up --build -d

# Stop all services (stops all profiles)
stop:
	docker compose --profile reth --profile cdk-erigon down

# Restart all services
restart:
	docker compose --profile reth --profile cdk-erigon down && docker compose --profile $(COMPOSE_PROFILE) up --build -d

# View logs (follow mode)
logs:
	docker compose --profile $(COMPOSE_PROFILE) logs -f

# View logs for specific service (usage: make logs-service SERVICE=block-builder)
logs-service:
	docker compose logs -f $(SERVICE)

# Show status of all services
status:
	docker compose --profile reth --profile cdk-erigon ps

# Clean up volumes and rebuild
clean:
	docker compose --profile reth --profile cdk-erigon down -v
	docker system prune -f

# Build without starting
build:
	docker compose --profile $(COMPOSE_PROFILE) build

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

# =============================================================================
# Integration Tests
# =============================================================================

# Run API contract tests (no stack needed)
test-contract:
	@echo "Running API contract tests..."
	cd load-generator && go test -v -race ./internal/contract/...

# Run E2E integration tests (requires running stack)
test-e2e:
	@echo "Running E2E integration tests (stack must be running)..."
	cd load-generator && \
	BUILDER_RPC_URL=http://localhost:13000 \
	LOADGEN_API_URL=http://localhost:13001 \
	L2_RPC_URL=http://localhost:18546 \
	PRECONF_WS_URL=ws://localhost:13002/ws/preconfirmations \
	go test -v -race -timeout 120s ./internal/integration/... -run "TestE2E"

# Run full integration test suite (starts/stops stack)
test-integration:
	@echo "Running full integration test suite..."
	./scripts/integration-test.sh all

# Run integration tests with existing stack
test-integration-quick:
	@echo "Running integration tests against existing stack..."
	./scripts/integration-test.sh all --skip-startup

# Run quick smoke test (requires running stack)
test-smoke:
	@echo "Running smoke test..."
	./scripts/integration-test.sh smoke --skip-startup

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
	BLOCK_TIME_MS=$${BLOCK_TIME_MS:-1000} \
	SKIP_EMPTY_BLOCKS=$${SKIP_EMPTY_BLOCKS:-false} \
	GAS_LIMIT=$${GAS_LIMIT:-1000000000} \
	MAX_TXS_PER_BLOCK=$${MAX_TXS_PER_BLOCK:-25000} \
	TX_ORDERING=$${TX_ORDERING:-fifo} \
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
	docker compose --profile reth --profile cdk-erigon stop l1 l2-reth l2-cdk-erigon 2>/dev/null || true
	@echo "Dev infrastructure stopped"

# CDK-Erigon dev mode: Start cdk-erigon in Docker, run load-generator and dashboard locally
dev-cdk-erigon:
	@echo "=== Starting CDK-Erigon Development Mode ==="
	@echo "Killing any processes on ports 3000, 13001..."
	@-lsof -ti :3000 | xargs kill -9 2>/dev/null || true
	@-lsof -ti :13001 | xargs kill -9 2>/dev/null || true
	@docker compose --profile cdk-erigon up -d l1 l2-cdk-erigon
	@echo "Waiting for L1 and CDK-Erigon to be ready..."
	@sleep 5
	@echo "Starting load-generator and dashboard locally... (Ctrl+C to stop)"
	@bash -c '\
		cleanup() { \
			echo ""; \
			echo "Shutting down..."; \
			kill $$LOADGEN_PID $$DASHBOARD_PID 2>/dev/null; \
			wait $$LOADGEN_PID $$DASHBOARD_PID 2>/dev/null; \
			docker compose --profile cdk-erigon stop l1 l2-cdk-erigon; \
			echo "Done."; \
			exit 0; \
		}; \
		trap cleanup INT TERM; \
		\
		( cd load-generator && \
		  EXECUTION_LAYER=cdk-erigon \
		  BUILDER_RPC_URL=http://localhost:18546 \
		  L2_RPC_URL=http://localhost:18546 \
		  L2_WS_URL=ws://localhost:18547 \
		  PRECONF_WS_URL= \
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
		echo "=== CDK-Erigon mode running ==="; \
		echo "  Dashboard:      http://localhost:3000"; \
		echo "  CDK-Erigon RPC: http://localhost:18546"; \
		echo "  Load Generator: http://localhost:13001"; \
		echo ""; \
		echo "Note: No block-builder in cdk-erigon mode (cdk-erigon is its own sequencer)"; \
		echo "Note: No preconfirmations available in cdk-erigon mode"; \
		echo ""; \
		echo "Press Ctrl+C to stop all services"; \
		echo ""; \
		wait \
	'

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
		  BLOCK_TIME_MS=$${BLOCK_TIME_MS:-1000} \
		  SKIP_EMPTY_BLOCKS=$${SKIP_EMPTY_BLOCKS:-false} \
		  GAS_LIMIT=$${GAS_LIMIT:-1000000000} \
		  MAX_TXS_PER_BLOCK=$${MAX_TXS_PER_BLOCK:-25000} \
		  TX_ORDERING=$${TX_ORDERING:-fifo} \
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
	@echo "  Execution Layer (choose one):"
	@echo "    make run              - Start with EXECUTION_LAYER from .env (default: reth)"
	@echo "    make run-reth         - Start with op-reth (block-builder + Engine API)"
	@echo "    make run-cdk-erigon   - Start with cdk-erigon (standalone sequencer)"
	@echo ""
	@echo "  Basic:"
	@echo "    make run-attached     - Start system with logs"
	@echo "    make stop             - Stop all services"
	@echo "    make restart          - Restart all services"
	@echo "    make logs             - Follow all logs"
	@echo "    make status           - Show service status"
	@echo "    make clean            - Stop and remove volumes"
	@echo "    make build            - Build without starting"
	@echo ""
	@echo "  Performance Profiles (uses current EXECUTION_LAYER):"
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
	@echo "  Integration Tests:"
	@echo "    make test-contract    - API contract tests (no stack needed)"
	@echo "    make test-e2e         - E2E tests (requires running stack)"
	@echo "    make test-integration - Full integration suite (starts/stops stack)"
	@echo "    make test-integration-quick - Integration tests (existing stack)"
	@echo "    make test-smoke       - Quick smoke test (requires running stack)"
	@echo ""
	@echo "  AggLayer:"
	@echo "    make run-agglayer     - Start with AggLayer stack"
	@echo ""
	@echo "  Local Development (HMR):"
	@echo "    make dev              - Run all services locally (op-reth mode)"
	@echo "    make dev-cdk-erigon   - Run with cdk-erigon in Docker, rest locally"
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
	@echo "    EXECUTION_LAYER       - reth (default) or cdk-erigon"
	@echo "    GAS_LIMIT             - Block gas limit (default: 1000000000)"
	@echo "    MAX_TXS_PER_BLOCK     - Max txs per block (default: 25000)"
	@echo "    BLOCK_TIME_MS         - Block interval ms (default: 1000)"
	@echo "    TX_ORDERING           - fifo (default), tip_desc, tip_asc"
	@echo "    ENABLE_PRECONFIRMATIONS - WebSocket tx streaming (default: true, reth only)"
	@echo ""
	@echo "  Example: Override .env on command line:"
	@echo "    EXECUTION_LAYER=cdk-erigon make run"
	@echo "    BLOCK_TIME_MS=200 make run"
