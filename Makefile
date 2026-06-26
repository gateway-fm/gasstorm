.PHONY: up down _up run run-build run-reth run-cdk-erigon run-metal stop-metal restart-metal run-attached stop restart logs status resource-report clean clean-metal build test test-load-generator test-dashboard test-tx bench-load-generator dev dev-infra dev-loadgen dev-dashboard dev-stop dev-cdk-erigon bridge-deploy bridge-relayer bridge-relayer-stop bridge-logs bridge-deposit bridge-withdraw bridge-balances bridge-setup bridge-help run-with-blob run-with-explorer run-with-privacy run-with-explorer-privacy pull-explorer pull-privacy run-zisk test-zisk prover-status prover-prove prover-proofs prover-help setup-hooks pull-blockbuilder pull-loadgenerator mcp-server mcp-build site-dev site-build tunnel-url _print-tunnel-url loadtest-privacy loadtest-direct loadtest-external-privacy run-high-throughput run-fast-confirm run-with-preconf run-conservative run-flashblocks run-gravity-reth run-with-bridge run-agglayer stop-agglayer test-contract test-e2e test-integration test-integration-quick test-smoke test-address-stats-rebuild balance

# =============================================================================
# Configuration: Source .env file if it exists
# =============================================================================
-include .env
export

COMPOSE_DIR := docker

# Include deploy targets from deploy/Makefile
include deploy/Makefile

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

# Lego stack startup defaults
MODE ?= docker
PROFILE ?= $(COMPOSE_PROFILE)
WITH ?=
L1 ?= anvil
BUILD_LOCAL ?= false
ATTACHED ?= false

# Legacy toggles retained for compatibility in older targets.
ENABLE_HYPERLANE_BRIDGE ?= false
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

