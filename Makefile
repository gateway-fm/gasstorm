.PHONY: run run-build run-reth run-cdk-erigon run-metal stop-metal restart-metal run-hyperlane stop restart logs status resource-report clean clean-metal build test test-load-generator test-dashboard test-tx bench-load-generator polycli-install polycli-eoa polycli-erc20 polycli-erc721 polycli-uniswap polycli-store polycli-mixed polycli-help dev dev-infra dev-loadgen dev-dashboard dev-stop dev-cdk-erigon bridge-deploy bridge-relayer bridge-relayer-stop bridge-logs bridge-deposit bridge-withdraw bridge-balances bridge-setup bridge-help run-with-blob run-with-explorer run-with-privacy run-with-explorer-privacy pull-explorer pull-privacy run-zisk test-zisk prover-status prover-prove prover-proofs prover-help setup-hooks sbom sbom-help pull-blockbuilder pull-loadgenerator mcp-server mcp-build site-dev site-build tunnel-url _print-tunnel-url

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
  EXPLORER_PROFILE := explorer-cdk
  PRIVACY_PROFILE := privacy-cdk
else ifeq ($(EXECUTION_LAYER),gravity-reth)
  COMPOSE_PROFILE := gravity-reth
  EXPLORER_PROFILE := explorer
  PRIVACY_PROFILE := privacy
else
  COMPOSE_PROFILE := reth
  EXPLORER_PROFILE := explorer
  PRIVACY_PROFILE := privacy
endif

# Hyperlane bridge defaults
# Enable bridge services by default for reth mode only.
ENABLE_HYPERLANE_BRIDGE ?= true
ENABLE_BLOB_DA ?= true
ifeq ($(COMPOSE_PROFILE),reth)
  ifneq ($(ENABLE_HYPERLANE_BRIDGE),false)
    BRIDGE_PROFILES := --profile bridge
  endif
  ifneq ($(ENABLE_BLOB_DA),false)
    BLOB_PROFILE := --profile blob
  endif
endif

# =============================================================================
# Prover Configuration
# =============================================================================
# PROVER can be: sp1 (default), zisk
PROVER ?= sp1

ifeq ($(PROVER),zisk)
  PROVER_PROFILE := prover-zisk
else
  PROVER_PROFILE := prover-sp1
endif

# #############################################################################
# CORE: Gas Storm (reth mode)
# #############################################################################

# =============================================================================
# Run Targets
# =============================================================================

# Start the full system: L1/L2, block-builder, load-generator, dashboard, docs, explorer, privacy, bridge(reth)
run: mcp-build
	docker compose --profile $(COMPOSE_PROFILE) --profile $(EXPLORER_PROFILE) --profile explorer-l1 --profile $(PRIVACY_PROFILE) $(BRIDGE_PROFILES) $(BLOB_PROFILE) up -d
	@$(MAKE) --no-print-directory _print-tunnel-url

# Build from local sibling repos (../blockbuilder, ../loadgenerator) and run everything
run-build: mcp-build
	docker compose -f docker-compose.yml -f docker-compose.build.yaml --profile $(COMPOSE_PROFILE) --profile $(EXPLORER_PROFILE) --profile explorer-l1 --profile $(PRIVACY_PROFILE) $(BRIDGE_PROFILES) $(BLOB_PROFILE) up --build -d
	@$(MAKE) --no-print-directory _print-tunnel-url

# Start with op-reth (block-builder + Engine API)
run-reth:
	docker compose --profile reth --profile bridge --profile blob up --build -d

# Start with logs attached (all services)
run-attached:
	docker compose --profile $(COMPOSE_PROFILE) --profile $(EXPLORER_PROFILE) --profile $(PRIVACY_PROFILE) $(BRIDGE_PROFILES) $(BLOB_PROFILE) up --build

# Start in native "Metal" mode (no Docker, maximum performance)
# Requires: op-reth, go, node installed locally, sibling repos (../blockbuilder, ../loadgenerator)
run-metal:
	./scripts/run-metal.sh

# Stop metal mode services
stop-metal:
	./scripts/stop-metal.sh

