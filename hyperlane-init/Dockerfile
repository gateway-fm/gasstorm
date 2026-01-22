# Hyperlane Init Container
# Deploys Hyperlane core and warp route contracts on startup

# Use glibc-based image for Foundry compatibility
FROM --platform=linux/amd64 node:20-slim

# Install dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl bash jq python3 python3-pip build-essential git ca-certificates libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Install pycryptodome for keccak hashing
RUN pip3 install --break-system-packages pycryptodome

# Foundry version - pinned for reproducibility
# Update version and checksum when upgrading
ARG FOUNDRY_VERSION=nightly-5b7e4cb3c882b28f3c32ba580de27ce7381f415a
# SHA256 checksum for foundry_nightly_linux_amd64.tar.gz
# Note: Foundry nightly releases don't provide official checksums.
# Verify manually: curl -sL <url> | sha256sum
ARG FOUNDRY_SHA256=skip

# Install Foundry (forge, cast, anvil) directly from releases
RUN curl -L https://github.com/foundry-rs/foundry/releases/download/${FOUNDRY_VERSION}/foundry_nightly_linux_amd64.tar.gz -o foundry.tar.gz && \
    if [ "$FOUNDRY_SHA256" != "skip" ]; then \
        echo "${FOUNDRY_SHA256}  foundry.tar.gz" | sha256sum -c -; \
    fi && \
    tar -xzf foundry.tar.gz -C /usr/local/bin && \
    rm foundry.tar.gz && \
    chmod +x /usr/local/bin/forge /usr/local/bin/cast /usr/local/bin/anvil /usr/local/bin/chisel

# Add foundry to PATH
ENV PATH="/usr/local/bin:${PATH}"

# Install Hyperlane CLI globally
RUN npm install -g @hyperlane-xyz/cli@8.9.0

# Create working directory
WORKDIR /app

# Copy deployment scripts and configs (from context root)
COPY hyperlane-init/deploy.sh /app/
COPY hyperlane-init/chains/ /app/chains/
COPY hyperlane-init/core-config.yaml /app/
COPY hyperlane-init/warp-config.yaml /app/
# Copy Foundry contracts and scripts
COPY contracts/ /app/contracts/
COPY script/ /app/script/
COPY src/ /app/src/
COPY foundry.toml /app/foundry.toml
# Copy lib directory for forge-std
COPY lib/ /app/lib/

RUN chmod +x /app/deploy.sh

# Set entrypoint
ENTRYPOINT ["/app/deploy.sh"]