# Composable stack startup (internal — use 'make up' for the full dev stack).
# Advanced usage:
#   make _up MODE=docker PROFILE=reth WITH=blob,privacy,explorer,bridge,bridge-ui
#   make _up PROFILE=cdk-erigon WITH=bridge,explorer
#   make _up PROFILE=reth L1=besu WITH=bridge,explorer
#   make _up MODE=metal
_up: mcp-build
	@set -e; \
	mode="$(MODE)"; \
	profile="$(PROFILE)"; \
	with_raw="$(WITH)"; \
	l1="$(L1)"; \
	build_local="$(BUILD_LOCAL)"; \
	attached="$(ATTACHED)"; \
	if [ "$$mode" != "docker" ] && [ "$$mode" != "metal" ]; then \
		echo "Error: MODE must be 'docker' or 'metal' (got '$$mode')."; \
		exit 1; \
	fi; \
	if [ "$$mode" = "docker" ] && [ -z "$$(printf "%s" "$$with_raw" | tr -d '[:space:]')" ]; then \
		if [ "$$l1" = "anvil" ] || [ "$$l1" = "besu" ]; then \
			if [ "$$profile" = "reth" ] && [ "$$l1" = "anvil" ]; then \
				with_raw="blob,privacy,explorer"; \
			else \
				with_raw="privacy,explorer"; \
			fi; \
		else \
			with_raw="privacy"; \
		fi; \
	fi; \
	if [ "$$mode" = "metal" ]; then \
		if [ -n "$$(printf "%s" "$$with_raw" | tr -d '[:space:]')" ]; then \
			echo "Error: MODE=metal supports core services only."; \
			echo "Use MODE=docker for optional features (blob/privacy/explorer/bridge)."; \
			exit 1; \
		fi; \
		./scripts/run-metal.sh; \
		exit 0; \
	fi; \
	profiles="--profile $$profile"; \
	bridge_enabled=0; \
	bridge_ui_enabled=0; \
	has_privacy=""; \
	has_explorer=""; \
	for raw_feat in $$(printf "%s" "$$with_raw" | tr ',' ' '); do \
		feat=$$(printf "%s" "$$raw_feat" | tr '[:upper:]' '[:lower:]'); \
		case "$$feat" in \
			"") ;; \
			blob) \
				if [ "$$l1" = "besu" ]; then \
					echo "Error: 'blob' requires EIP-4844 (Besu Clique doesn't support Cancun). Use L1=anvil."; exit 1; \
				elif [ "$$l1" != "anvil" ]; then \
					echo "Error: 'blob' is not supported with external L1 (requires local EIP-4844 chain). Use L1=anvil."; exit 1; \
				elif [ "$$profile" = "reth" ]; then \
					profiles="$$profiles --profile blob"; \
				elif [ "$$profile" = "cdk-erigon" ]; then \
					profiles="$$profiles --profile blob-cdk"; \
				else \
					echo "Error: 'blob' is only supported with PROFILE=reth or PROFILE=cdk-erigon."; \
					exit 1; \
				fi; \
				;; \
			privacy) \
				if [ "$$profile" = "cdk-erigon" ]; then \
					profiles="$$profiles --profile privacy-cdk"; \
				else \
					profiles="$$profiles --profile privacy"; \
				fi; \
				has_privacy=1; \
				;; \
			explorer) \
				if [ "$$profile" = "cdk-erigon" ]; then \
					profiles="$$profiles --profile explorer-cdk --profile explorer-l1"; \
				else \
					profiles="$$profiles --profile explorer --profile explorer-l1"; \
				fi; \
				has_explorer=1; \
				;; \
			bridge) \
				if [ "$$profile" != "reth" ] && [ "$$profile" != "cdk-erigon" ]; then \
					echo "Error: 'bridge' requires PROFILE=reth or PROFILE=cdk-erigon."; exit 1; \
				fi; \
				profiles="$$profiles --profile bridge"; \
				bridge_enabled=1; \
				;; \
			bridge-ui|bridge_ui) \
				if [ "$$profile" != "reth" ] && [ "$$profile" != "cdk-erigon" ]; then \
					echo "Error: 'bridge-ui' requires PROFILE=reth or PROFILE=cdk-erigon."; exit 1; \
				fi; \
				profiles="$$profiles --profile bridge-ui"; \
				bridge_ui_enabled=1; \
				;; \
			*) \
				echo "Error: unknown feature '$$feat'. Valid: blob, privacy, explorer, bridge, bridge-ui"; \
				exit 1; \
				;; \
		esac; \
	done; \
	if [ "$$bridge_ui_enabled" -eq 1 ] && [ "$$bridge_enabled" -eq 0 ]; then \
		echo "Error: 'bridge-ui' requires 'bridge' in WITH."; \
		exit 1; \
	fi; \
	compose_files=""; \
	if [ "$$build_local" = "true" ]; then \
		compose_files="-f docker/docker-compose.yml -f docker/docker-compose.build.yaml"; \
	fi; \
	if [ "$$build_local" = "true" ] && [ -n "$$has_explorer" ]; then \
		compose_files="$$compose_files -f docker/docker-compose.explorer-build.yaml"; \
	fi; \
	if [ -n "$$has_privacy" ] && [ -n "$$has_explorer" ]; then \
		if [ -z "$$compose_files" ]; then \
			compose_files="-f docker/docker-compose.yml"; \
		fi; \
		if [ "$$profile" = "cdk-erigon" ]; then \
			compose_files="$$compose_files -f docker/docker-compose-privacy-explorer-cdk.yaml"; \
		else \
			compose_files="$$compose_files -f docker/docker-compose-privacy-explorer.yaml"; \
		fi; \
	fi; \
	if [ -n "$$has_privacy" ]; then \
		export PRIVACY_RPC_URL="http://privacy-proxy:8080"; \
		export PRIVACY_AUTH_TOKEN_FILE="/shared/loadtest-jwt.txt"; \
	fi; \
	if [ "$$l1" = "besu" ]; then \
		if [ -z "$$compose_files" ]; then \
			compose_files="-f docker/docker-compose.yml"; \
		fi; \
		compose_files="$$compose_files -f docker/docker-compose-besu-l1.yaml"; \
	elif [ "$$l1" != "anvil" ]; then \
		l1_config="config/l1/$$l1.env"; \
		if [ ! -f "$$l1_config" ]; then \
			echo "Error: L1='$$l1' is not 'anvil' or 'besu', and $$l1_config does not exist."; \
			echo "Create it from config/l1/example.env:"; \
			echo "  cp config/l1/example.env $$l1_config"; \
			exit 1; \
		fi; \
		set -a; . ./$$l1_config; set +a; \
		if [ -z "$${EXTERNAL_L1_RPC:-}" ]; then \
			echo "Error: EXTERNAL_L1_RPC is not set in $$l1_config"; exit 1; \
		fi; \
		export L1_NAME="$$l1"; \
		export EXTERNAL_L1_CHAIN_NAME="$${EXTERNAL_L1_CHAIN_NAME:-$$l1}"; \
		if [ -z "$$compose_files" ]; then \
			compose_files="-f docker/docker-compose.yml"; \
		fi; \
		compose_files="$$compose_files -f docker/docker-compose-external-l1.yaml"; \
	fi; \
	if [ "$$bridge_enabled" -eq 1 ] && [ "$$l1" != "anvil" ] && [ "$$l1" != "besu" ]; then \
		if [ -z "$${EXTERNAL_L1_KEY:-}" ]; then \
			echo "Error: WITH=bridge requires EXTERNAL_L1_KEY in config/l1/$$l1.env"; exit 1; \
		fi; \
	fi; \
	if [ "$$bridge_enabled" -eq 1 ] && [ "$$profile" = "cdk-erigon" ]; then \
		if [ -z "$$compose_files" ]; then \
			compose_files="-f docker/docker-compose.yml"; \
		fi; \
		if [ "$$l1" = "besu" ]; then \
			compose_files="$$compose_files -f docker/docker-compose-besu-cdk-erigon-bridge.yaml"; \
		elif [ "$$l1" != "anvil" ]; then \
			compose_files="$$compose_files -f docker/docker-compose-external-cdk-erigon-bridge.yaml"; \
		else \
			compose_files="$$compose_files -f docker/docker-compose-cdk-erigon-bridge.yaml"; \
		fi; \
	fi; \
	build_flag=""; \
	detach_flag="-d"; \
	if [ "$$build_local" = "true" ] || [ "$$attached" = "true" ]; then \
		build_flag="--build"; \
	fi; \
	if [ "$$attached" = "true" ]; then \
		detach_flag=""; \
	fi; \
	docker compose $$profiles $$compose_files up $$build_flag $$detach_flag; \
	$(MAKE) --no-print-directory _print-tunnel-url

