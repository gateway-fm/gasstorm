# syntax=docker/dockerfile:1
# Hyperlane Warp UI v2.0.0 Dockerfile

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.25.0 --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Build
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_WALLET_CONNECT_ID
ARG NEXT_PUBLIC_RPC_OVERRIDES
ARG NEXT_PUBLIC_DISABLE_HTTPS_UPGRADE
ARG NEXT_PUBLIC_L1_CHAIN_NAME=l1local
ARG L1_CHAIN_ID=31337
ARG L1_DISPLAY_NAME="L1"
ARG L1_RPC_URL=http://localhost:18545
ARG L1_BLOCK_TIME=12
ARG L2_RPC_URL=http://localhost:13000
ARG L2_DISPLAY_NAME="CDK-L2 (reth)"
ARG L1_ETH_WARP_ADDR
ARG L2_ETH_WARP_ADDR
ENV NEXT_PUBLIC_WALLET_CONNECT_ID=${NEXT_PUBLIC_WALLET_CONNECT_ID}
ENV NEXT_PUBLIC_RPC_OVERRIDES=${NEXT_PUBLIC_RPC_OVERRIDES}
ENV NEXT_PUBLIC_L1_CHAIN_NAME=${NEXT_PUBLIC_L1_CHAIN_NAME}
ENV NEXT_PUBLIC_DISABLE_HTTPS_UPGRADE=${NEXT_PUBLIC_DISABLE_HTTPS_UPGRADE}

# Generate chains.yaml from build args
RUN printf '%s\n' \
  "---" \
  "${NEXT_PUBLIC_L1_CHAIN_NAME}:" \
  "  chainId: ${L1_CHAIN_ID}" \
  "  domainId: ${L1_CHAIN_ID}" \
  "  name: ${NEXT_PUBLIC_L1_CHAIN_NAME}" \
  "  displayName: \"${L1_DISPLAY_NAME}\"" \
  "  protocol: ethereum" \
  "  rpcUrls:" \
  "    - http: ${L1_RPC_URL}" \
  "  nativeToken:" \
  "    name: Ether" \
  "    symbol: ETH" \
  "    decimals: 18" \
  "  blocks:" \
  "    confirmations: 1" \
  "    reorgPeriod: 0" \
  "    estimateBlockTime: ${L1_BLOCK_TIME}" \
  "  isTestnet: true" \
  "" \
  "l2local:" \
  "  chainId: 42069" \
  "  domainId: 42069" \
  "  name: l2local" \
  "  displayName: \"${L2_DISPLAY_NAME}\"" \
  "  protocol: ethereum" \
  "  rpcUrls:" \
  "    - http: ${L2_RPC_URL}" \
  "  nativeToken:" \
  "    name: Ether" \
  "    symbol: ETH" \
  "    decimals: 18" \
  "  blocks:" \
  "    confirmations: 1" \
  "    reorgPeriod: 0" \
  "    estimateBlockTime: 1" \
  "  isTestnet: true" \
  > src/consts/chains.yaml

# Generate warp routes from build args (addresses from hyperlane-init)
RUN if [ -n "${L1_ETH_WARP_ADDR}" ] && [ -n "${L2_ETH_WARP_ADDR}" ]; then \
      printf '%s\n' \
        "---" \
        "tokens:" \
        "  - chainName: ${NEXT_PUBLIC_L1_CHAIN_NAME}" \
        "    standard: EvmHypNative" \
        "    addressOrDenom: \"${L1_ETH_WARP_ADDR}\"" \
        "    decimals: 18" \
        "    symbol: ETH" \
        "    name: Ether" \
        "    connections:" \
        "      - token: \"ethereum|l2local|${L2_ETH_WARP_ADDR}\"" \
        "  - chainName: l2local" \
        "    standard: EvmHypNative" \
        "    addressOrDenom: \"${L2_ETH_WARP_ADDR}\"" \
        "    decimals: 18" \
        "    symbol: ETH" \
        "    name: Ether" \
        "    connections:" \
        "      - token: \"ethereum|${NEXT_PUBLIC_L1_CHAIN_NAME}|${L1_ETH_WARP_ADDR}\"" \
        "options: {}" \
        > src/consts/warpRoutes.yaml; \
    else \
      printf '%s\n' "---" "tokens: []" "options: {}" > src/consts/warpRoutes.yaml; \
    fi

RUN --mount=type=cache,target=/app/.next/cache \
    pnpm build

# Production
FROM base AS runner
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["pnpm", "start"]
