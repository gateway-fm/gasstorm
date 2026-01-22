# Bridge UI Dockerfile
# Multi-stage build for Hyperlane Warp UI

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/
RUN pnpm install --frozen-lockfile

# Build the application
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time environment variables
ARG NEXT_PUBLIC_WALLET_CONNECT_ID
ARG NEXT_PUBLIC_RPC_OVERRIDES
ENV NEXT_PUBLIC_WALLET_CONNECT_ID=${NEXT_PUBLIC_WALLET_CONNECT_ID}
ENV NEXT_PUBLIC_RPC_OVERRIDES=${NEXT_PUBLIC_RPC_OVERRIDES}

# Build Next.js app
RUN pnpm build

# Production image
FROM base AS runner
ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built assets
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
