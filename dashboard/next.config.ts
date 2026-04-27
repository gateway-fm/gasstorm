import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  // Only use static export for production builds
  ...(isDev ? {} : { output: "export" }),
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // Dev mode: proxy API calls to local services
  ...(isDev
    ? {
        async rewrites() {
          return [
            // Load generator API
            {
              source: "/api/loadgen/:path*",
              destination: "http://localhost:13001/:path*",
            },
            // Load generator WebSocket
            {
              source: "/ws/loadgen",
              destination: "http://localhost:13001/ws",
            },
            // Block builder
            {
              source: "/rpc/builder/:path*",
              destination: "http://localhost:13000/:path*",
            },
            {
              source: "/rpc/builder",
              destination: "http://localhost:13000/",
            },
            // L1 RPC (Docker)
            {
              source: "/rpc/l1",
              destination: "http://localhost:18545/",
            },
            // L2 RPC (via block-builder for tx inclusion)
            {
              source: "/rpc/l2",
              destination: "http://localhost:13000/",
            },
            // L1 WebSocket
            {
              source: "/ws/l1",
              destination: "http://localhost:18545/",
            },
            // Blob DA RPC
            {
              source: "/rpc/blobda",
              destination: "http://localhost:18125/",
            },
            // L2 WebSocket
            {
              source: "/ws/l2",
              destination: "http://localhost:18547/",
            },
            // Explorer API health
            {
              source: "/api/explorer/health",
              destination: "http://localhost:18200/health",
            },
            // L2 Explorer stats + gas
            {
              source: "/api/explorer/stats",
              destination: "http://localhost:18200/api/stats",
            },
            {
              source: "/api/explorer/gas",
              destination: "http://localhost:18200/api/gas",
            },
            // Privacy Proxy health
            {
              source: "/api/privacy/health",
              destination: "http://localhost:18300/health",
            },
            // L1 Explorer health
            {
              source: "/api/explorer-l1/health",
              destination: "http://localhost:18202/health",
            },
            // L1 Explorer stats + gas
            {
              source: "/api/explorer-l1/stats",
              destination: "http://localhost:18202/api/stats",
            },
            {
              source: "/api/explorer-l1/gas",
              destination: "http://localhost:18202/api/gas",
            },
            // Bridge Relayer health (metrics endpoint returns 200)
            {
              source: "/api/bridge/relayer/health",
              destination: "http://localhost:19090/metrics",
            },
            // Bridge UI health
            {
              source: "/api/bridge/ui/health",
              destination: "http://localhost:18001/",
            },
          ];
        },
      }
    : {}),
};

export default nextConfig;