# Restart metal mode (stop + start)
restart-metal: stop-metal run-metal

# =============================================================================
# MCP Server (AI-native stack management)
# =============================================================================

# Build the MCP server binary
mcp-build:
	cd mcp && go build -o mcp .

# Run MCP server over stdio (for direct use; AI tools auto-discover via .mcp.json)
mcp-server: mcp-build
	BUILDER_URL=http://localhost:13000 LOADGEN_URL=http://localhost:13001 \
	EXPLORER_URL=http://localhost:18200 PRIVACY_URL=http://localhost:18300 \
	GASSTORM_DIR=$(CURDIR) \
		./mcp/mcp

# Print the cloudflared tunnel URL (for privacy-proxy QR callbacks from phone)
tunnel-url:
	@docker logs gasstorm-privacy-tunnel 2>&1 | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1

# Internal helper: wait for tunnel URL, write to bind-mounted file, and print it.
# The backend reads data/tunnel/tunnel-url.txt to construct QR callback URLs.
_print-tunnel-url:
	@if docker ps --format '{{.Names}}' 2>/dev/null | grep -q gasstorm-privacy-tunnel; then \
		echo ""; \
		echo "Waiting for privacy tunnel..."; \
		mkdir -p data/tunnel; \
		for i in 1 2 3 4 5 6 7 8; do \
			URL=$$(docker logs gasstorm-privacy-tunnel 2>&1 | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1); \
			if [ -n "$$URL" ]; then \
				echo "$$URL" > data/tunnel/tunnel-url.txt; \
				echo "Privacy tunnel: $$URL"; \
				echo "(open localhost:18301 — QR callbacks route through tunnel automatically)"; \
				break; \
			fi; \
			sleep 2; \
		done; \
		if [ ! -f data/tunnel/tunnel-url.txt ]; then \
			echo "(tunnel starting... run 'make tunnel-url' to get URL later)"; \
		fi; \
	fi

# =============================================================================
# Performance Profiles (uses current EXECUTION_LAYER)
# =============================================================================

# High throughput: 1 gigagas, 100ms blocks
run-high-throughput:
	GAS_LIMIT=1000000000 \
	MAX_TXS_PER_BLOCK=25000 \
	BLOCK_TIME_MS=100 \
	docker compose --profile $(COMPOSE_PROFILE) $(BRIDGE_PROFILES) $(BLOB_PROFILE) up --build -d

# Fast confirmations: 150M gas, 50ms blocks
run-fast-confirm:
	GAS_LIMIT=150000000 \
	MAX_TXS_PER_BLOCK=7000 \
	BLOCK_TIME_MS=50 \
	docker compose --profile $(COMPOSE_PROFILE) $(BRIDGE_PROFILES) $(BLOB_PROFILE) up --build -d

# Preconfirmations enabled: 1 gigagas, 100ms blocks
run-with-preconf:
	GAS_LIMIT=1000000000 \
	MAX_TXS_PER_BLOCK=25000 \
	BLOCK_TIME_MS=100 \
	ENABLE_PRECONFIRMATIONS=true \
	docker compose --profile $(COMPOSE_PROFILE) $(BRIDGE_PROFILES) $(BLOB_PROFILE) up --build -d

# Conservative: Smaller blocks, longer intervals (for stability testing)
run-conservative:
	GAS_LIMIT=30000000 \
	MAX_TXS_PER_BLOCK=1000 \
	BLOCK_TIME_MS=2000 \
	SKIP_EMPTY_BLOCKS=false \
	docker compose --profile $(COMPOSE_PROFILE) $(BRIDGE_PROFILES) $(BLOB_PROFILE) up --build -d

# Flashblocks-style: 500ms blocks with preconfirmations
run-flashblocks:
	GAS_LIMIT=500000000 \
	MAX_TXS_PER_BLOCK=25000 \
	BLOCK_TIME_MS=500 \
	ENABLE_PRECONFIRMATIONS=true \
	docker compose --profile $(COMPOSE_PROFILE) $(BRIDGE_PROFILES) $(BLOB_PROFILE) up --build -d

# =============================================================================
# Lifecycle (stop, restart, logs, status, clean, build)
# =============================================================================

