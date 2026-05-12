"use client";

import { createContext, useContext, useCallback, useState, useEffect, useRef, ReactNode } from "react";
import { useGoLoadTestStore } from "@/stores/go-load-test-store";
import { isDevMode, getServiceWsUrl } from "@/lib/host";

interface NewHeadResult {
  number: string;
  hash: string;
  parentHash: string;
  timestamp: string;
  gasUsed: string;
  gasLimit: string;
}

interface WebSocketContextValue {
  l1Connected: boolean;
  l2Connected: boolean;
  loadGenConnected: boolean;
  // Allow pages to subscribe to new block events
  subscribeL1: (callback: (head: NewHeadResult) => void) => () => void;
  subscribeL2: (callback: (head: NewHeadResult) => void) => () => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

// In dev mode (port 3000), connect directly to service ports.
// Uses window.location.hostname so it works over Tailscale / non-localhost access.
function getWebSocketUrl(path: string): string {
  if (typeof window === "undefined") return path;

  if (isDevMode()) {
    if (path === "/ws/l1") return getServiceWsUrl(18545);
    if (path === "/ws/l2") return getServiceWsUrl(18547);
  }

  return `ws://${window.location.host}${path}`;
}

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

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [l1Connected, setL1Connected] = useState(false);
  const [l2Connected, setL2Connected] = useState(false);

  // Get loadGen connection status from its store
  const loadGenConnected = useGoLoadTestStore((s) => s.wsConnected);
  const connectLoadGenWs = useGoLoadTestStore((s) => s.connectWebSocket);

  // Open the load generator WebSocket app-wide so the header indicator
  // reflects loadgen reachability on every page, not just /load-test.
  // connect() is idempotent and the page-level effect can still call it.
  useEffect(() => {
    connectLoadGenWs();
  }, [connectLoadGenWs]);

  // Subscriber lists for new block events
  const l1Subscribers = useRef<Set<(head: NewHeadResult) => void>>(new Set());
  const l2Subscribers = useRef<Set<(head: NewHeadResult) => void>>(new Set());

  // WebSocket refs
  const l1WsRef = useRef<WebSocket | null>(null);
  const l2WsRef = useRef<WebSocket | null>(null);
  const l1ReconnectRef = useRef<NodeJS.Timeout | null>(null);
  const l2ReconnectRef = useRef<NodeJS.Timeout | null>(null);

  // Subscribe functions
  const subscribeL1 = useCallback((callback: (head: NewHeadResult) => void) => {
    l1Subscribers.current.add(callback);
    return () => {
      l1Subscribers.current.delete(callback);
    };
  }, []);

  const subscribeL2 = useCallback((callback: (head: NewHeadResult) => void) => {
    l2Subscribers.current.add(callback);
    return () => {
      l2Subscribers.current.delete(callback);
    };
  }, []);

  // Connect to L1 WebSocket
  useEffect(() => {
    let mounted = true;
    let subscriptionRequestId = 1;

    const connect = () => {
      if (l1WsRef.current?.readyState === WebSocket.OPEN) return;

      const wsUrl = getWebSocketUrl("/ws/l1");
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (!mounted) return;
        setL1Connected(true);
        // Subscribe to newHeads
        ws.send(JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_subscribe",
          params: ["newHeads"],
          id: subscriptionRequestId++,
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data: WebSocketMessage = JSON.parse(event.data);
          if (data.params?.result) {
            l1Subscribers.current.forEach((cb) => cb(data.params!.result));
          }
        } catch (e) {
          console.error("L1 WebSocket message error:", e);
        }
      };

      ws.onerror = (error) => {
        console.error("L1 WebSocket error:", error);
      };

      ws.onclose = () => {
        if (!mounted) return;
        setL1Connected(false);
        l1ReconnectRef.current = setTimeout(connect, 3000);
      };

      l1WsRef.current = ws;
    };

    connect();

    return () => {
      mounted = false;
      if (l1ReconnectRef.current) clearTimeout(l1ReconnectRef.current);
      if (l1WsRef.current) l1WsRef.current.close();
    };
  }, []);

  // Connect to L2 WebSocket
  useEffect(() => {
    let mounted = true;
    let subscriptionRequestId = 1;

    const connect = () => {
      if (l2WsRef.current?.readyState === WebSocket.OPEN) return;

      const wsUrl = getWebSocketUrl("/ws/l2");
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (!mounted) return;
        setL2Connected(true);
        // Subscribe to newHeads
        ws.send(JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_subscribe",
          params: ["newHeads"],
          id: subscriptionRequestId++,
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data: WebSocketMessage = JSON.parse(event.data);
          if (data.params?.result) {
            l2Subscribers.current.forEach((cb) => cb(data.params!.result));
          }
        } catch (e) {
          console.error("L2 WebSocket message error:", e);
        }
      };

      ws.onerror = (error) => {
        console.error("L2 WebSocket error:", error);
      };

      ws.onclose = () => {
        if (!mounted) return;
        setL2Connected(false);
        l2ReconnectRef.current = setTimeout(connect, 3000);
      };

      l2WsRef.current = ws;
    };

    connect();

    return () => {
      mounted = false;
      if (l2ReconnectRef.current) clearTimeout(l2ReconnectRef.current);
      if (l2WsRef.current) l2WsRef.current.close();
    };
  }, []);

  return (
    <WebSocketContext.Provider
      value={{
        l1Connected,
        l2Connected,
        loadGenConnected,
        subscribeL1,
        subscribeL2,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error("useWebSocketContext must be used within WebSocketProvider");
  }
  return context;
}

// Convenience hooks for subscribing to new blocks
export function useL1NewHead(callback: (head: NewHeadResult) => void) {
  const { subscribeL1 } = useWebSocketContext();
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    return subscribeL1((head) => callbackRef.current(head));
  }, [subscribeL1]);
}

export function useL2NewHead(callback: (head: NewHeadResult) => void) {
  const { subscribeL2 } = useWebSocketContext();
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    return subscribeL2((head) => callbackRef.current(head));
  }, [subscribeL2]);
}
