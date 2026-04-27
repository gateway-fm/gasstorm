# =============================================================================
# Remote deploy targets (included from root Makefile)
# =============================================================================

# -----------------------------------------------------------------------------
# Remote deploy (staging on a single server)
# -----------------------------------------------------------------------------
# Usage:
#   make deploy-server SERVER=<server-ip>
#   make deploy-server-clean SERVER=<server-ip>
#
# Required env (locally or in .env):
#   GASSTORM_DOMAIN  - hostname pointed at the server
SSH_USER     ?= ubuntu
REMOTE_DIR   ?= /opt/gasstorm
SSH_OPTS     ?= -o StrictHostKeyChecking=accept-new

.PHONY: deploy-server deploy-server-clean _deploy-check

_deploy-check:
	@if [ -z "$(SERVER)" ]; then echo "ERROR: pass SERVER=<ip>, e.g. make deploy-server SERVER=<server-ip>"; exit 1; fi
	@if [ -z "$$GASSTORM_DOMAIN" ]; then echo "ERROR: GASSTORM_DOMAIN must be set (in env or .env)"; exit 1; fi

DEPLOY_FILES := deploy/docker-compose.prod.yaml deploy/deploy.sh

define DEPLOY_RECIPE
	@echo ">>> Deploying gasstorm to $(SSH_USER)@$(SERVER):$(REMOTE_DIR) (clean=$(1))"
	ssh $(SSH_OPTS) $(SSH_USER)@$(SERVER) "sudo mkdir -p $(REMOTE_DIR) && sudo chown $(SSH_USER):$(SSH_USER) $(REMOTE_DIR)"
	@echo ">>> Syncing deploy files"
	scp $(SSH_OPTS) $(DEPLOY_FILES) $(SSH_USER)@$(SERVER):$(REMOTE_DIR)/
	@echo ">>> Syncing repo"
	rsync -az --delete \
	  --exclude '.git' --exclude 'data' --exclude 'node_modules' \
	  --exclude 'dashboard/.next' --exclude 'dashboard/node_modules' \
	  --exclude 'site/.next' --exclude 'site/node_modules' \
	  --exclude 'lib/forge-std' --exclude '*.log' --exclude 'deploy/' \
	  -e "ssh $(SSH_OPTS)" \
	  ./ $(SSH_USER)@$(SERVER):$(REMOTE_DIR)/repo/
	@echo ">>> Syncing sibling repos (blockbuilder, loadgenerator, block-explorer)"
	rsync -az --delete --exclude '.git' --exclude 'node_modules' \
	  -e "ssh $(SSH_OPTS)" \
	  ../blockbuilder/ $(SSH_USER)@$(SERVER):$(REMOTE_DIR)/blockbuilder/
	rsync -az --delete --exclude '.git' --exclude 'node_modules' \
	  -e "ssh $(SSH_OPTS)" \
	  ../loadgenerator/ $(SSH_USER)@$(SERVER):$(REMOTE_DIR)/loadgenerator/
	rsync -az --delete --exclude '.git' --exclude 'node_modules' \
	  -e "ssh $(SSH_OPTS)" \
	  ../block-explorer/ $(SSH_USER)@$(SERVER):$(REMOTE_DIR)/block-explorer/
	@echo ">>> Running deploy script"
	ssh $(SSH_OPTS) $(SSH_USER)@$(SERVER) \
	  "cd $(REMOTE_DIR) && chmod +x deploy.sh && \
	   GASSTORM_DOMAIN='$$GASSTORM_DOMAIN' \
	   COMPOSE_PROFILE='$(COMPOSE_PROFILE)' \
	   CLEAN='$(1)' \
	   ./deploy.sh"
endef

deploy-server: _deploy-check
	$(call DEPLOY_RECIPE,0)

deploy-server-clean: _deploy-check
	$(call DEPLOY_RECIPE,1)

# -----------------------------------------------------------------------------
# Remote load generator deploy (separate server)
# -----------------------------------------------------------------------------
# Usage:
#   make deploy-loadgen SERVER=<main-stack-ip> LOADGEN_SERVER=<loadgen-ip>
#   make deploy-loadgen-clean SERVER=<main-stack-ip> LOADGEN_SERVER=<loadgen-ip>
LOADGEN_REMOTE_DIR ?= /opt/gasstorm-loadgen

.PHONY: deploy-loadgen deploy-loadgen-clean _deploy-loadgen-check

