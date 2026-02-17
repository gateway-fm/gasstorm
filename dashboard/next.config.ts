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
          ];
        },
      }
    : {}),
};

export default nextConfig;