# Start the default Docker stack using current EXECUTION_LAYER mapping.
run:
	@$(MAKE) --no-print-directory _up MODE=docker PROFILE=$(COMPOSE_PROFILE)

# Build from local sibling repos (../blockbuilder, ../loadgenerator) and run everything
run-build:
	@$(MAKE) --no-print-directory _up MODE=docker PROFILE=$(COMPOSE_PROFILE) BUILD_LOCAL=true

# Start op-reth core stack only (no optional profiles)
run-reth:
	@$(MAKE) --no-print-directory _up MODE=docker PROFILE=reth WITH=

# Start default Docker stack with logs attached
run-attached:
	@$(MAKE) --no-print-directory _up MODE=docker PROFILE=$(COMPOSE_PROFILE) ATTACHED=true

# Start in native "Metal" mode (no Docker, maximum performance)
# Requires: op-reth, go, node installed locally, sibling repos (../blockbuilder, ../loadgenerator)
run-metal:
	@$(MAKE) --no-print-directory _up MODE=metal WITH=

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
				echo "(open localhost:18301 -- QR callbacks route through tunnel automatically)"; \
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

# Start the full local stack: L1/L2, block builder, load generator, privacy, explorer.
# Builds from local sibling repos, 1s blocks, empty blocks enabled.
up:
	@echo "Stopping existing stack..."
	@docker compose -f $(COMPOSE_DIR)/docker-compose.loadgen.yaml --profile reth down 2>/dev/null || true
	@docker compose -f $(COMPOSE_DIR)/docker-compose.yml -f $(COMPOSE_DIR)/docker-compose.build.yaml -f $(COMPOSE_DIR)/docker-compose-privacy-explorer.yaml --profile reth --profile explorer --profile explorer-l1 --profile privacy down -v --remove-orphans 2>/dev/null || true
	@docker volume create gasstorm_hyperlane-config >/dev/null 2>&1 || true
	@docker volume create gasstorm_privacy-loadtest-config >/dev/null 2>&1 || true
	@echo "Starting stack (1s blocks, privacy + explorer, local builds)..."
	BLOCK_TIME_MS=1000 \
	SKIP_EMPTY_BLOCKS=false \
	$(MAKE) --no-print-directory _up MODE=docker PROFILE=reth BUILD_LOCAL=true WITH=privacy,explorer
	@echo "Starting load generator..."
	@BLOCK_TIME_MS=1000 docker compose -f $(COMPOSE_DIR)/docker-compose.loadgen.yaml --profile reth up --build -d
	@echo ""
	@echo "Dev stack ready:"
	@echo "  Dashboard:     http://localhost:18000"
	@echo "  Explorer:      http://localhost:18201  (L2 default; switch to L1 via Networks dropdown — backend on :18203)"
	@echo "  Privacy UI:    http://localhost:18301"
	@echo "  Privacy Proxy: http://localhost:18300"

