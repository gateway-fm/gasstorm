import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LoadTestConfig, LoadTestStatus, LoadPattern, TransactionType, StressTestConfig, TipHistogramBucket, TxTypeMetrics } from "@/types/load-test";
import { DEFAULT_LOAD_TEST_CONFIG, DEFAULT_STRESS_CONFIG } from "@/types/load-test";
import { useMetricsStore } from "./metrics-store";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _metricsStore = useMetricsStore; // Keep import for reset() calls

// Latency bucket from Go load generator
interface LatencyBucket {
  label: string;
  count: number;
}

// Latency statistics from Go load generator
interface LatencyStats {
  count: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  buckets: LatencyBucket[];
}

// Go load generator API response types
interface GoLoadTestMetrics {
  status: "idle" | "running" | "completed" | "error";
  txSent: number;
  txConfirmed: number;
  txFailed: number;
  currentTps: number;
  averageTps: number;
  elapsedMs: number;
  durationMs: number;
  targetTps: number;
  pattern: LoadPattern;
  transactionType: TransactionType;
  peakTps?: number; // For max pattern
  error?: string;
  latency?: LatencyStats; // Confirmation latency statistics
  preconfLatency?: LatencyStats; // Preconfirmation latency statistics
  // Stress test specific metrics
  tipHistogram?: TipHistogramBucket[];
  txTypeMetrics?: TxTypeMetrics[];
  accountsActive?: number;
  accountsFunded?: number;
}

// Request payload to Go load generator
interface StartTestRequest {
  // Common
  pattern: LoadPattern;
  durationSec: number;
  numAccounts: number;
  transactionType?: TransactionType; // Transaction type to generate

  // Constant pattern
  constantRate?: number;

  // Ramp pattern
  rampStart?: number;
  rampEnd?: number;
  rampSteps?: number;

  // Spike pattern
  baselineRate?: number;
  spikeRate?: number;
  spikeDuration?: number;
  spikeInterval?: number;

  // Max pattern
  maxInitialRate?: number;
  maxTargetPending?: number;
  maxRateStep?: number;

  // Stress pattern
  stressConfig?: StressTestConfig;
}

interface GoLoadTestActions {
  setConfig: (config: Partial<LoadTestConfig>) => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  reset: () => Promise<void>;
  pollStatus: () => Promise<void>;
  checkAndReconnect: () => Promise<void>;
  hydrateFromHistory: (run: HistoricalTestRun, timeSeries: HistoricalTimeSeriesPoint[]) => void;
}

// Types for historical data hydration
interface HistoricalTestRun {
  id: string;
  startedAt: string;
  completedAt?: string;
  pattern: LoadPattern;
  transactionType: TransactionType;
  durationMs: number;
  txSent: number;
  txConfirmed: number;
  txFailed: number;
  averageTps: number;
  peakTps: number;
  latencyStats?: LatencyStats;
  preconfLatency?: LatencyStats;
  config?: {
    pattern: LoadPattern;
    durationSec: number;
    numAccounts?: number;
    constantRate?: number;
    rampStart?: number;
    rampEnd?: number;
    rampSteps?: number;
    spikeRate?: number;
    baselineRate?: number;
    spikeDuration?: number;
    spikeInterval?: number;
    maxInitialRate?: number;
    maxTargetPending?: number;
    maxRateStep?: number;
    stressConfig?: StressTestConfig;
  };
  tipHistogram?: TipHistogramBucket[];
  txTypeMetrics?: TxTypeMetrics[];
}

interface HistoricalTimeSeriesPoint {
  timestampMs: number;
  txSent: number;
  txConfirmed: number;
  txFailed: number;
  currentTps: number;
  targetTps: number;
  pendingCount: number;
}

interface GoLoadTestState {
  status: LoadTestStatus;
  config: LoadTestConfig;
  startTime: number | null;
  elapsedTime: number;
  currentRate: number;
  txSentCount: number;
  txConfirmedCount: number;
  txFailedCount: number;
  averageTps: number;
  targetTps: number;
  peakTps: number; // For max pattern
  durationSec: number;
  error: string | null;
  isPolling: boolean;
  isStarting: boolean; // True while start API call is in flight
  wsConnected: boolean; // WebSocket connection status
  latencyStats: LatencyStats | null; // Confirmation latency statistics from Go load generator
  preconfLatencyStats: LatencyStats | null; // Preconfirmation latency statistics
  // Stress test specific state
  tipHistogram: TipHistogramBucket[];
  txTypeMetrics: TxTypeMetrics[];
  accountsActive: number;
  accountsFunded: number;
}

