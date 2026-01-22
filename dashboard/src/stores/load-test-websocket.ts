/**
 * WebSocket connection manager for load test metrics
 * Handles connection lifecycle, message parsing, and batched state updates
 */

import type { GoLoadTestMetrics } from "./load-test-api";
import { getLoadGenWsUrl } from "./load-test-api";
import type { GoLoadTestState } from "./load-test-store-state";
import type { LoadTestStatus } from "@/types/load-test";

// Chart time series for live display
export interface ChartTimeSeries {
  timestamps: number[];
  mgasPerSec: number[];
  txPerSec: number[];
  fillRate: number[];
}

// Callback types for WebSocket manager
export interface WebSocketCallbacks {
  onStateUpdate: (update: Partial<GoLoadTestState>) => void;
  onConnected: () => void;
  onDisconnected: () => void;
  isHistoricalMode: () => boolean;
  getChartTimeSeries: () => ChartTimeSeries;
  stopPolling: () => void;
}

const MAX_CHART_POINTS = 600; // 2 minutes at 200ms intervals

/**
 * Parse WebSocket message and convert to state update
 */
export function parseMetricsMessage(
  metrics: GoLoadTestMetrics,
  currentTimeSeries: ChartTimeSeries
): { state: Partial<GoLoadTestState>; newTimeSeries?: ChartTimeSeries } {
  // Map Go status to our status type
  let status: LoadTestStatus = "idle";
  if (metrics.status === "initializing") status = "initializing";
  else if (metrics.status === "running") status = "running";
  else if (metrics.status === "verifying") status = "verifying";
  else if (metrics.status === "completed") status = "completed";
  else if (metrics.status === "error") status = "error";

  const state: Partial<GoLoadTestState> = {
    status,
    txSentCount: metrics.txSent,
    txConfirmedCount: metrics.txConfirmed,
    txFailedCount: metrics.txFailed,
    currentRate: metrics.currentTps,
    averageTps: metrics.averageTps,
    elapsedTime: Math.floor(metrics.elapsedMs / 1000),
    targetTps: metrics.targetTps,
    peakTps: metrics.peakTps ?? 0,
    durationSec: Math.floor(metrics.durationMs / 1000),
    error: metrics.error || null,
    // Initialization progress
    initPhase: metrics.initPhase ?? "",
    initProgress: metrics.initProgress ?? "",
    accountsTotal: metrics.accountsTotal ?? 0,
    accountsGenerated: metrics.accountsGenerated ?? 0,
    fundingTxsSent: metrics.fundingTxsSent ?? 0,
    fundingTxsTotal: metrics.fundingTxsTotal ?? 0,
    contractsDeployed: metrics.contractsDeployed ?? 0,
    contractsTotal: metrics.contractsTotal ?? 0,
    // Preconfirmation stage counters
    txPendingCount: metrics.txPending ?? 0,
    txPreconfirmedCount: metrics.txPreconfirmed ?? 0,
    txRevokedCount: metrics.txRevoked ?? 0,
    txDroppedCount: metrics.txDropped ?? 0,
    txRequeuedCount: metrics.txRequeued ?? 0,
    // Latency stats
    latencyStats: metrics.latency ?? null,
    preconfLatencyStats: metrics.preconfLatency ?? null,
    pendingLatencyStats: metrics.pendingLatency ?? null,
    // Realistic test specific
    tipHistogram: metrics.tipHistogram ?? [],
    txTypeMetrics: metrics.txTypeMetrics ?? [],
    accountsActive: metrics.accountsActive ?? 0,
    accountsFunded: metrics.accountsFunded ?? 0,
    // Block gas metrics
    latestBaseFeeGwei: metrics.latestBaseFeeGwei ?? 0,
    latestGasPriceGwei: metrics.latestGasPriceGwei ?? 0,
    latestGasUsed: metrics.latestGasUsed ?? 0,
    // Aggregate block metrics
    totalGasUsed: metrics.totalGasUsed ?? 0,
    blockCount: metrics.blockCount ?? 0,
    peakMgasPerSec: metrics.peakMgasPerSec ?? 0,
    avgMgasPerSec: metrics.avgMgasPerSec ?? 0,
    avgFillRate: metrics.avgFillRate ?? 0,
    // Current rolling metrics
    currentMgasPerSec: metrics.currentMgasPerSec ?? 0,
    currentFillRate: metrics.currentFillRate ?? 0,
  };

  // Build time series for live chart (only during running status)
  let newTimeSeries: ChartTimeSeries | undefined;
  if (status === "running" && metrics.elapsedMs > 0) {
    const timestamp = metrics.elapsedMs / 1000;
    const mgasPerSec = metrics.currentMgasPerSec ?? 0;
    const txPerSec = metrics.currentTps ?? 0;
    const fillRate = metrics.currentFillRate ?? 0;

    newTimeSeries = {
      timestamps: [...currentTimeSeries.timestamps.slice(-MAX_CHART_POINTS + 1), timestamp],
      mgasPerSec: [...currentTimeSeries.mgasPerSec.slice(-MAX_CHART_POINTS + 1), mgasPerSec],
      txPerSec: [...currentTimeSeries.txPerSec.slice(-MAX_CHART_POINTS + 1), txPerSec],
      fillRate: [...currentTimeSeries.fillRate.slice(-MAX_CHART_POINTS + 1), fillRate],
    };
  } else if (status === "idle" || status === "initializing") {
    // Clear time series when test is reset/starting
    if (currentTimeSeries.timestamps.length > 0) {
      newTimeSeries = { timestamps: [], mgasPerSec: [], txPerSec: [], fillRate: [] };
    }
  }

  return { state, newTimeSeries };
}