_deploy-loadgen-check:
	@if [ -z "$(LOADGEN_SERVER)" ]; then echo "ERROR: pass LOADGEN_SERVER=<ip>"; exit 1; fi
	@if [ -z "$(SERVER)" ]; then echo "ERROR: pass SERVER=<main-stack-ip>"; exit 1; fi

DEPLOY_LOADGEN_FILES := deploy/docker-compose.loadgen.prod.yaml deploy/deploy-loadgen.sh

define DEPLOY_LOADGEN_RECIPE
	@echo ">>> Deploying loadgen to $(SSH_USER)@$(LOADGEN_SERVER):$(LOADGEN_REMOTE_DIR) (clean=$(1))"
	ssh $(SSH_OPTS) $(SSH_USER)@$(LOADGEN_SERVER) "sudo mkdir -p $(LOADGEN_REMOTE_DIR) && sudo chown $(SSH_USER):$(SSH_USER) $(LOADGEN_REMOTE_DIR)"
	@echo ">>> Syncing deploy files"
	scp $(SSH_OPTS) $(DEPLOY_LOADGEN_FILES) $(SSH_USER)@$(LOADGEN_SERVER):$(LOADGEN_REMOTE_DIR)/
	@echo ">>> Syncing repo (compose files)"
	rsync -az --delete \
	  --exclude '.git' --exclude 'data' --exclude 'node_modules' \
	  --exclude 'dashboard' --exclude 'site' \
	  --exclude 'lib/forge-std' --exclude '*.log' --exclude 'deploy/' \
	  -e "ssh $(SSH_OPTS)" \
	  ./ $(SSH_USER)@$(LOADGEN_SERVER):$(LOADGEN_REMOTE_DIR)/repo/
	@echo ">>> Syncing loadgenerator source"
	rsync -az --delete --exclude '.git' --exclude 'node_modules' \
	  -e "ssh $(SSH_OPTS)" \
	  ../loadgenerator/ $(SSH_USER)@$(LOADGEN_SERVER):$(LOADGEN_REMOTE_DIR)/loadgenerator/
	@echo ">>> Running deploy script"
	ssh $(SSH_OPTS) $(SSH_USER)@$(LOADGEN_SERVER) \
	  "cd $(LOADGEN_REMOTE_DIR) && chmod +x deploy-loadgen.sh && \
	   MAIN_SERVER_HOST='$(SERVER)' \
	   COMPOSE_PROFILE='$(COMPOSE_PROFILE)' \
	   CLEAN='$(1)' \
	   ./deploy-loadgen.sh"
endef

deploy-loadgen: _deploy-loadgen-check
	$(call DEPLOY_LOADGEN_RECIPE,0)

deploy-loadgen-clean: _deploy-loadgen-check
	$(call DEPLOY_LOADGEN_RECIPE,1)

# -----------------------------------------------------------------------------
# 3-Way Split Deploy (chain / explorer / main servers)
# -----------------------------------------------------------------------------
# Usage:
#   make deploy-chain SERVER=<chain-ip>
#   make deploy-explorer SERVER=<chain-ip> EXPLORER_SERVER=<explorer-ip>
#   make deploy-main SERVER=<chain-ip> EXPLORER_SERVER=<explorer-ip> MAIN_SERVER=<main-ip>
#
# SERVER always refers to the chain server IP (both explorer and main need it).
CHAIN_REMOTE_DIR   ?= /opt/gasstorm-chain
EXPLORER_REMOTE_DIR ?= /opt/gasstorm-explorer
MAIN_REMOTE_DIR    ?= /opt/gasstorm-main

EXPLORER_SERVER ?=
MAIN_SERVER ?=

# --- Chain server ---
.PHONY: _deploy-chain-check
_deploy-chain-check:
	@if [ -z "$(SERVER)" ]; then echo "ERROR: pass SERVER=<chain-ip>"; exit 1; fi

DEPLOY_CHAIN_FILES := deploy/docker-compose.chain.prod.yaml deploy/deploy-chain.sh