type GoLoadTestStore = GoLoadTestState & GoLoadTestActions;

// Load generator API base URL - will be proxied through nginx in docker
const LOAD_GEN_API = "/api/loadgen";

// In dev mode (port 3000), connect directly to load generator
// since Next.js rewrites don't support WebSocket upgrades
function getLoadGenWsUrl(): string {
  if (typeof window === "undefined") return "ws://localhost:13001/ws";

  const host = window.location.host;
  const isDev = host.includes("localhost:3000") || host.includes("127.0.0.1:3000");

  if (isDev) {
    return "ws://localhost:13001/ws";
  }

  // Production: use nginx proxy path
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${host}/ws/loadgen`;
}

const LOAD_GEN_WS = getLoadGenWsUrl();

async function fetchLoadGenAPI(endpoint: string, options?: RequestInit): Promise<Response> {
  const url = `${LOAD_GEN_API}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  return response;
}

export const useGoLoadTestStore = create<GoLoadTestStore>()(
  persist(
    (set, get) => {
      let ws: WebSocket | null = null;
      let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
      let isConnecting = false;

  const connectWebSocket = () => {
    if (ws?.readyState === WebSocket.OPEN || isConnecting) {
      console.log("[LoadTest] WebSocket already connected or connecting");
      return;
    }

    isConnecting = true;
    console.log("[LoadTest] Connecting to WebSocket:", LOAD_GEN_WS);

    try {
      ws = new WebSocket(LOAD_GEN_WS);

      ws.onopen = () => {
        console.log("[LoadTest] WebSocket connected");
        isConnecting = false;
        set({ wsConnected: true });
      };

      ws.onmessage = (event) => {
        try {
          const metrics: GoLoadTestMetrics = JSON.parse(event.data);

          // Map Go status to our status type
          let status: LoadTestStatus = "idle";
          if (metrics.status === "running") status = "running";
          else if (metrics.status === "completed") status = "completed";
          else if (metrics.status === "error") status = "error";

          const newState = {
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
            latencyStats: metrics.latency ?? null,
            preconfLatencyStats: metrics.preconfLatency ?? null,
            // Stress test specific
            tipHistogram: metrics.tipHistogram ?? [],
            txTypeMetrics: metrics.txTypeMetrics ?? [],
            accountsActive: metrics.accountsActive ?? 0,
            accountsFunded: metrics.accountsFunded ?? 0,
          };

          set(newState);

          // Disconnect immediately when test completes - don't wait for pending to clear
          // Pending count at test end is just a stat, not a completion blocker
          if ((status === "completed" || status === "error") && metrics.txSent > 0) {
            console.log("[LoadTest] Test finished, closing WebSocket");
            disconnectWebSocket();
            set({ isPolling: false });
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
        set({ wsConnected: false });

        // Auto-reconnect if we're still supposed to be polling
        if (get().isPolling) {
          console.log("[LoadTest] Scheduling reconnect...");
          reconnectTimeout = setTimeout(() => {
            connectWebSocket();
          }, 1000);
        }
      };
    } catch (err) {
      console.error("[LoadTest] Failed to create WebSocket:", err);
      isConnecting = false;
    }
  };

  const disconnectWebSocket = () => {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    if (ws) {
      ws.close();
      ws = null;
    }
  };

  // Legacy polling functions (kept for fallback/compatibility)
  const startPolling = () => {
    console.log("[LoadTest] Starting WebSocket connection");
    connectWebSocket();
  };

  const stopPolling = () => {
    console.log("[LoadTest] Stopping WebSocket connection");
    disconnectWebSocket();
  };

  return {
    // State
    status: "idle",
    config: { ...DEFAULT_LOAD_TEST_CONFIG },
    startTime: null,
    elapsedTime: 0,
    currentRate: 0,
    txSentCount: 0,
    txConfirmedCount: 0,
    txFailedCount: 0,
    averageTps: 0,
    targetTps: 0,
    peakTps: 0,
    durationSec: 60,
    error: null,
    isPolling: false,
    isStarting: false,
    wsConnected: false,
    latencyStats: null,
    preconfLatencyStats: null,
    // Stress test specific
    tipHistogram: [],
    txTypeMetrics: [],
    accountsActive: 0,
    accountsFunded: 0,

    // Actions
    setConfig: (config) =>
      set((state) => ({
        config: { ...state.config, ...config },
      })),

    start: async () => {
      const state = get();
      if (state.status === "running" || state.isStarting) {
        console.log("[LoadTest] Already running or starting, ignoring start");
        return;
      }

      console.log("[LoadTest] Starting test, current status:", state.status);

      // Set isStarting immediately for instant UI feedback
      set({ isStarting: true });

      // Reset metrics store
      useMetricsStore.getState().reset();

      const cfg = state.config;
      const pattern = cfg.pattern ?? "constant";
      const durationSec = cfg.duration ?? 60;

      // Build the full request with all pattern-specific parameters
      // Use config values directly - they should already have defaults from DEFAULT_LOAD_TEST_CONFIG

      const request: StartTestRequest = {
        pattern,
        durationSec,
        numAccounts: 100, // Default - stress test overrides this from stressConfig
        transactionType: cfg.transactionType ?? "eth-transfer",
      };

      // Add pattern-specific parameters - merge with defaults to handle persisted configs
      // that might be missing newer fields
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

        case "max":
          request.maxInitialRate = cfg.maxInitialRate ?? DEFAULT_LOAD_TEST_CONFIG.maxInitialRate;
          request.maxTargetPending = cfg.maxTargetPending ?? DEFAULT_LOAD_TEST_CONFIG.maxTargetPending;
          request.maxRateStep = cfg.maxRateStep ?? DEFAULT_LOAD_TEST_CONFIG.maxRateStep;
          break;

        case "stress":
          request.stressConfig = cfg.stressConfig ?? DEFAULT_STRESS_CONFIG;
          request.numAccounts = request.stressConfig.numAccounts;
          break;
      }

      // Log the request for debugging
      console.log("[LoadTest] Starting test with config:", JSON.stringify(request, null, 2));

      try {
        const response = await fetchLoadGenAPI("/start", {
          method: "POST",
          body: JSON.stringify(request),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText);
        }

        // Calculate initial target TPS for display
        let initialTargetTps = 0;
        switch (pattern) {
          case "constant":
            initialTargetTps = request.constantRate ?? 5;
            break;
          case "ramp":
            initialTargetTps = request.rampStart ?? 1;
            break;
          case "spike":
            initialTargetTps = request.baselineRate ?? 2;
            break;
          case "max":
            initialTargetTps = request.maxInitialRate ?? 10;
            break;
          case "stress":
            initialTargetTps = request.stressConfig?.targetTps ?? 500;
            break;
        }

        console.log("[LoadTest] API call successful, setting status to running");
        set({
          status: "running",
          startTime: Date.now(),
          elapsedTime: 0,
          txSentCount: 0,
          txConfirmedCount: 0,
          txFailedCount: 0,
          currentRate: 0,
          averageTps: 0,
          targetTps: initialTargetTps,
          peakTps: 0,
          durationSec,
          error: null,
          isPolling: true,
          isStarting: false,
        });
        console.log("[LoadTest] Status set, starting polling. New status:", get().status);

        startPolling();
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
      try {
        // Set isPolling to false BEFORE closing WebSocket to prevent reconnect race
        set({ isPolling: false });
        await fetchLoadGenAPI("/stop", { method: "POST" });
        stopPolling();
        set({ status: "completed" });
      } catch (error) {
        console.error("Failed to stop test:", error);
        // Restore isPolling if stop failed so reconnect can happen
        set({ isPolling: true });
      }
    },

    reset: async () => {
      try {
        await fetchLoadGenAPI("/reset", { method: "POST" });
        stopPolling();
        useMetricsStore.getState().reset();
        set({
          status: "idle",
          startTime: null,
          elapsedTime: 0,
          txSentCount: 0,
          txConfirmedCount: 0,
          txFailedCount: 0,
          currentRate: 0,
          averageTps: 0,
          targetTps: 0,
          peakTps: 0,
          error: null,
          isPolling: false,
          isStarting: false,
          latencyStats: null,
          preconfLatencyStats: null,
          tipHistogram: [],
          txTypeMetrics: [],
          accountsActive: 0,
          accountsFunded: 0,
        });
      } catch (error) {
        console.error("Failed to reset:", error);
      }
    },

    // Kept for initial status check (now WebSocket handles real-time updates)
    pollStatus: async () => {
      try {
        const response = await fetchLoadGenAPI("/status");
        if (!response.ok) {
          console.debug("[LoadTest] Status check failed:", response.status);
          return;
        }

        const metrics: GoLoadTestMetrics = await response.json();

        // Map Go status to our status type
        let status: LoadTestStatus = "idle";
        if (metrics.status === "running") status = "running";
        else if (metrics.status === "completed") status = "completed";
        else if (metrics.status === "error") status = "error";

        const newState = {
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
          latencyStats: metrics.latency ?? null,
          preconfLatencyStats: metrics.preconfLatency ?? null,
          // Stress test specific
          tipHistogram: metrics.tipHistogram ?? [],
          txTypeMetrics: metrics.txTypeMetrics ?? [],
          accountsActive: metrics.accountsActive ?? 0,
          accountsFunded: metrics.accountsFunded ?? 0,
        };

        set(newState);
      } catch (error) {
        // Silently fail - service might not be ready
        console.debug("Failed to get load generator status:", error);
      }
    },

    // Hydrate store with historical test data (for history detail view)
    hydrateFromHistory: (run: HistoricalTestRun, timeSeries: HistoricalTimeSeriesPoint[]) => {
      // Build config from historical data
      const config: LoadTestConfig = {
        pattern: run.pattern,
        duration: Math.round(run.durationMs / 1000),
        transactionType: run.transactionType,
        // Pattern-specific config
        constantRate: run.config?.constantRate,
        rampStart: run.config?.rampStart,
        rampEnd: run.config?.rampEnd,
        rampSteps: run.config?.rampSteps,
        baselineRate: run.config?.baselineRate,
        spikeRate: run.config?.spikeRate,
        spikeDuration: run.config?.spikeDuration,
        spikeInterval: run.config?.spikeInterval,
        maxInitialRate: run.config?.maxInitialRate,
        maxTargetPending: run.config?.maxTargetPending,
        maxRateStep: run.config?.maxRateStep,
        stressConfig: run.config?.stressConfig,
      };

      // Get target TPS from time series or derive from config
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
        averageTps: run.averageTps,
        targetTps,
        peakTps: run.peakTps,
        durationSec: Math.round(run.durationMs / 1000),
        error: null,
        isPolling: false,
        wsConnected: false,
        latencyStats: run.latencyStats ?? null,
        preconfLatencyStats: run.preconfLatency ?? null,
        tipHistogram: run.tipHistogram ?? [],
        txTypeMetrics: run.txTypeMetrics ?? [],
        accountsActive: 0,
        accountsFunded: 0,
      });
    },

    // Check if a test is already running and reconnect to it
    checkAndReconnect: async () => {
      try {
        const response = await fetchLoadGenAPI("/status");
        if (!response.ok) return;

        const metrics: GoLoadTestMetrics = await response.json();

        // If a test is running, start polling and sync state
        if (metrics.status === "running") {
          console.log("Reconnecting to running load test...");
          set({
            status: "running",
            txSentCount: metrics.txSent,
            txConfirmedCount: metrics.txConfirmed,
            txFailedCount: metrics.txFailed,
            currentRate: metrics.currentTps,
            averageTps: metrics.averageTps,
            elapsedTime: Math.floor(metrics.elapsedMs / 1000),
            targetTps: metrics.targetTps,
            peakTps: metrics.peakTps ?? 0,
            durationSec: Math.floor(metrics.durationMs / 1000),
            config: {
              ...get().config,
              pattern: metrics.pattern,
              duration: Math.floor(metrics.durationMs / 1000),
            },
            error: metrics.error || null,
            isPolling: true,
            latencyStats: metrics.latency ?? null,
            preconfLatencyStats: metrics.preconfLatency ?? null,
          });
          startPolling();
        } else if (metrics.status === "completed" || metrics.status === "error") {
          // Test finished but we weren't watching - show the final state
          set({
            status: metrics.status === "completed" ? "completed" : "error",
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
            isPolling: false,
            latencyStats: metrics.latency ?? null,
            preconfLatencyStats: metrics.preconfLatency ?? null,
          });
        }
      } catch (error) {
        // Service not available yet - that's fine
        console.debug("Load generator not available:", error);
      }
    },
  };
    },
    {
      name: "load-test-storage",
      // Only persist config - status and metrics should come from the backend
      // Persisting status causes issues when reconnecting to running tests
      partialize: (state) => ({
        config: state.config,
      }),
      // Custom serialization to handle BigInt values (config.txValue is bigint)
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          // Parse with BigInt revival
          return JSON.parse(str, (key, value) => {
            if (typeof value === "string" && value.startsWith("__bigint__")) {
              return BigInt(value.slice(10));
            }
            return value;
          });
        },
        setItem: (name, value) => {
          // Stringify with BigInt handling
          const str = JSON.stringify(value, (key, val) => {
            if (typeof val === "bigint") {
              return `__bigint__${val.toString()}`;
            }
            return val;
          });
          localStorage.setItem(name, str);
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
);
