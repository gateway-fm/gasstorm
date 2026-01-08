"use client";

import { useEffect, useRef, useCallback, useState } from "react";

interface WebSocketMessage {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  params?: {
    subscription: string;
    result: NewHeadResult;
  };
  result?: string;
}

interface NewHeadResult {
  number: string;
  hash: string;
  parentHash: string;
  timestamp: string;
  gasUsed: string;
  gasLimit: string;
}

interface UseWebSocketOptions {
  url: string;
  onNewHead?: (head: NewHeadResult) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
  reconnectInterval?: number;
  useFullUrl?: boolean; // If true, use url as-is instead of building from window.location
}

interface UseWebSocketReturn {
  isConnected: boolean;
  subscriptionId: string | null;
}

export function useWebSocket({
  url,
  onNewHead,
  onConnect,
  onDisconnect,
  onError,
  reconnectInterval = 3000,
  useFullUrl = false,
}: UseWebSocketOptions): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const subscriptionRequestId = useRef(1);
  const connectRef = useRef<() => void>(() => {});

  // Use refs to always call the latest callbacks without reconnecting WebSocket
  const onNewHeadRef = useRef(onNewHead);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const onErrorRef = useRef(onError);

  // Keep refs updated with latest callbacks
  useEffect(() => {
    onNewHeadRef.current = onNewHead;
    onConnectRef.current = onConnect;
    onDisconnectRef.current = onDisconnect;
    onErrorRef.current = onError;
  }, [onNewHead, onConnect, onDisconnect, onError]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    // Build WebSocket URL - resolve at connection time to avoid hydration issues
    const wsUrl = useFullUrl ? url : getWebSocketUrl(url);

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setIsConnected(true);
      onConnectRef.current?.();

      // Subscribe to newHeads
      const subscribeMsg = {
        jsonrpc: "2.0",
        method: "eth_subscribe",
        params: ["newHeads"],
        id: subscriptionRequestId.current++,
      };
      ws.send(JSON.stringify(subscribeMsg));
    };

    ws.onmessage = (event) => {
      try {
        const data: WebSocketMessage = JSON.parse(event.data);

        // Handle subscription confirmation
        if (data.result && !data.params) {
          setSubscriptionId(data.result);
          return;
        }

        // Handle new block notification
        if (data.params?.result) {
          onNewHeadRef.current?.(data.params.result);
        }
      } catch (e) {
        console.error("WebSocket message error:", e);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      onErrorRef.current?.(error);
    };

    ws.onclose = () => {
      setIsConnected(false);
      setSubscriptionId(null);
      onDisconnectRef.current?.();

      // Reconnect after interval using ref to avoid accessing connect before declaration
      reconnectTimeoutRef.current = setTimeout(() => {
        connectRef.current();
      }, reconnectInterval);
    };

    wsRef.current = ws;
  }, [url, reconnectInterval, useFullUrl]);

  // Keep connectRef updated with latest connect function
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { isConnected, subscriptionId };
}

// In dev mode (port 3000), connect directly to service ports
// since Next.js rewrites don't support WebSocket upgrades
function getWebSocketUrl(path: string): string {
  if (typeof window === "undefined") return path;

  const host = window.location.host;
  const isDev = host.includes("localhost:3000") || host.includes("127.0.0.1:3000");

  if (isDev) {
    // Dev mode: connect directly to services
    if (path === "/ws/l1") return "ws://localhost:18545";
    if (path === "/ws/l2") return "ws://localhost:18547";
    if (path === "/ws/loadgen") return "ws://localhost:13001/ws";
  }

  // Production: use relative path (nginx proxy handles it)
  return `ws://${host}${path}`;
}

// Hook for L1 WebSocket
export function useL1WebSocket(onNewHead?: (head: NewHeadResult) => void) {
  return useWebSocket({
    url: "/ws/l1",
    onNewHead,
  });
}

// Hook for L2 WebSocket
export function useL2WebSocket(onNewHead?: (head: NewHeadResult) => void) {
  return useWebSocket({
    url: "/ws/l2",
    onNewHead,
  });
}