# Stop all services (stops all profiles)
stop:
	docker compose --profile reth --profile cdk-erigon --profile bridge --profile bridge-ui --profile blob --profile explorer --profile explorer-l1 --profile explorer-cdk --profile privacy --profile privacy-cdk down 2>/dev/null || true
	docker compose -f docker-compose-base.yaml -f docker-compose-gravity-reth.yaml down 2>/dev/null || true

# Restart all services
restart:
	docker compose --profile reth --profile cdk-erigon --profile bridge --profile bridge-ui --profile blob down && docker compose --profile $(COMPOSE_PROFILE) $(BRIDGE_PROFILES) $(BLOB_PROFILE) up --build -d

# View logs (follow mode)
logs:
	docker compose --profile $(COMPOSE_PROFILE) logs -f

# View logs for specific service (usage: make logs-service SERVICE=block-builder)
logs-service:
	docker compose logs -f $(SERVICE)

# Show status of all services
status:
	docker compose --profile reth --profile cdk-erigon --profile bridge --profile bridge-ui --profile blob --profile explorer --profile explorer-l1 --profile explorer-cdk --profile privacy --profile privacy-cdk ps 2>/dev/null || true
	docker compose -f docker-compose-base.yaml -f docker-compose-gravity-reth.yaml ps 2>/dev/null || true

# Resource usage snapshot (containers + disk)
resource-report:
	@echo "=== GasStorm Runtime Usage ==="
	@ids=$$(docker compose ps -q); \
	if [ -n "$$ids" ]; then \
		docker stats --no-stream $$ids; \
	else \
		echo "No GasStorm containers are running."; \
	fi
	@echo ""
	@echo "=== Docker Disk Usage ==="
	@docker system df
	@echo ""
	@echo "=== Largest Local Images ==="
	@docker images --format '{{.Repository}}:{{.Tag}} {{.Size}}' | head -20

# Clean up volumes and rebuild
clean:
	docker compose --profile reth --profile cdk-erigon --profile bridge --profile bridge-ui --profile blob --profile explorer --profile explorer-l1 --profile explorer-cdk --profile privacy --profile privacy-cdk down -v 2>/dev/null || true
	docker compose -f docker-compose-base.yaml -f docker-compose-gravity-reth.yaml down -v 2>/dev/null || true
	docker system prune -f

# Clean Metal mode data directory
clean-metal:
	rm -rf ./data/metal
	@echo "Metal mode data cleaned"

# Build without starting
build:
	docker compose --profile $(COMPOSE_PROFILE) build

# =============================================================================
# Testing
# =============================================================================

# Run all tests with race detector
test: test-dashboard

# Test load-generator (external repo: github.com/gateway-fm/loadgenerator)
test-load-generator:
	@echo "Load generator is now an external repo: github.com/gateway-fm/loadgenerator"
	@echo "Run tests there: cd ../loadgenerator && make test"

# Test dashboard (Next.js - lint only for now)
test-dashboard:
	cd dashboard && npm run lint

# Run benchmarks for load-generator (external repo)
bench-load-generator:
	@echo "Load generator is now an external repo: github.com/gateway-fm/loadgenerator"
	@echo "Run benchmarks there: cd ../loadgenerator && make bench"

# Install git hooks (pre-commit runs full test suite)
setup-hooks:
	@echo "Installing git hooks..."
	@mkdir -p .git/hooks
	@cp scripts/hooks/pre-commit .git/hooks/pre-commit
	@chmod +x .git/hooks/pre-commit
	@echo "Pre-commit hook installed successfully!"
	@echo "  - Runs: dashboard lint"
	@echo "  - To skip: git commit --no-verify"

# =============================================================================
# Integration Tests
# =============================================================================

# Run API contract tests (no stack needed) - requires sibling loadgenerator repo
test-contract:
	@echo "Running API contract tests..."
	cd ../loadgenerator && go test -v -race ./internal/contract/...

