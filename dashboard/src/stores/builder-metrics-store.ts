/**
 * Builder Block Metrics Store
 *
 * Connects to the block-builder's /ws/block-metrics WebSocket to receive
 * per-block timing breakdown (filter duration, Engine API duration, total
 * build duration). Exposes rolling averages for the bottleneck analysis
 * component.
 */

import { create } from "zustand";
import type { BuilderBlockMetrics } from "@/types/load-test";
import { isDevMode, getServiceWsUrl } from "@/lib/host";

const RECENT_WINDOW = 10; // Keep last 10 blocks for rolling averages

interface BuilderTimingSnapshot {
  avgFilterMs: number;
  avgEngineApiMs: number;
  avgFcuMs: number;
  avgGetPayloadMs: number;
  avgTotalBuildMs: number;
  latestFilterMs: number;
  latestEngineApiMs: number;
  latestFcuMs: number;
  latestGetPayloadMs: number;
  latestTotalBuildMs: number;
  blockCount: number;
}

interface BuilderMetricsState {
  /** Recent block metrics from the builder WS */
  recentBlocks: BuilderBlockMetrics[];
  /** Rolling averages computed from recentBlocks */
  timing: BuilderTimingSnapshot;
  /** Whether the WebSocket is connected */
  connected: boolean;
}

interface BuilderMetricsActions {
  addBlockMetrics: (metrics: BuilderBlockMetrics) => void;
  reset: () => void;
  setConnected: (connected: boolean) => void;
}

type BuilderMetricsStore = BuilderMetricsState & BuilderMetricsActions;

const EMPTY_TIMING: BuilderTimingSnapshot = {
  avgFilterMs: 0,
  avgEngineApiMs: 0,
  avgFcuMs: 0,
  avgGetPayloadMs: 0,
  avgTotalBuildMs: 0,
  latestFilterMs: 0,
  latestEngineApiMs: 0,
  latestFcuMs: 0,
  latestGetPayloadMs: 0,
  latestTotalBuildMs: 0,
  blockCount: 0,
};

function computeTiming(blocks: BuilderBlockMetrics[]): BuilderTimingSnapshot {
  if (blocks.length === 0) return EMPTY_TIMING;

  const n = blocks.length;
  const latest = blocks[n - 1];

  const avgFilterMs = blocks.reduce((sum, b) => sum + b.filterDurationMs, 0) / n;
  const avgEngineApiMs = blocks.reduce((sum, b) => sum + b.engineApiDurationMs, 0) / n;
  const avgFcuMs = blocks.reduce((sum, b) => sum + (b.fcuDurationMs ?? 0), 0) / n;
  const avgGetPayloadMs = blocks.reduce((sum, b) => sum + (b.getPayloadDurationMs ?? 0), 0) / n;
  const avgTotalBuildMs = blocks.reduce((sum, b) => sum + b.totalBuildDurationMs, 0) / n;

  return {
    avgFilterMs,
    avgEngineApiMs,
    avgFcuMs,
    avgGetPayloadMs,
    avgTotalBuildMs,
    latestFilterMs: latest.filterDurationMs,
    latestEngineApiMs: latest.engineApiDurationMs,
    latestFcuMs: latest.fcuDurationMs ?? 0,
    latestGetPayloadMs: latest.getPayloadDurationMs ?? 0,
    latestTotalBuildMs: latest.totalBuildDurationMs,
    blockCount: n,
  };
}

export const useBuilderMetricsStore = create<BuilderMetricsStore>((set) => ({
  recentBlocks: [],
  timing: { ...EMPTY_TIMING },
  connected: false,

  addBlockMetrics: (metrics) =>
    set((state) => {
      const recentBlocks = [...state.recentBlocks, metrics].slice(-RECENT_WINDOW);
      return { recentBlocks, timing: computeTiming(recentBlocks) };
    }),

  reset: () =>
    set(() => ({
      recentBlocks: [],
      timing: { ...EMPTY_TIMING },
    })),

  setConnected: (connected) => set({ connected }),
}));

// ---------- WebSocket manager ----------

/** Get the WebSocket URL for the builder's block-metrics endpoint */
function getBuilderBlockMetricsWsUrl(): string {
  if (typeof window === "undefined") return "ws://localhost:13002/ws/block-metrics";

  if (isDevMode()) {
    return getServiceWsUrl(13002, "/ws/block-metrics");
  }

  // Production: use nginx proxy path
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/builder-metrics`;
}

let ws: WebSocket | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let shouldReconnect = false;

export function connectBuilderMetricsWs(): void {
  if (ws?.readyState === WebSocket.OPEN) return;

  shouldReconnect = true;
  const url = getBuilderBlockMetricsWsUrl();

  try {
    ws = new WebSocket(url);

    ws.onopen = () => {
      useBuilderMetricsStore.getState().setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const metrics: BuilderBlockMetrics = JSON.parse(event.data);
        // Basic validation: must have a block number
        if (typeof metrics.blockNumber === "number" && metrics.blockNumber > 0) {
          useBuilderMetricsStore.getState().addBlockMetrics(metrics);
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onerror = () => {
      // Errors are logged via onclose
    };

    ws.onclose = () => {
      ws = null;
      useBuilderMetricsStore.getState().setConnected(false);
      if (shouldReconnect) {
        reconnectTimeout = setTimeout(connectBuilderMetricsWs, 3000);
      }
    };
  } catch {
    ws = null;
  }
}

export function disconnectBuilderMetricsWs(): void {
  shouldReconnect = false;
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
}