/**
 * Create a WebSocket manager for load test metrics
 */
export function createWebSocketManager(callbacks: WebSocketCallbacks) {
  let ws: WebSocket | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let isConnecting = false;
  let shouldReconnect = false;

  // Batching for high-frequency updates
  let pendingUpdate: Partial<GoLoadTestState> | null = null;
  let rafId: number | null = null;

  const flushUpdate = () => {
    if (pendingUpdate) {
      callbacks.onStateUpdate(pendingUpdate);
      pendingUpdate = null;
    }
    rafId = null;
  };

  const batchedUpdate = (update: Partial<GoLoadTestState>) => {
    pendingUpdate = pendingUpdate ? { ...pendingUpdate, ...update } : update;
    if (rafId === null && typeof requestAnimationFrame !== "undefined") {
      rafId = requestAnimationFrame(flushUpdate);
    } else if (typeof requestAnimationFrame === "undefined") {
      flushUpdate();
    }
  };

  const connect = () => {
    if (ws?.readyState === WebSocket.OPEN || isConnecting) {
      console.log("[LoadTest] WebSocket already connected or connecting");
      return;
    }

    isConnecting = true;
    shouldReconnect = true;
    const wsUrl = getLoadGenWsUrl();
    console.log("[LoadTest] Connecting to WebSocket:", wsUrl);

    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("[LoadTest] WebSocket connected");
        isConnecting = false;
        callbacks.onConnected();
      };

      ws.onmessage = (event) => {
        try {
          if (callbacks.isHistoricalMode()) return;

          const metrics: GoLoadTestMetrics = JSON.parse(event.data);
          const { state, newTimeSeries } = parseMetricsMessage(
            metrics,
            callbacks.getChartTimeSeries()
          );

          if (newTimeSeries) {
            batchedUpdate({ ...state, chartTimeSeries: newTimeSeries });
          } else {
            batchedUpdate(state);
          }

          // Disconnect when test completes
          if ((state.status === "completed" || state.status === "error") && metrics.txSent > 0) {
            console.log("[LoadTest] Test finished, closing WebSocket");
            disconnect();
            callbacks.stopPolling();
          }
        } catch (err) {
          console.error("[LoadTest] Failed to parse WebSocket message:", err);
        }
      };

      ws.onerror = (err) => {
        console.error("[LoadTest] WebSocket error:", err);
        isConnecting = false;
      };

      ws.onclose = () => {
        console.log("[LoadTest] WebSocket closed");
        isConnecting = false;
        ws = null;
        callbacks.onDisconnected();

        // Auto-reconnect if we're still supposed to be connected
        if (shouldReconnect) {
          console.log("[LoadTest] Scheduling reconnect...");
          reconnectTimeout = setTimeout(connect, 1000);
        }
      };
    } catch (err) {
      console.error("[LoadTest] Failed to create WebSocket:", err);
      isConnecting = false;
    }
  };

  const disconnect = () => {
    shouldReconnect = false;
    isConnecting = false;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    if (ws) {
      ws.close();
      ws = null;
    }
  };

  return {
    connect,
    disconnect,
    isConnected: () => ws?.readyState === WebSocket.OPEN,
  };
}
