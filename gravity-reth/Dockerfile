# Multi-stage build for Gravity Reth
# Gravity Reth is a high-performance fork of standard Reth (not op-reth) by Galxe
# https://github.com/Galxe/gravity-reth
#
# Key optimizations:
# - Grevm: DAG-based optimistic parallel EVM
# - Parallel Merklization: 16-way top-down parallel state root calculation
# - Pipelined Execution: Decoupled block production from execution

FROM rust:1.82-bookworm AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    git \
    clang \
    libclang-dev \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Clone gravity-reth at specific version
# Note: First build will take 15-25 minutes
ARG GRAVITY_RETH_VERSION=gravity-v0.4.1
RUN git clone --depth 1 --branch ${GRAVITY_RETH_VERSION} \
    https://github.com/Galxe/gravity-reth.git /gravity-reth

WORKDIR /gravity-reth

# Build with maxperf profile for maximum performance
# Key optimizations:
# - jemalloc: Better memory allocator for high-allocation patterns
# - asm-keccak: Assembly-optimized Keccak256 using SIMD (AVX2/AVX-512)
# - maxperf profile: Enables LTO and aggressive compiler optimizations
# - target-cpu=x86-64-v3: Modern server compatibility (AVX2, FMA)
#   Note: Can't use native in Docker (build vs runtime machine differ)
ENV RUSTFLAGS="-C target-cpu=x86-64-v3"
RUN cargo build --profile maxperf --features jemalloc,asm-keccak --bin reth

# Runtime image
FROM debian:bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy the built binary from maxperf profile output
COPY --from=builder /gravity-reth/target/maxperf/reth /usr/local/bin/reth

# Create data directory
RUN mkdir -p /data /config

# Expose ports
# 8545: HTTP JSON-RPC
# 8546: WebSocket JSON-RPC
# 30303: P2P (not used in standalone mode)
EXPOSE 8545 8546 30303

# Set entrypoint
ENTRYPOINT ["reth"]

# Default command (can be overridden)
CMD ["node", "--help"]
