/**
 * Go Load Test Store
 * Zustand store for managing load test state and communication with Go load generator
 */

import { create } from "zustand";
import type { LoadTestConfig, LoadTestStatus } from "@/types/load-test";
import { DEFAULT_LOAD_TEST_CONFIG, DEFAULT_REALISTIC_CONFIG } from "@/types/load-test";
import { useMetricsStore } from "./metrics-store";
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
    numAccounts: 100,
    transactionType: cfg.transactionType ?? "eth-transfer",
  };

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
    default:
      return 0;
  }
}

export const useGoLoadTestStore = create<GoLoadTestStore>()((set, get) => {
  // WebSocket manager instance
  const wsManager = createWebSocketManager({
    onStateUpdate: (update) => set(update),
    onConnected: () => set({ wsConnected: true }),
    onDisconnected: () => set({ wsConnected: false }),
    isHistoricalMode: () => get().isHistoricalMode,
    getChartTimeSeries: () => get().chartTimeSeries,
    stopPolling: () => set({ isPolling: false }),
  });

  return {
    ...INITIAL_STATE,

    setConfig: (config) =>
      set((state) => ({
        config: { ...state.config, ...config },
      })),

    start: async () => {
      const state = get();
      if (state.status === "running" || state.isStarting) {
        console.log("[LoadTest] Already running or starting");
        return;
      }

      set({ isStarting: true });
      useMetricsStore.getState().reset();

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

        set({
          status: "initializing",
          startTime: Date.now(),
          elapsedTime: 0,
          txSentCount: 0,
          txConfirmedCount: 0,
          txFailedCount: 0,
          txDiscardedCount: 0,
          currentRate: 0,
          averageTps: 0,
          targetTps: getInitialTargetTps(request),
          peakTps: 0,
          durationSec: request.durationSec,
          error: null,
          isPolling: true,
          isStarting: false,
          initPhase: "",
          initProgress: "Starting initialization...",
          accountsTotal: 0,
          accountsGenerated: 0,
          fundingTxsSent: 0,
          fundingTxsTotal: 0,
          contractsDeployed: 0,
          contractsTotal: 0,
        });

        wsManager.connect();
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
      set({ isPolling: false });

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

      wsManager.disconnect();
      set({ status: "completed" });
    },

    reset: async () => {
      try {
        await fetchLoadGenAPI("/reset", { method: "POST" });
        wsManager.disconnect();
        useMetricsStore.getState().reset();
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
        const { state } = parseMetricsMessage(metrics, get().chartTimeSeries);
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
        isHistoricalMode: true,
      });
    },

    checkAndReconnect: async () => {
      if (get().isHistoricalMode) return;

      try {
        const response = await fetchLoadGenAPI("/status");
        if (!response.ok) return;

        const metrics: GoLoadTestMetrics = await response.json();

        if (metrics.status === "running" || metrics.status === "initializing" || metrics.status === "verifying") {
          console.log("Reconnecting to", metrics.status, "load test...");
          let status: LoadTestStatus = "running";
          if (metrics.status === "initializing") status = "initializing";
          else if (metrics.status === "verifying") status = "verifying";

          const { state } = parseMetricsMessage(metrics, get().chartTimeSeries);
          set({
            ...state,
            status,
            config: {
              ...get().config,
              pattern: metrics.pattern,
              duration: Math.floor(metrics.durationMs / 1000),
            },
            isPolling: true,
          });
          wsManager.connect();
        } else if (metrics.status === "completed" || metrics.status === "error") {
          const { state } = parseMetricsMessage(metrics, get().chartTimeSeries);
          set({
            ...state,
            status: metrics.status === "completed" ? "completed" : "error",
            isPolling: false,
          });
        }
      } catch (error) {
        console.debug("Load generator not available:", error);
      }
    },
  };
});
