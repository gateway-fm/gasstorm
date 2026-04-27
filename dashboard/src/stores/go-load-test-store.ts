/**
 * Go Load Test Store
 * Zustand store for managing load test state and communication with Go load generator
 */

import { create } from "zustand";
import type { LoadTestConfig } from "@/types/load-test";
import { DEFAULT_LOAD_TEST_CONFIG, DEFAULT_REALISTIC_CONFIG } from "@/types/load-test";
import { useMetricsStore } from "./metrics-store";
import { useChainStore } from "./chain-store";
import {
  fetchLoadGenAPI,
  type GoLoadTestMetrics,
  type StartTestRequest,
  type HistoricalTestRun,
  type HistoricalTimeSeriesPoint,
} from "./load-test-api";
import { createWebSocketManager, parseMetricsMessage } from "./load-test-websocket";
import {
  INITIAL_STATE,
  getResetState,
  type GoLoadTestStore,
} from "./load-test-store-state";
import { useActivityFeedStore } from "./activity-feed-store";

// Re-export types for consumers
export type { GoLoadTestState, GoLoadTestStore } from "./load-test-store-state";
export type { HistoricalTestRun, HistoricalTimeSeriesPoint } from "./load-test-api";

/**
 * Build the start test request from config
 */
function buildStartRequest(cfg: LoadTestConfig): StartTestRequest {
  const pattern = cfg.pattern ?? "constant";
  const durationSec = cfg.duration ?? 60;

  const request: StartTestRequest = {
    pattern,
    durationSec,
    numAccounts: 0, // Let loadgen auto-calculate based on target TPS
    transactionType: cfg.transactionType ?? "eth-transfer",
  };

  if (cfg.privacyMode) {
    request.privacyMode = true;
  }

  if (cfg.fixNonceGaps) {
    request.fixNonceGaps = true;
  }

  switch (pattern) {
    case "constant":
      request.constantRate = cfg.constantRate ?? DEFAULT_LOAD_TEST_CONFIG.constantRate;
      break;
    case "ramp":
      request.rampStart = cfg.rampStart ?? DEFAULT_LOAD_TEST_CONFIG.rampStart;
      request.rampEnd = cfg.rampEnd ?? DEFAULT_LOAD_TEST_CONFIG.rampEnd;
      request.rampSteps = cfg.rampSteps ?? DEFAULT_LOAD_TEST_CONFIG.rampSteps;
      break;
    case "spike":
      request.baselineRate = cfg.baselineRate ?? DEFAULT_LOAD_TEST_CONFIG.baselineRate;
      request.spikeRate = cfg.spikeRate ?? DEFAULT_LOAD_TEST_CONFIG.spikeRate;
      request.spikeDuration = cfg.spikeDuration ?? DEFAULT_LOAD_TEST_CONFIG.spikeDuration;
      request.spikeInterval = cfg.spikeInterval ?? DEFAULT_LOAD_TEST_CONFIG.spikeInterval;
      break;
    case "adaptive":
      request.adaptiveInitialRate = cfg.adaptiveInitialRate ?? DEFAULT_LOAD_TEST_CONFIG.adaptiveInitialRate;
      request.adaptiveTargetPending = cfg.adaptiveTargetPending ?? DEFAULT_LOAD_TEST_CONFIG.adaptiveTargetPending;
      request.adaptiveRateStep = cfg.adaptiveRateStep ?? DEFAULT_LOAD_TEST_CONFIG.adaptiveRateStep;
      break;
    case "realistic":
      request.realisticConfig = cfg.realisticConfig ?? DEFAULT_REALISTIC_CONFIG;
      request.numAccounts = request.realisticConfig.numAccounts;
      break;
    case "adaptive-realistic":
      // Adaptive-realistic uses adaptive rate control with default realistic TX types
      request.adaptiveInitialRate = cfg.adaptiveInitialRate ?? DEFAULT_LOAD_TEST_CONFIG.adaptiveInitialRate;
      request.adaptiveTargetPending = cfg.adaptiveTargetPending ?? DEFAULT_LOAD_TEST_CONFIG.adaptiveTargetPending;
      request.adaptiveRateStep = cfg.adaptiveRateStep ?? DEFAULT_LOAD_TEST_CONFIG.adaptiveRateStep;
      // Note: realisticConfig is NOT sent - Go uses sensible defaults internally
      break;
  }

  return request;
}