# Run E2E integration tests (requires running stack) - requires sibling loadgenerator repo
test-e2e:
	@echo "Running E2E integration tests (stack must be running)..."
	cd ../loadgenerator && \
	BUILDER_RPC_URL=http://localhost:13000 \
	LOADGEN_API_URL=http://localhost:13001 \
	L2_RPC_URL=http://localhost:13000 \
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
	cast balance 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 --rpc-url http://localhost:13000

# =============================================================================
# Local Development (HMR)
# =============================================================================

# Start just the blockchain infrastructure in Docker (L1 + L2 + block-builder)
dev-infra:
	docker compose --profile reth up -d l1 l2-reth block-builder
	@echo "Waiting for L1, L2, and block-builder to be ready..."
	@sleep 5
	@echo "Infrastructure ready. L1: localhost:18545, L2 (via block-builder): localhost:13000"

# Run load-generator locally (requires dev-infra and sibling loadgenerator repo)
dev-loadgen:
	cd ../loadgenerator && \
	BUILDER_RPC_URL=http://localhost:13000 \
	L2_RPC_URL=http://localhost:13000 \
	PRECONF_WS_URL=ws://localhost:13002/ws/preconfirmations \
	LISTEN_ADDR=:13001 \
	DATABASE_PATH=./loadgen-dev.db \
	go run ./cmd/loadgen

# Run dashboard with HMR (requires dev-loadgen for API calls)
dev-dashboard:
	cd dashboard && npm run dev

# Stop dev infrastructure
dev-stop:
	docker compose --profile reth --profile cdk-erigon stop l1 l2-reth l2-cdk-erigon block-builder 2>/dev/null || true
	@echo "Dev infrastructure stopped"

# Full local dev: run load-generator and dashboard locally, infrastructure in Docker
# Requires sibling loadgenerator repo at ../loadgenerator
dev:
	@echo "=== Starting Local Development Mode ==="
	@echo "Killing any processes on ports 3000, 13001..."
	@-lsof -ti :3000 | xargs kill -9 2>/dev/null || true
	@-lsof -ti :13001 | xargs kill -9 2>/dev/null || true
	@if [ -f .env ]; then echo "Loading .env file..."; set -a; . ./.env; set +a; fi
	@docker compose --profile reth up -d l1 l2-reth block-builder
	@echo "Waiting for L1/L2/block-builder..."
	@sleep 5
	@echo "Starting services... (Ctrl+C to stop all)"
	@bash -c '\
		if [ -f .env ]; then set -a; . ./.env; set +a; fi; \
		cleanup() { \
			echo ""; \
			echo "Shutting down..."; \
			kill $$LOADGEN_PID $$DASHBOARD_PID 2>/dev/null; \
			wait $$LOADGEN_PID $$DASHBOARD_PID 2>/dev/null; \
			docker compose --profile reth stop l1 l2-reth block-builder; \
			echo "Done."; \
			exit 0; \
		}; \
		trap cleanup INT TERM; \
		\
		( cd ../loadgenerator && \
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
		echo "  Block Builder:  http://localhost:13000 (Docker)"; \
		echo "  Load Generator: http://localhost:13001"; \
		echo ""; \
		echo "Press Ctrl+C to stop all services"; \
		echo ""; \
		wait \
	'

# =============================================================================
# External Images
# =============================================================================

# Pull latest block-builder image from DockerHub
pull-blockbuilder:
	docker pull gatewayfm/blockbuilder:latest
	@echo "Pulled gatewayfm/blockbuilder:latest"

# Pull latest load-generator image from DockerHub
pull-loadgenerator:
	docker pull gatewayfm/loadgenerator:latest
	@echo "Pulled gatewayfm/loadgenerator:latest"

# Pull latest block-explorer image from DockerHub
pull-explorer:
	docker pull gatewayfm/block-explorer:latest
	@echo "Pulled gatewayfm/block-explorer:latest"

# Pull latest privacy-proxy image from DockerHub
pull-privacy:
	docker pull gatewayfm/privacy-proxy:latest
	@echo "Pulled gatewayfm/privacy-proxy:latest"

# =============================================================================
# SBOM Generation
# =============================================================================

# Generate Software Bill of Materials for all components
sbom:
	@./scripts/generate-sbom.sh ./sbom

