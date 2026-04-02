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
  getCurrentStatus: () => LoadTestStatus;
  getCurrentPeakTps: () => number;
  getElapsedTime: () => number;
  onNewTestDetected: (metrics: GoLoadTestMetrics) => void;
  onTestCompleted: () => void;
}

const MAX_CHART_POINTS = 600; // 2 minutes at 200ms intervals

/**
 * Parse WebSocket message and convert to state update
 */
export function parseMetricsMessage(
  metrics: GoLoadTestMetrics,
  currentTimeSeries: ChartTimeSeries,
  currentPeakTps?: number
): { state: Partial<GoLoadTestState>; newTimeSeries?: ChartTimeSeries } {
  // Map Go status to our status type
  let status: LoadTestStatus = "idle";
  if (metrics.status === "initializing") status = "initializing";
  else if (metrics.status === "running") status = "running";
  else if (metrics.status === "verifying") status = "verifying";
  else if (metrics.status === "completed") status = "completed";
  else if (metrics.status === "error") status = "error";

  // Cap elapsed time at configured duration — timer should never exceed it
  const durationSec = Math.floor(metrics.durationMs / 1000);
  const rawElapsedTime = Math.floor(metrics.elapsedMs / 1000);
  const elapsedTime = durationSec > 0
    ? Math.min(rawElapsedTime, durationSec)
    : rawElapsedTime;

  const state: Partial<GoLoadTestState> = {
    status,
    txSentCount: metrics.txSent,
    txConfirmedCount: metrics.txConfirmed,
    txFailedCount: metrics.txFailed,
    currentRate: metrics.currentTps,
    averageTps: metrics.averageTps,
    elapsedTime,
    targetTps: metrics.targetTps,
    peakTps: Math.max(metrics.peakTps ?? 0, currentPeakTps ?? 0),
    durationSec,
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
    // Verification progress
    verifyPhase: metrics.verifyPhase ?? "",
    verifyProgress: metrics.verifyProgress ?? "",
    blocksToVerify: metrics.blocksToVerify ?? 0,
    blocksVerified: metrics.blocksVerified ?? 0,
    receiptsToSample: metrics.receiptsToSample ?? 0,
    receiptsSampled: metrics.receiptsSampled ?? 0,
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

  if ("blockAttestationEnabled" in metrics) {
    state.blockAttestationEnabled = metrics.blockAttestationEnabled ?? null;
  }
  if ("hsmProvider" in metrics) {
    state.hsmProvider = metrics.hsmProvider ?? "";
  }
  if ("hsmKeyIdActive" in metrics) {
    state.hsmKeyIdActive = metrics.hsmKeyIdActive ?? "";
  }
  if ("hsmFailoverEnabled" in metrics) {
    state.hsmFailoverEnabled = metrics.hsmFailoverEnabled ?? null;
  }
  if ("privacyAvailable" in metrics) {
    state.privacyAvailable = metrics.privacyAvailable ?? false;
  }

  // Build time series for live chart (ONLY during running and strictly within duration).
  // Use strict < so the boundary point (where metrics are already declining) is excluded.
  let newTimeSeries: ChartTimeSeries | undefined;
  const withinDuration = metrics.durationMs <= 0 || metrics.elapsedMs < metrics.durationMs;
  if (status === "running" && metrics.elapsedMs > 0 && withinDuration) {
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

/** Extract only the fields that should update after the test duration is reached */
function verifyOnlyUpdate(state: Partial<GoLoadTestState>): Partial<GoLoadTestState> {
  return {
    status: state.status,
    elapsedTime: state.elapsedTime,
    verifyPhase: state.verifyPhase,
    verifyProgress: state.verifyProgress,
    blocksToVerify: state.blocksToVerify,
    blocksVerified: state.blocksVerified,
    receiptsToSample: state.receiptsToSample,
    receiptsSampled: state.receiptsSampled,
    txConfirmedCount: state.txConfirmedCount,
    txFailedCount: state.txFailedCount,
    latencyStats: state.latencyStats,
    preconfLatencyStats: state.preconfLatencyStats,
    pendingLatencyStats: state.pendingLatencyStats,
  };
}

/**
 * Create a WebSocket manager for load test metrics
 */
export function createWebSocketManager(callbacks: WebSocketCallbacks) {
  let ws: WebSocket | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let isConnecting = false;
  let shouldReconnect = false;

  // Once true, only verification-progress fields pass through.
  // Set the instant elapsed >= duration or status leaves "running".
  // Reset only when a brand-new test is detected.
  let frozen = false;

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

  /** Flush any pending batched update immediately (synchronous). */
  const flushNow = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    flushUpdate();
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
          const metrics: GoLoadTestMetrics = JSON.parse(event.data);
          const currentStatus = callbacks.getCurrentStatus();
          const incomingStatus = metrics.status;
          const isActive = (s: string) =>
            s === "initializing" || s === "running" || s === "verifying";

          // 1. Detect new/reconnected test: incoming is active but we're not.
          //    Fires for API-started tests AND page refreshes mid-test.
          if (isActive(incomingStatus) && !isActive(currentStatus)) {
            console.log("[LoadTest] New test detected via WebSocket (was %s)", currentStatus);
            frozen = false; // Reset freeze for the new test
            callbacks.onNewTestDetected(metrics);
          }

          // 2. Detect test completion: incoming is terminal but we were active.
          //    Process this one final message, then freeze.
          //    Guard: if the store was just reset (elapsedTime near 0) but the
          //    incoming message has high elapsedMs, it's a stale completion from
          //    the previous test — ignore it.
          if (
            (incomingStatus === "completed" || incomingStatus === "error") &&
            isActive(currentStatus)
          ) {
            const storeElapsed = callbacks.getElapsedTime();
            if (storeElapsed < 2 && metrics.elapsedMs > 5000) {
              console.log("[LoadTest] Ignoring stale %s (store=%ds, msg=%dms)",
                incomingStatus, storeElapsed, metrics.elapsedMs);
              return;
            }
            frozen = true;
            // Flush any stale batched data before applying the final state
            flushNow();
            const { state } = parseMetricsMessage(
              metrics,
              callbacks.getChartTimeSeries(),
              callbacks.getCurrentPeakTps()
            );
            // Apply verify-only fields so we don't overwrite frozen metrics
            callbacks.onStateUpdate(verifyOnlyUpdate(state));
            callbacks.onTestCompleted();
            return;
          }

          // 3. Handle idle messages — if server is idle but we think a test is
          //    active, we missed the completion (e.g. navigated away mid-test).
          //    Reset the store so the UI isn't stuck on "running".
          if (incomingStatus === "idle") {
            if (isActive(currentStatus)) {
              console.log("[LoadTest] Server idle but store was %s — resetting (missed completion)", currentStatus);
              frozen = false;
              flushNow();
              callbacks.onStateUpdate({ status: "idle" });
            }
            return;
          }

          // 4. Skip redundant terminal state updates (already processed in step 2)
          if (incomingStatus === "completed" || incomingStatus === "error") return;

          // 5. Skip if viewing DB-hydrated historical data
          if (callbacks.isHistoricalMode()) return;

          // 6. Freeze check — once frozen, only verification fields pass through.
          //    The flag is set once and never cleared until a new test starts.
          if (!frozen) {
            const pastDuration = incomingStatus === "running" && metrics.durationMs > 0 && metrics.elapsedMs >= metrics.durationMs;
            if (incomingStatus === "verifying" || pastDuration) {
              // Flush any pending full update from the last active message FIRST,
              // so it doesn't merge with subsequent verify-only updates.
              flushNow();
              frozen = true;
              console.log("[LoadTest] Metrics frozen (elapsed=%dms, duration=%dms, status=%s)",
                metrics.elapsedMs, metrics.durationMs, incomingStatus);
            }
          }

          if (frozen) {
            const { state } = parseMetricsMessage(
              metrics,
              callbacks.getChartTimeSeries(),
              callbacks.getCurrentPeakTps()
            );
            batchedUpdate(verifyOnlyUpdate(state));
            return;
          }

          // 7. Process active test messages (initializing / running)
          const { state, newTimeSeries } = parseMetricsMessage(
            metrics,
            callbacks.getChartTimeSeries(),
            callbacks.getCurrentPeakTps()
          );

          if (newTimeSeries) {
            batchedUpdate({ ...state, chartTimeSeries: newTimeSeries });
          } else {
            batchedUpdate(state);
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

  /** Call from start() before setting status to "initializing".
   *  Clears the frozen flag so the new test's data flows through. */
  const resetForNewTest = () => {
    frozen = false;
    flushNow();
  };

  return {
    connect,
    disconnect,
    isConnected: () => ws?.readyState === WebSocket.OPEN,
    resetForNewTest,
  };
}