/**
 * Calculate initial target TPS from config
 */
function getInitialTargetTps(request: StartTestRequest): number {
  switch (request.pattern) {
    case "constant":
      return request.constantRate ?? 5;
    case "ramp":
      return request.rampStart ?? 1;
    case "spike":
      return request.baselineRate ?? 2;
    case "adaptive":
      return request.adaptiveInitialRate ?? 10;
    case "realistic":
      return request.realisticConfig?.targetTps ?? 500;
    case "adaptive-realistic":
      return request.adaptiveInitialRate ?? 100;
    default:
      return 0;
  }
}

export const useGoLoadTestStore = create<GoLoadTestStore>()((set, get) => {
  // WebSocket manager instance — stays connected for the lifetime of the page
  const wsManager = createWebSocketManager({
    onStateUpdate: (update) => set(update),
    onConnected: () => {
      set({ wsConnected: true });
      // Fetch privacy availability via HTTP (WS messages may arrive before store is ready)
      fetchLoadGenAPI("/v1/status").then(r => r.json()).then(data => {
        if (data?.privacyAvailable !== undefined) {
          set({ privacyAvailable: data.privacyAvailable });
        }
      }).catch(() => {});
    },
    onDisconnected: () => set({ wsConnected: false }),
    isHistoricalMode: () => get().isHistoricalMode,
    getChartTimeSeries: () => get().chartTimeSeries,
    getCurrentStatus: () => get().status,
    getCurrentPeakTps: () => get().peakTps,
    getElapsedTime: () => get().elapsedTime,
    onNewTestDetected: (metrics) => {
      // A new test was started (possibly via API/MCP, not the UI).
      // Reset all stores and sync config so the dashboard picks it up cleanly.
      console.log("[LoadTest] Auto-resetting stores for new test");
      useMetricsStore.getState().reset();
      useChainStore.getState().clearLogs();
      useActivityFeedStore.getState().clearEvents();
      set({
        ...getResetState(),
        status: "initializing",
        isHistoricalMode: false,
        config: {
          ...get().config,
          pattern: metrics.pattern,
          transactionType: metrics.transactionType,
          duration: Math.floor(metrics.durationMs / 1000),
        },
        targetTps: metrics.targetTps,
        durationSec: Math.floor(metrics.durationMs / 1000),
      });
    },
    onTestCompleted: () => {
      // Test finished. goLoadTestStore values are already frozen because the
      // WebSocket handler stops processing after calling this.
      // Do NOT set metricsStore.setHistoricalMode — that would cause the
      // RealTimeChart to switch from accurate goLoadTestStore data to
      // L2-derived metricsStore data.
      console.log("[LoadTest] Test completed, state frozen");
    },
  });

  return {
    ...INITIAL_STATE,

    setConfig: (config) =>
      set((state) => ({
        config: { ...state.config, ...config },
      })),

    start: async () => {
      const state = get();
      const isActive = state.status === "initializing" || state.status === "running" || state.status === "verifying";
      if (isActive || state.isStarting) {
        console.log("[LoadTest] Already running or starting");
        return;
      }

      // Full reset BEFORE the POST.  Setting status to "initializing" here
      // prevents the WebSocket onNewTestDetected callback from firing
      // redundantly when the first message arrives (it only fires when the
      // store status is NOT active).
      wsManager.resetForNewTest(); // Clear frozen flag from previous test
      useMetricsStore.getState().reset();
      useChainStore.getState().clearLogs();
      useActivityFeedStore.getState().clearEvents();
      set({
        ...getResetState(),
        isStarting: true,
        status: "initializing",
        isHistoricalMode: false,
        initProgress: "Starting test...",
      });

      const request = buildStartRequest(state.config);
      console.log("[LoadTest] Starting test with config:", JSON.stringify(request, null, 2));

      try {
        const response = await fetchLoadGenAPI("/start", {
          method: "POST",
          body: JSON.stringify(request),
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }

        // POST succeeded — set metadata only.  Do NOT call getResetState()
        // here because the WebSocket may have already delivered live data
        // (currentRate, chartTimeSeries, etc.) while we awaited the POST.
        set({
          isStarting: false,
          startTime: Date.now(),
          targetTps: getInitialTargetTps(request),
          durationSec: request.durationSec,
          initProgress: "Starting initialization...",
        });
      } catch (error) {
        console.error("[LoadTest] Start failed:", error);
        set({
          status: "error",
          error: error instanceof Error ? error.message : String(error),
          isStarting: false,
        });
      }
    },

    stop: async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        await fetchLoadGenAPI("/stop", {
          method: "POST",
          signal: controller.signal,
        });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          console.warn("[LoadTest] Stop request timed out after 10s");
        }
      } finally {
        clearTimeout(timeoutId);
      }

      // Don't disconnect WebSocket — stay connected for next test.
      // The load generator will transition through verifying → completed,
      // and the WebSocket will deliver those status updates.
    },

    reset: async () => {
      try {
        await fetchLoadGenAPI("/reset", { method: "POST" });
        // Don't disconnect WebSocket — stay connected for next test.
        wsManager.resetForNewTest(); // Clear frozen flag from previous test
        useMetricsStore.getState().reset();
        useChainStore.getState().clearLogs();
        useActivityFeedStore.getState().clearEvents();
        set(getResetState());
      } catch (error) {
        console.error("Failed to reset:", error);
      }
    },

    setHistoricalMode: (isHistorical: boolean) => set({ isHistoricalMode: isHistorical }),

    pollStatus: async () => {
      if (get().isHistoricalMode) return;

      try {
        const response = await fetchLoadGenAPI("/status");
        if (!response.ok) return;

        const metrics: GoLoadTestMetrics = await response.json();
        const { state } = parseMetricsMessage(metrics, get().chartTimeSeries, get().peakTps);
        set(state);
      } catch (error) {
        console.debug("Failed to get load generator status:", error);
      }
    },

    hydrateFromHistory: (run: HistoricalTestRun, timeSeries: HistoricalTimeSeriesPoint[]) => {
      const config: LoadTestConfig = {
        pattern: run.pattern,
        duration: Math.round(run.durationMs / 1000),
        transactionType: run.transactionType,
        constantRate: run.config?.constantRate,
        rampStart: run.config?.rampStart,
        rampEnd: run.config?.rampEnd,
        rampSteps: run.config?.rampSteps,
        baselineRate: run.config?.baselineRate,
        spikeRate: run.config?.spikeRate,
        spikeDuration: run.config?.spikeDuration,
        spikeInterval: run.config?.spikeInterval,
        adaptiveInitialRate: run.config?.adaptiveInitialRate,
        adaptiveTargetPending: run.config?.adaptiveTargetPending,
        adaptiveRateStep: run.config?.adaptiveRateStep,
        realisticConfig: run.config?.realisticConfig,
      };

      const targetTps = timeSeries.length > 0
        ? timeSeries[0].targetTps
        : run.config?.constantRate ?? run.averageTps;

      set({
        status: "completed",
        config,
        startTime: new Date(run.startedAt).getTime(),
        elapsedTime: Math.round(run.durationMs / 1000),
        currentRate: 0,
        txSentCount: run.txSent,
        txConfirmedCount: run.txConfirmed,
        txFailedCount: run.txFailed,
        txDiscardedCount: run.txDiscarded ?? 0,
        averageTps: run.averageTps,
        targetTps,
        peakTps: run.peakTps,
        durationSec: Math.round(run.durationMs / 1000),
        error: null,
        isPolling: false,
        wsConnected: false,
        txPendingCount: 0,
        txPreconfirmedCount: 0,
        txRevokedCount: 0,
        txDroppedCount: 0,
        txRequeuedCount: 0,
        latencyStats: run.latencyStats ?? null,
        preconfLatencyStats: run.preconfLatency ?? null,
        pendingLatencyStats: run.pendingLatency ?? null,
        tipHistogram: run.tipHistogram ?? [],
        txTypeMetrics: run.txTypeMetrics ?? [],
        accountsActive: run.accountsActive ?? 0,
        accountsFunded: run.accountsFunded ?? 0,
        blockAttestationEnabled: run.environment?.builderBlockAttestationEnabled ?? null,
        hsmProvider: run.environment?.builderHsmProvider ?? "",
        hsmKeyIdActive: run.environment?.builderHsmKeyIdActive ?? "",
        hsmFailoverEnabled: run.environment?.builderHsmFailoverEnabled ?? null,
        isHistoricalMode: true,
      });
    },

    connectWebSocket: () => {
      wsManager.connect();
    },

    disconnectWebSocket: () => {
      wsManager.disconnect();
    },
  };
});