# Stop the full stack and remove volumes.
down:
	@docker compose -f $(COMPOSE_DIR)/docker-compose.loadgen.yaml --profile reth down 2>/dev/null || true
	@docker compose -f $(COMPOSE_DIR)/docker-compose.yml -f $(COMPOSE_DIR)/docker-compose.build.yaml -f $(COMPOSE_DIR)/docker-compose-privacy-explorer.yaml --profile reth --profile explorer --profile explorer-l1 --profile privacy down -v --remove-orphans 2>/dev/null || true
	@echo "Stack stopped."

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
	docker compose -f $(COMPOSE_DIR)/docker-compose.yml -f $(COMPOSE_DIR)/docker-compose-external-l1.yaml --profile reth --profile cdk-erigon --profile bridge --profile bridge-ui --profile explorer --profile explorer-l1 --profile explorer-cdk --profile privacy --profile privacy-cdk down 2>/dev/null || true
	docker compose -f $(COMPOSE_DIR)/docker-compose-base.yaml -f $(COMPOSE_DIR)/docker-compose-gravity-reth.yaml down 2>/dev/null || true

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
	docker compose -f $(COMPOSE_DIR)/docker-compose.yml -f $(COMPOSE_DIR)/docker-compose-external-l1.yaml --profile reth --profile cdk-erigon --profile bridge --profile bridge-ui --profile explorer --profile explorer-l1 --profile explorer-cdk --profile privacy --profile privacy-cdk ps 2>/dev/null || true
	docker compose -f $(COMPOSE_DIR)/docker-compose-base.yaml -f $(COMPOSE_DIR)/docker-compose-gravity-reth.yaml ps 2>/dev/null || true

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
	docker compose -f $(COMPOSE_DIR)/docker-compose.yml -f $(COMPOSE_DIR)/docker-compose-external-l1.yaml --profile reth --profile cdk-erigon --profile bridge --profile bridge-ui --profile explorer --profile explorer-l1 --profile explorer-cdk --profile privacy --profile privacy-cdk down -v 2>/dev/null || true
	docker compose -f $(COMPOSE_DIR)/docker-compose-base.yaml -f $(COMPOSE_DIR)/docker-compose-gravity-reth.yaml down -v 2>/dev/null || true
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

test-address-stats-rebuild:
	@echo "Running address_stats rebuild-loop e2e (stack must be running)..."
	./scripts/e2e-address-stats-rebuild.sh

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

# Pull latest block-explorer + chain-indexer images
pull-explorer:
	docker pull gatewayfm/block-explorer-api:main
	docker pull gatewayfm/block-explorer-frontend:main
	docker pull ghcr.io/gateway-fm/chain-indexer:main
	@echo "Pulled gatewayfm/block-explorer-{api,frontend}:main and ghcr.io/gateway-fm/chain-indexer:main"

# #############################################################################
# Other Execution Layers (cdk-erigon, gravity-reth)
# #############################################################################

# Start with cdk-erigon (standalone sequencer)
run-cdk-erigon:
	docker compose --profile cdk-erigon up --build -d

# Start with gravity-reth (high-performance parallel EVM, standalone sequencer)
# First build takes 15-25 minutes (Rust compilation from source)
run-gravity-reth:
	docker compose -f $(COMPOSE_DIR)/docker-compose-base.yaml -f $(COMPOSE_DIR)/docker-compose-gravity-reth.yaml up --build -d

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
	@$(MAKE) --no-print-directory _up MODE=docker PROFILE=$(COMPOSE_PROFILE) WITH=blob

# Start with Hyperlane bridge enabled (includes Warp UI)
run-with-bridge:
	@$(MAKE) --no-print-directory _up MODE=docker PROFILE=reth WITH=bridge,bridge-ui

# Start with block explorer enabled (indexes blocks/txs)
run-with-explorer:
	@$(MAKE) --no-print-directory _up MODE=docker PROFILE=$(COMPOSE_PROFILE) WITH=explorer

# Start with privacy proxy enabled (RPC access control)
run-with-privacy:
	@$(MAKE) --no-print-directory _up MODE=docker PROFILE=$(COMPOSE_PROFILE) WITH=privacy

# Start with both explorer and privacy proxy
run-with-explorer-privacy:
	@$(MAKE) --no-print-directory _up MODE=docker PROFILE=$(COMPOSE_PROFILE) WITH=explorer,privacy

# #############################################################################
# Hyperlane Bridge
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
	@echo "  make up                   - Default reth stack (no bridge, includes blob/privacy/explorer)"
	@echo "  make up WITH=bridge,bridge-ui,blob,privacy,explorer - Start full stack with bridge"
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

# #############################################################################
# AggLayer & Provers
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

# =============================================================================
# Privacy Load Testing
# =============================================================================

loadtest-privacy: ## Start stack with privacy proxy for load testing
	$(MAKE) _up PROFILE=reth WITH=privacy,explorer

loadtest-direct: ## Start stack without privacy for baseline comparison
	$(MAKE) _up PROFILE=reth WITH=explorer