define DEPLOY_CHAIN_RECIPE
	@echo ">>> Deploying chain stack to $(SSH_USER)@$(SERVER):$(CHAIN_REMOTE_DIR) (clean=$(1))"
	ssh $(SSH_OPTS) $(SSH_USER)@$(SERVER) "sudo mkdir -p $(CHAIN_REMOTE_DIR) && sudo chown $(SSH_USER):$(SSH_USER) $(CHAIN_REMOTE_DIR)"
	@echo ">>> Syncing deploy files"
	scp $(SSH_OPTS) $(DEPLOY_CHAIN_FILES) $(SSH_USER)@$(SERVER):$(CHAIN_REMOTE_DIR)/
	@echo ">>> Syncing repo"
	rsync -az --delete \
	  --exclude '.git' --exclude 'data' --exclude 'node_modules' \
	  --exclude 'dashboard/.next' --exclude 'dashboard/node_modules' \
	  --exclude 'site/.next' --exclude 'site/node_modules' \
	  --exclude 'lib/forge-std' --exclude '*.log' --exclude 'deploy/' \
	  -e "ssh $(SSH_OPTS)" \
	  ./ $(SSH_USER)@$(SERVER):$(CHAIN_REMOTE_DIR)/repo/
	@echo ">>> Syncing blockbuilder source"
	rsync -az --delete --exclude '.git' --exclude 'node_modules' \
	  -e "ssh $(SSH_OPTS)" \
	  ../blockbuilder/ $(SSH_USER)@$(SERVER):$(CHAIN_REMOTE_DIR)/blockbuilder/
	@echo ">>> Running deploy script"
	ssh $(SSH_OPTS) $(SSH_USER)@$(SERVER) \
	  "cd $(CHAIN_REMOTE_DIR) && chmod +x deploy-chain.sh && \
	   COMPOSE_PROFILE='$(COMPOSE_PROFILE)' \
	   CLEAN='$(1)' \
	   ./deploy-chain.sh"
endef

deploy-chain: _deploy-chain-check
	$(call DEPLOY_CHAIN_RECIPE,0)

deploy-chain-clean: _deploy-chain-check
	$(call DEPLOY_CHAIN_RECIPE,1)

# --- Explorer server ---
.PHONY: _deploy-explorer-check
_deploy-explorer-check:
	@if [ -z "$(SERVER)" ]; then echo "ERROR: pass SERVER=<chain-ip>"; exit 1; fi
	@if [ -z "$(EXPLORER_SERVER)" ]; then echo "ERROR: pass EXPLORER_SERVER=<explorer-ip>"; exit 1; fi
	@if [ -z "$(MAIN_SERVER)" ]; then echo "ERROR: pass MAIN_SERVER=<main-ip> (public IP for SSO redirects)"; exit 1; fi

DEPLOY_EXPLORER_FILES := deploy/docker-compose.explorer.prod.yaml deploy/deploy-explorer.sh

define DEPLOY_EXPLORER_RECIPE
	@echo ">>> Deploying explorer to $(SSH_USER)@$(EXPLORER_SERVER):$(EXPLORER_REMOTE_DIR) (clean=$(1))"
	ssh $(SSH_OPTS) $(SSH_USER)@$(EXPLORER_SERVER) "sudo mkdir -p $(EXPLORER_REMOTE_DIR) && sudo chown $(SSH_USER):$(SSH_USER) $(EXPLORER_REMOTE_DIR)"
	@echo ">>> Syncing deploy files"
	scp $(SSH_OPTS) $(DEPLOY_EXPLORER_FILES) $(SSH_USER)@$(EXPLORER_SERVER):$(EXPLORER_REMOTE_DIR)/
	@echo ">>> Syncing repo (compose + config files)"
	rsync -az --delete \
	  --exclude '.git' --exclude 'data' --exclude 'node_modules' \
	  --exclude 'dashboard' --exclude 'site' \
	  --exclude 'lib/forge-std' --exclude '*.log' --exclude 'deploy/' \
	  -e "ssh $(SSH_OPTS)" \
	  ./ $(SSH_USER)@$(EXPLORER_SERVER):$(EXPLORER_REMOTE_DIR)/repo/
	@echo ">>> Syncing block-explorer source"
	rsync -az --delete --exclude '.git' --exclude 'node_modules' \
	  -e "ssh $(SSH_OPTS)" \
	  ../block-explorer/ $(SSH_USER)@$(EXPLORER_SERVER):$(EXPLORER_REMOTE_DIR)/block-explorer/
	@echo ">>> Syncing privacy-proxy source"
	rsync -az --delete --exclude '.git' --exclude 'node_modules' \
	  -e "ssh $(SSH_OPTS)" \
	  ../privacy-proxy/ $(SSH_USER)@$(EXPLORER_SERVER):$(EXPLORER_REMOTE_DIR)/privacy-proxy/
	@echo ">>> Running deploy script"
	ssh $(SSH_OPTS) $(SSH_USER)@$(EXPLORER_SERVER) \
	  "cd $(EXPLORER_REMOTE_DIR) && chmod +x deploy-explorer.sh && \
	   CHAIN_SERVER='$(SERVER)' \
	   MAIN_SERVER_PUBLIC='$(or $(GASSTORM_DOMAIN),$(MAIN_SERVER))' \
	   EXPLORER_PUBLIC='$(EXPLORER_SERVER)' \
	   COMPOSE_PROFILE='$(COMPOSE_PROFILE)' \
	   CLEAN='$(1)' \
	   ./deploy-explorer.sh"