# SBOM help
sbom-help:
	@echo "SBOM Generation:"
	@echo "  make sbom               - Generate SBOM for all components"
	@echo ""
	@echo "Output: ./sbom/*.sbom.json (CycloneDX format)"
	@echo ""
	@echo "Components covered:"
	@echo "  - block-builder (Go)"
	@echo "  - load-generator (Go)"
	@echo "  - zisk-prover (Go)"
	@echo "  - dashboard (Node.js)"
	@echo "  - bridge-ui (Node.js)"
	@echo ""
	@echo "For comprehensive SBOM with vulnerability data, install syft:"
	@echo "  brew install syft (macOS)"
	@echo "  https://github.com/anchore/syft (other platforms)"

# #############################################################################
# OVERHANGING: Other Execution Layers (cdk-erigon, gravity-reth)
# #############################################################################

# Start with cdk-erigon (standalone sequencer)
run-cdk-erigon:
	docker compose --profile cdk-erigon up --build -d

# Start with gravity-reth (high-performance parallel EVM, standalone sequencer)
# First build takes 15-25 minutes (Rust compilation from source)
run-gravity-reth:
	docker compose -f docker-compose-base.yaml -f docker-compose-gravity-reth.yaml up --build -d

# CDK-Erigon dev mode: Start cdk-erigon in Docker, run load-generator and dashboard locally
# Requires sibling loadgenerator repo at ../loadgenerator
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
		( cd ../loadgenerator && \
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

# Start with Blob DA enabled
run-with-blob:
	docker compose --profile $(COMPOSE_PROFILE) --profile blob up --build -d

# Start with Hyperlane bridge enabled (includes Warp UI)
run-with-bridge:
	docker compose --profile $(COMPOSE_PROFILE) --profile bridge --profile bridge-ui up --build -d

# Alias for run-with-bridge (includes Hyperlane)
run-hyperlane:
	docker compose --profile $(COMPOSE_PROFILE) --profile bridge --profile bridge-ui up --build -d

# Start with block explorer enabled (indexes blocks/txs)
run-with-explorer:
	docker compose --profile $(COMPOSE_PROFILE) --profile $(EXPLORER_PROFILE) --profile explorer-l1 up --build -d

# Start with privacy proxy enabled (RPC access control)
run-with-privacy:
	docker compose --profile $(COMPOSE_PROFILE) --profile $(PRIVACY_PROFILE) up --build -d

# Start with both explorer and privacy proxy
run-with-explorer-privacy:
	docker compose --profile $(COMPOSE_PROFILE) --profile $(EXPLORER_PROFILE) --profile explorer-l1 --profile $(PRIVACY_PROFILE) up --build -d

# #############################################################################
# OVERHANGING: Hyperlane Bridge
# #############################################################################

# Deploy Hyperlane core and warp route contracts
bridge-deploy:
	@echo "Deploying Hyperlane bridge infrastructure..."
	./scripts/deploy-hyperlane.sh

# Start the Hyperlane relayer (requires bridge-deploy first)
bridge-relayer:
	docker compose --profile bridge up -d hyperlane-relayer
	@echo "Relayer started. View logs with: make bridge-logs"

# Stop the Hyperlane relayer
bridge-relayer-stop:
	docker compose --profile bridge down

# View relayer logs
bridge-logs:
	docker compose logs -f hyperlane-relayer

# Bridge ETH from L1 to L2 (usage: make bridge-deposit AMOUNT=1)
bridge-deposit:
	@if [ -z "$(AMOUNT)" ]; then echo "Usage: make bridge-deposit AMOUNT=<eth_amount>"; exit 1; fi
	./scripts/bridge-deposit.sh $(AMOUNT)

# Bridge ETH from L2 to L1 (usage: make bridge-withdraw AMOUNT=1)
bridge-withdraw:
	@if [ -z "$(AMOUNT)" ]; then echo "Usage: make bridge-withdraw AMOUNT=<eth_amount>"; exit 1; fi
	./scripts/bridge-withdraw.sh $(AMOUNT)

# Check bridge balances
bridge-balances:
	@echo "L1 (Anvil) Balances:"
	@cast balance 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 --rpc-url http://localhost:18545 | xargs -I{} echo "  Account 0: {} wei ($(shell cast from-wei {} ether 2>/dev/null || echo '?') ETH)"
	@echo ""
	@echo "L2 (op-reth) Balances:"
	@cast balance 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 --rpc-url http://localhost:13000 | xargs -I{} echo "  Account 0: {} wei ($(shell cast from-wei {} ether 2>/dev/null || echo '?') ETH)"

# Full bridge setup: deploy contracts and start relayer
bridge-setup: bridge-deploy bridge-relayer
	@echo ""
	@echo "Bridge setup complete!"
	@echo "  - Test deposit:  make bridge-deposit AMOUNT=1"
	@echo "  - Test withdraw: make bridge-withdraw AMOUNT=1"
	@echo "  - View balances: make bridge-balances"
	@echo "  - View logs:     make bridge-logs"

# Bridge help
bridge-help:
	@echo "Hyperlane Bridge Commands:"
	@echo "  make run                  - Default reth stack (includes bridge infra)"
	@echo "  ENABLE_HYPERLANE_BRIDGE=false make run - Run without bridge infra"
	@echo "  ENABLE_BLOB_DA=false make run - Run without Blob DA"
	@echo "  make run-with-bridge      - Start stack with bridge + Warp UI"
	@echo "  make bridge-deploy        - Deploy Hyperlane contracts to L1 and L2"
	@echo "  make bridge-relayer       - Start the Hyperlane relayer"
	@echo "  make bridge-relayer-stop  - Stop the relayer"
	@echo "  make bridge-logs          - View relayer logs"
	@echo "  make bridge-deposit AMOUNT=1   - Bridge ETH from L1 to L2"
	@echo "  make bridge-withdraw AMOUNT=1  - Bridge ETH from L2 to L1"
	@echo "  make bridge-balances      - Check bridge account balances"
	@echo "  make bridge-setup         - Full setup (deploy + start relayer)"
	@echo ""
	@echo "Bridge UIs:"
	@echo "  - Hyperlane Warp UI: http://localhost:18001  (connect any wallet)"
	@echo "  - Dashboard Bridge:  http://localhost:18000/bridge  (test account)"
	@echo ""
	@echo "Quick Start:"
	@echo "  make run                  # Starts bridge infra automatically in reth mode"
	@echo "  make run-with-bridge      # Also starts Warp UI"

# #############################################################################
# OVERHANGING: AggLayer & Provers
# #############################################################################

# Start with AggLayer profile (uses PROVER env var: sp1 or zisk)
run-agglayer:
	@echo "Starting AggLayer with $(PROVER) prover..."
	docker compose --profile reth --profile agglayer --profile $(PROVER_PROFILE) up --build -d

# Stop AggLayer
stop-agglayer:
	docker compose --profile agglayer --profile prover-sp1 --profile prover-zisk down

# Run with ZisK prover
run-zisk:
	PROVER=zisk $(MAKE) run-agglayer

# Test ZisK prover
test-zisk:
	cd zisk-prover && go test -race -v ./...

# Prover status (works for both sp1 and zisk on port 13337)
prover-status:
	@curl -s http://localhost:13337/status 2>/dev/null | jq . || \
	curl -s http://localhost:13337/health 2>/dev/null | jq . || \
	echo "Prover not running on port 13337"

# Request a proof for a block (ZisK prover)
prover-prove:
	@if [ -z "$(BLOCK)" ]; then echo "Usage: make prover-prove BLOCK=<block_number>"; exit 1; fi
	@curl -X POST http://localhost:13337/prove -H "Content-Type: application/json" -d '{"blockNumber": $(BLOCK)}' | jq .

# List all proofs (ZisK prover)
prover-proofs:
	@curl -s http://localhost:13337/proofs | jq . 2>/dev/null || echo "Prover not running"

# Prover help
prover-help:
	@echo "Prover Selection:"
	@echo "  PROVER=sp1    - Use OP Succinct (SP1) prover (default)"
	@echo "  PROVER=zisk   - Use ZisK prover"
	@echo ""
	@echo "Commands:"
	@echo "  make run-agglayer           - Start with default prover (sp1)"
	@echo "  PROVER=zisk make run-agglayer - Start with ZisK prover"
	@echo "  make run-zisk               - Shortcut for PROVER=zisk run-agglayer"
	@echo "  make prover-status          - Check prover status"
	@echo "  make prover-prove BLOCK=1   - Request proof for block (ZisK)"
	@echo "  make prover-proofs          - List all proofs (ZisK)"
	@echo "  make test-zisk              - Run ZisK prover tests"
	@echo ""
	@echo "ZisK API Endpoints (port 13337):"
	@echo "  GET  /status  - Service status"
	@echo "  POST /prove   - Submit block for proving"
	@echo "  GET  /proof/:id - Get proof result"
	@echo "  GET  /proofs  - List all proofs"

# #############################################################################
# OVERHANGING: Polycli Load Testing
# #############################################################################

# =============================================================================
# Polycli Configuration
# =============================================================================
POLYCLI_RPC ?= http://localhost:13000
POLYCLI_TPS ?= 100
POLYCLI_DURATION ?= 30
POLYCLI_CONCURRENCY ?= 10
POLYCLI_ACCOUNTS ?= 10
# WARNING: This is a well-known Anvil test key (Account #0) - DO NOT use with real funds
# Override via environment variable or .env file for different keys
POLYCLI_PRIVATE_KEY ?= 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
POLYCLI_GAS_MULTIPLIER ?= 1.5
POLYCLI_FUND_AMOUNT ?= 10000000000000000000

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

# #############################################################################
# Documentation Site
# #############################################################################

# Run docs site in development mode
site-dev:
	cd site && npm run dev

# Build docs site for production (static export to site/out/)
site-build:
	cd site && npm run build

# #############################################################################
# Help
# #############################################################################

# Show help
help:
	@echo "Available commands:"
	@echo ""
	@echo "  ==== CORE: Gas Storm (reth mode) ===="
	@echo ""
	@echo "  Run:"
	@echo "    make run              - Start full stack (reth includes bridge infra by default)"
	@echo "    make run-build        - Build from local repos and start"
	@echo "    make run-reth         - Start with op-reth (block-builder + Engine API)"
	@echo "    make run-metal        - Native mode (no Docker, maximum performance)"
	@echo "    make stop-metal       - Stop metal mode services"
	@echo "    make restart-metal    - Restart metal mode services"
	@echo "    make run-attached     - Start system with logs"
	@echo ""
	@echo "  Lifecycle:"
	@echo "    make stop             - Stop all services"
	@echo "    make restart          - Restart all services"
	@echo "    make logs             - Follow all logs"
	@echo "    make status           - Show service status"
	@echo "    make resource-report  - Show runtime CPU/RAM and Docker disk usage"
	@echo "    make clean            - Stop and remove volumes"
	@echo "    make clean-metal      - Remove native mode data"
	@echo "    make build            - Build without starting"
	@echo ""
	@echo "  Performance Profiles:"
	@echo "    make run-high-throughput  - 1B gas, 100ms, pipelining (max TPS)"
	@echo "    make run-fast-confirm     - 150M gas, 50ms blocks (low latency)"
	@echo "    make run-conservative     - 30M gas, 2s blocks (stability)"
	@echo "    make run-flashblocks      - 500M gas, 500ms + preconfirmations"
	@echo ""
	@echo "  Testing:"
	@echo "    make test             - Run all tests (with race detector)"
	@echo "    make test-dashboard   - Lint dashboard"
	@echo "    make test-tx          - Send a test transaction"
	@echo "    make balance          - Check test account balance"
	@echo "    make test-contract    - API contract tests (no stack needed)"
	@echo "    make test-e2e         - E2E tests (requires running stack)"
	@echo "    make test-integration - Full integration suite (starts/stops stack)"
	@echo "    make test-smoke       - Quick smoke test (requires running stack)"
	@echo ""
	@echo "  Local Development (HMR):"
	@echo "    make dev              - Run load-generator and dashboard locally (op-reth mode)"
	@echo "    make dev-infra        - Start L1/L2/block-builder in Docker"
	@echo "    make dev-loadgen      - Run only load-generator locally"
	@echo "    make dev-dashboard    - Run only dashboard with HMR"
	@echo "    make dev-stop         - Stop dev infrastructure"
	@echo ""
	@echo "  MCP Server (AI):"
	@echo "    make mcp-server       - Run MCP server over stdio"
	@echo "    make mcp-build        - Build MCP server binary"
	@echo "    (auto-discovered by Claude Code via .mcp.json)"
	@echo ""
	@echo "  External Images:"
	@echo "    make pull-blockbuilder   - Pull latest block-builder image from DockerHub"
	@echo "    make pull-loadgenerator  - Pull latest load-generator image from DockerHub"
	@echo "    BLOCKBUILDER_VERSION=v1.0.0 make run     - Use specific block-builder version"
	@echo "    LOADGENERATOR_VERSION=v1.0.0 make run    - Use specific load-generator version"
	@echo ""
	@echo "  ==== OVERHANGING: Other Execution Layers ===="
	@echo ""
	@echo "    make run-cdk-erigon   - Start with cdk-erigon (standalone sequencer)"
	@echo "    make run-gravity-reth - Start with gravity-reth (high-perf parallel EVM)"
	@echo "    make dev-cdk-erigon   - Run with cdk-erigon in Docker, rest locally"
	@echo ""
	@echo "  ==== OVERHANGING: Block Explorer ===="
	@echo ""
	@echo "    make run-with-explorer          - Start with L1 + L2 block explorers"
	@echo "    make run-with-explorer-privacy   - Start with explorers + privacy proxy"
	@echo "    make pull-explorer              - Pull latest explorer image"
	@echo "    L2 Explorer: http://localhost:18201  L1 Explorer: http://localhost:18203"
	@echo ""
	@echo "  ==== OVERHANGING: Privacy Proxy ===="
	@echo ""
	@echo "    make run-with-privacy           - Start with privacy proxy"
	@echo "    make pull-privacy               - Pull latest privacy proxy image"
	@echo ""
	@echo "  ==== OVERHANGING: Blob DA ===="
	@echo ""
	@echo "    make run-with-blob    - Start with Blob DA enabled"
	@echo ""
	@echo "  ==== OVERHANGING: Hyperlane Bridge ===="
	@echo ""
	@echo "    make run-with-bridge  - Start with Hyperlane bridge + Warp UI"
	@echo "    ENABLE_HYPERLANE_BRIDGE=false make run - Disable default bridge infra"
	@echo "    ENABLE_BLOB_DA=false make run - Disable default Blob DA"
	@echo "    make bridge-setup     - Full setup (deploy + start relayer)"
	@echo "    make bridge-help      - Full bridge options"
	@echo ""
	@echo "  ==== OVERHANGING: AggLayer & Provers ===="
	@echo ""
	@echo "    make run-agglayer     - Start with AggLayer stack"
	@echo "    make run-zisk         - Shortcut for ZisK prover"
	@echo "    make prover-help      - Full prover options"
	@echo ""
	@echo "  ==== OVERHANGING: Polycli ===="
	@echo ""
	@echo "    make polycli-eoa      - EOA transfers (21k gas)"
	@echo "    make polycli-help     - Full polycli options"
	@echo ""
	@echo "  Configuration (.env file - sourced automatically):"
	@echo "    EXECUTION_LAYER       - reth (default), cdk-erigon, or gravity-reth"
	@echo "    GAS_LIMIT             - Block gas limit (default: 1000000000)"
	@echo "    MAX_TXS_PER_BLOCK     - Max txs per block (default: 25000)"
	@echo "    BLOCK_TIME_MS         - Block interval ms (default: 1000)"
	@echo "    TX_ORDERING           - fifo (default), tip_desc, tip_asc"
	@echo "    ENABLE_PRECONFIRMATIONS - WebSocket tx streaming (default: true, reth only)"
	@echo ""
	@echo "  Example: Override .env on command line:"
	@echo "    EXECUTION_LAYER=cdk-erigon make run"
	@echo "    BLOCK_TIME_MS=200 make run"
