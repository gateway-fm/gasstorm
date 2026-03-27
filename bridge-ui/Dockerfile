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
ENV NEXT_PUBLIC_WALLET_CONNECT_ID=${NEXT_PUBLIC_WALLET_CONNECT_ID}
ENV NEXT_PUBLIC_RPC_OVERRIDES=${NEXT_PUBLIC_RPC_OVERRIDES}

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
