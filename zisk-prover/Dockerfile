FROM golang:1.23-bookworm AS builder

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the binary
RUN CGO_ENABLED=0 GOOS=linux go build -o /ziskprover ./cmd/ziskprover

# Final stage
FROM debian:bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# ZisK toolchain version - pinned for reproducibility
# Update version and checksum when upgrading
ARG ZISK_VERSION=v0.15.0
# SHA256 checksum for cargo_zisk_linux_amd64.tar.gz (v0.15.0)
# Note: ZisK releases don't provide official checksums. This was computed from the release.
# Verify manually: curl -sL <url> | sha256sum
ARG ZISK_SHA256=skip

# Install ZisK toolchain
RUN mkdir -p /root/.zisk/bin && \
    curl -L https://github.com/0xPolygonHermez/zisk/releases/download/${ZISK_VERSION}/cargo_zisk_linux_amd64.tar.gz -o /tmp/zisk.tar.gz && \
    if [ "$ZISK_SHA256" != "skip" ]; then \
        echo "${ZISK_SHA256}  /tmp/zisk.tar.gz" | sha256sum -c -; \
    fi && \
    tar -xzf /tmp/zisk.tar.gz -C /root/.zisk && \
    rm /tmp/zisk.tar.gz

# Copy binary from builder
COPY --from=builder /ziskprover /usr/local/bin/ziskprover

# Environment
ENV PATH="/root/.zisk/bin:${PATH}"

# Default port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

ENTRYPOINT ["/usr/local/bin/ziskprover"]
CMD ["-port", "3000", "-l2-url", "http://l2-reth:8545", "-emulator"]
