# syntax=docker/dockerfile:1

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with cache mount
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Copy source files
COPY . .

# Build-time feature flags (NEXT_PUBLIC_* are baked into the static bundle).
# Set LOADTEST_HIDE_FAILED to any non-empty value to hide the "Failed" tx counter.
ARG LOADTEST_HIDE_FAILED=
ENV NEXT_PUBLIC_LOADTEST_HIDE_FAILED=$LOADTEST_HIDE_FAILED

# Direct URL to the privacy UI for remote deploys (e.g. http://explorer-ip:18301).
# Bypasses the /proxy/ path prefix which breaks SPA routing.
ARG PRIVACY_UI_URL=
ENV NEXT_PUBLIC_PRIVACY_UI_URL=$PRIVACY_UI_URL

# Direct URL to the bridge UI for remote deploys (e.g. http://main-server-ip:18001).
ARG BRIDGE_UI_URL=
ENV NEXT_PUBLIC_BRIDGE_UI_URL=$BRIDGE_UI_URL

# Build the application with cache mount for Next.js
RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

# Stage 2: Production
FROM nginx:alpine

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy nginx configuration as template (envsubst at startup)
# NGINX_ENVSUBST_FILTER ensures only our custom env vars are substituted,
# leaving nginx's own $variables (like $upstream, $host) untouched.
ENV LOADGEN_HOST=load-generator:3001
ENV CHAIN_HOST_RPC=block-builder:3000
ENV CHAIN_HOST_BUILDER_WS=block-builder:3001
ENV CHAIN_HOST_L2_RPC=l2-reth:8545
ENV CHAIN_HOST_L2_WS=l2-reth:8546
ENV CHAIN_HOST_L1=l1:8545
ENV EXPLORER_HOST_API=explorer-api:8080
ENV EXPLORER_HOST_L1_API=explorer-l1-api:8080
ENV EXPLORER_HOST_UI=explorer-ui:80
ENV EXPLORER_HOST_L1_UI=explorer-l1-ui:80
ENV PRIVACY_HOST_API=privacy-proxy:8080
ENV PRIVACY_HOST_UI=privacy-ui:80
ENV BRIDGE_L1_HOST=external-l1-proxy:8545
ENV NGINX_ENVSUBST_FILTER=LOADGEN|CHAIN_HOST|EXPLORER_HOST|PRIVACY_HOST|BRIDGE_L1
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Copy built static files from builder stage
COPY --from=builder /app/out /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Health check - verify nginx is serving content
HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -sf http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