loadtest-external-privacy: ## Load-test a THIRD PARTY's privacy proxy (PRIVACY=<name>, see config/privacy/example.env)
	@if [ -z "$(PRIVACY)" ]; then \
		echo "Usage: make loadtest-external-privacy PRIVACY=<name>   (reads config/privacy/<name>.env)"; \
		echo "Create it from the template: cp config/privacy/example.env config/privacy/<name>.env"; \
		exit 1; \
	fi
	@privacy_config="config/privacy/$(PRIVACY).env"; \
	if [ ! -f "$$privacy_config" ]; then \
		echo "Error: $$privacy_config not found. Create it from config/privacy/example.env:"; \
		echo "  cp config/privacy/example.env $$privacy_config"; \
		exit 1; \
	fi; \
	set -a; . ./$$privacy_config; set +a; \
	if [ -z "$${PRIVACY_RPC_URL:-}" ]; then echo "Error: PRIVACY_RPC_URL not set in $$privacy_config"; exit 1; fi; \
	export PRIVACY_RPC_URL PRIVACY_ORG_ID; \
	docker network create gasstorm >/dev/null 2>&1 || true; \
	docker compose -f $(COMPOSE_DIR)/docker-compose.loadgen.yaml -f $(COMPOSE_DIR)/docker-compose-external-privacy.yaml --profile reth up --build -d load-generator dashboard privacy-token-receiver; \
	echo ""; \
	echo "External-privacy load test ready (no bundled proxy/chain):"; \
	echo "  Dashboard:  http://localhost:$${DASHBOARD_PORT:-18000}"; \
	echo "  Proxy:      $$PRIVACY_RPC_URL$${PRIVACY_ORG_ID:+/rpc/$$PRIVACY_ORG_ID}"; \
	echo "  Next: open the dashboard, choose 'Through Privacy Proxy', paste a fresh JWT, then Start."

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
	@echo "GasStorm - EVM sequencer stress-testing toolkit"
	@echo ""
	@echo "  Stack:"
	@echo "    make up                    - Start default stack (reth + blob + privacy + explorer)"
	@echo "    make up WITH=bridge,blob   - Start with specific features"
	@echo "    make up PROFILE=cdk-erigon - Start with cdk-erigon"
	@echo "    make up L1=besu            - Start with Besu L1"
	@echo "    make up MODE=metal         - Native mode (no Docker)"
	@echo "    make run-build             - Build from local repos and start"
	@echo ""
	@echo "  Lifecycle:"
	@echo "    make stop / restart / logs / status / clean"
	@echo "    make resource-report       - Container CPU/RAM + disk usage"
	@echo ""
	@echo "  Dev (HMR):"
	@echo "    make dev                   - Full local dev (loadgen + dashboard locally)"
	@echo "    make dev-stack             - Dev stack with privacy + explorer (Docker)"
	@echo "    make dev-cdk-erigon        - CDK-Erigon dev mode"
	@echo ""
	@echo "  Performance Profiles:"
	@echo "    make run-high-throughput   - 1B gas, 100ms blocks"
	@echo "    make run-fast-confirm      - 150M gas, 50ms blocks"
	@echo "    make run-conservative      - 30M gas, 2s blocks"
	@echo "    make run-flashblocks       - 500M gas, 500ms + preconf"
	@echo ""
	@echo "  Testing:"
	@echo "    make test                  - Dashboard lint"
	@echo "    make test-tx / balance     - Send test TX / check balance"
	@echo "    make test-e2e              - E2E tests (requires running stack)"
	@echo "    make test-integration      - Full integration suite"
	@echo ""
	@echo "  Bridge:"
	@echo "    make run-with-bridge       - Start with Hyperlane bridge"
	@echo "    make bridge-help           - Full bridge options"
	@echo ""
	@echo "  Provers:"
	@echo "    make run-agglayer          - Start with AggLayer"
	@echo "    make prover-help           - Full prover options"
	@echo ""
	@echo "  Deploy:"
	@echo "    make deploy-server SERVER=<ip>   - Single-server deploy"
	@echo "    make deploy-chain SERVER=<ip>    - Chain server (3-way split)"
	@echo "    make deploy-explorer ...         - Explorer server"
	@echo "    make deploy-main ...             - Main server (dashboard + loadgen)"
	@echo ""
	@echo "  Config (.env):"
	@echo "    EXECUTION_LAYER, GAS_LIMIT, BLOCK_TIME_MS, TX_ORDERING,"
	@echo "    MAX_TXS_PER_BLOCK, ENABLE_PRECONFIRMATIONS, SKIP_EMPTY_BLOCKS"
