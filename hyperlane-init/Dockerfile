# Hyperlane Init Container
# Deploys Hyperlane core contracts via CLI, warp routes via ethers.js

FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl bash jq python3 python3-pip build-essential git ca-certificates libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Install pycryptodome for keccak hashing
RUN pip3 install --break-system-packages pycryptodome

# Foundry (forge, cast)
ARG FOUNDRY_VERSION=nightly-5b7e4cb3c882b28f3c32ba580de27ce7381f415a
ARG FOUNDRY_SHA256=skip
ARG TARGETARCH
RUN if [ "${TARGETARCH}" = "arm64" ]; then FOUNDRY_ARCH=arm64; else FOUNDRY_ARCH=amd64; fi && \
    curl -L "https://github.com/foundry-rs/foundry/releases/download/${FOUNDRY_VERSION}/foundry_nightly_linux_${FOUNDRY_ARCH}.tar.gz" -o foundry.tar.gz && \
    if [ "$FOUNDRY_SHA256" != "skip" ]; then echo "${FOUNDRY_SHA256}  foundry.tar.gz" | sha256sum -c -; fi && \
    tar -xzf foundry.tar.gz -C /usr/local/bin && rm foundry.tar.gz && \
    chmod +x /usr/local/bin/forge /usr/local/bin/cast /usr/local/bin/anvil /usr/local/bin/chisel
ENV PATH="/usr/local/bin:${PATH}"

# Hyperlane CLI (v29 for production contracts)
RUN npm install -g @hyperlane-xyz/cli@29.0.1

WORKDIR /app

# Copy deployment scripts and configs
COPY hyperlane-init/deploy.sh /app/
COPY hyperlane-init/deploy-warp.mjs /app/
COPY hyperlane-init/chains/ /app/chains/
COPY hyperlane-init/core-config.yaml /app/
COPY hyperlane-init/warp-config.yaml /app/

# Copy Solidity contracts for forge build + MockUSDC deployment
COPY contracts/ /app/contracts/
COPY script/ /app/script/
COPY src/ /app/src/
COPY foundry.toml /app/foundry.toml
COPY lib/ /app/lib/

# Install Node.js deps for warp deployer and compile Solidity
RUN npm init -y && npm install ethers@6 yaml
RUN forge build

RUN chmod +x /app/deploy.sh

ENTRYPOINT ["/app/deploy.sh"]