endef

deploy-explorer: _deploy-explorer-check
	$(call DEPLOY_EXPLORER_RECIPE,0)

deploy-explorer-clean: _deploy-explorer-check
	$(call DEPLOY_EXPLORER_RECIPE,1)

# --- Main server (dashboard + loadgen + docs) ---
.PHONY: _deploy-main-check
_deploy-main-check:
	@if [ -z "$(SERVER)" ]; then echo "ERROR: pass SERVER=<chain-ip>"; exit 1; fi
	@if [ -z "$(EXPLORER_SERVER)" ]; then echo "ERROR: pass EXPLORER_SERVER=<explorer-ip>"; exit 1; fi
	@if [ -z "$(MAIN_SERVER)" ]; then echo "ERROR: pass MAIN_SERVER=<main-ip>"; exit 1; fi

DEPLOY_MAIN_FILES := deploy/docker-compose.main.prod.yaml deploy/deploy-main.sh

define DEPLOY_MAIN_RECIPE
	@echo ">>> Deploying main stack to $(SSH_USER)@$(MAIN_SERVER):$(MAIN_REMOTE_DIR) (clean=$(1))"
	ssh $(SSH_OPTS) $(SSH_USER)@$(MAIN_SERVER) "sudo mkdir -p $(MAIN_REMOTE_DIR) && sudo chown $(SSH_USER):$(SSH_USER) $(MAIN_REMOTE_DIR)"
	@echo ">>> Syncing deploy files"
	scp $(SSH_OPTS) $(DEPLOY_MAIN_FILES) $(SSH_USER)@$(MAIN_SERVER):$(MAIN_REMOTE_DIR)/
	@echo ">>> Syncing repo"
	rsync -az --delete \
	  --exclude '.git' --exclude 'data' --exclude 'node_modules' \
	  --exclude 'dashboard/.next' --exclude 'dashboard/node_modules' \
	  --exclude 'site/.next' --exclude 'site/node_modules' \
	  --exclude '*.log' --exclude 'deploy/' \
	  -e "ssh $(SSH_OPTS)" \
	  ./ $(SSH_USER)@$(MAIN_SERVER):$(MAIN_REMOTE_DIR)/repo/
	@echo ">>> Syncing loadgenerator source"
	rsync -az --delete --exclude '.git' --exclude 'node_modules' \
	  -e "ssh $(SSH_OPTS)" \
	  ../loadgenerator/ $(SSH_USER)@$(MAIN_SERVER):$(MAIN_REMOTE_DIR)/loadgenerator/
	@echo ">>> Running deploy script"
	ssh $(SSH_OPTS) $(SSH_USER)@$(MAIN_SERVER) \
	  "cd $(MAIN_REMOTE_DIR) && chmod +x deploy-main.sh && \
	   CHAIN_SERVER='$(SERVER)' \
	   EXPLORER_SERVER='$(EXPLORER_SERVER)' \
	   EXPLORER_SERVER_PUBLIC='$(or $(EXPLORER_PUBLIC),$(EXPLORER_SERVER))' \
	   MAIN_SERVER_PUBLIC='$(MAIN_SERVER)' \
	   EXTERNAL_L1_RPC='$(EXTERNAL_L1_RPC)' \
	   EXTERNAL_L1_CHAIN_NAME='$(EXTERNAL_L1_CHAIN_NAME)' \
	   COMPOSE_PROFILE='$(COMPOSE_PROFILE)' \
	   CLEAN='$(1)' \
	   ./deploy-main.sh"
endef

deploy-main: _deploy-main-check
	$(call DEPLOY_MAIN_RECIPE,0)

deploy-main-clean: _deploy-main-check
	$(call DEPLOY_MAIN_RECIPE,1)
