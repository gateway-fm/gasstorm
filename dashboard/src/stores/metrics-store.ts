import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BlockMetrics, MetricsSnapshot, MetricsTimeSeries } from "@/types/metrics";
import type { TransactionRecord } from "@/types/load-test";

interface MetricsState {
  // Block metrics history
  blockMetrics: BlockMetrics[];

  // Current snapshot
  snapshot: MetricsSnapshot;

  // Time series data for charts
  timeSeries: MetricsTimeSeries;

  // Transaction records for latency tracking
  transactions: TransactionRecord[];

  // Latencies (confirmed tx only)
  latencies: number[];

  // Historical mode - when true, ignores live updates
  isHistoricalMode: boolean;
}

// Types for historical data hydration
interface HistoricalTestRun {
  txConfirmed: number;
  averageTps: number;
  peakTps: number;
  // Block metrics (aggregated)
  blockCount?: number;
  totalGasUsed?: number;
  avgFillRate?: number;
  peakMgasPerSec?: number;
  avgMgasPerSec?: number;
}

interface HistoricalTimeSeriesPoint {
  timestampMs: number;
  currentTps: number;
  targetTps: number;
  // Block metrics per sample period
  gasUsed?: number;
  gasLimit?: number;
  blockCount?: number;
  mgasPerSec?: number;
  fillRate?: number;
}

interface MetricsActions {
  addBlockMetrics: (metrics: BlockMetrics) => void;
  addTransaction: (tx: TransactionRecord) => void;
  updateTransaction: (txHash: string, update: Partial<TransactionRecord>) => void;
  recordLatency: (latencyMs: number) => void;
  reset: () => void;
  hydrateFromHistory: (run: HistoricalTestRun, timeSeries: HistoricalTimeSeriesPoint[]) => void;
  setHistoricalMode: (isHistorical: boolean) => void;
}

type MetricsStore = MetricsState & MetricsActions;

const initialSnapshot: MetricsSnapshot = {
  currentMgasPerSec: 0,
  currentTxPerSec: 0,
  currentFillRate: 0,
  peakMgasPerSec: 0,
  peakTxPerSec: 0,
  averageFillRate: 0,
  totalGasUsed: 0n,
  totalTransactions: 0,
  blocksProduced: 0,
  // Block time stats (milliseconds)
  currentBlockTimeMs: 0,
  avgBlockTimeMs: 0,
  minBlockTimeMs: 0,
  maxBlockTimeMs: 0,
};

const initialTimeSeries: MetricsTimeSeries = {
  timestamps: [],
  mgasPerSec: [],
  txPerSec: [],
  blockFillRate: [],
  latencies: [],
  blockTimes: [],
};

export const useMetricsStore = create<MetricsStore>()(
  persist(
    (set) => ({
  // State
  blockMetrics: [],
  snapshot: { ...initialSnapshot },
  timeSeries: { ...initialTimeSeries },
  transactions: [],
  latencies: [],
  isHistoricalMode: false,

  // Actions
  addBlockMetrics: (metrics) =>
    set((state) => {
      // Ignore live updates when in historical mode
      if (state.isHistoricalMode) return state;
      const blockMetrics = [...state.blockMetrics, metrics];

      // Calculate smoothed values using rolling average targeting ~3 seconds of data
      // Dynamically adjust window size based on actual block time
      const targetSmoothingSeconds = 3;
      const avgBlockTime = metrics.blockTime > 0 ? metrics.blockTime : 0.25;
      const smoothingWindow = Math.max(3, Math.ceil(targetSmoothingSeconds / avgBlockTime));
      const recentBlocks = blockMetrics.slice(-smoothingWindow);

      // Sum up totals over the window for accurate rate calculation
      const windowTxCount = recentBlocks.reduce((sum, b) => sum + b.transactionCount, 0);
      const windowGasUsed = recentBlocks.reduce((sum, b) => sum + Number(b.gasUsed), 0);
      const windowTime = recentBlocks.reduce((sum, b) => sum + b.blockTime, 0);

      // Calculate smoothed rates (avoid division by zero)
      const smoothedTxPerSec = windowTime > 0 ? windowTxCount / windowTime : metrics.txPerSec;
      const smoothedMgasPerSec = windowTime > 0 ? (windowGasUsed / 1_000_000) / windowTime : metrics.mgasPerSec;

      // Convert block time to milliseconds for display
      const blockTimeMs = metrics.blockTime * 1000;

      // Update time series with smoothed values
      const timeSeries = {
        timestamps: [...state.timeSeries.timestamps, metrics.timestamp],
        mgasPerSec: [...state.timeSeries.mgasPerSec, smoothedMgasPerSec],
        txPerSec: [...state.timeSeries.txPerSec, smoothedTxPerSec],
        blockFillRate: [...state.timeSeries.blockFillRate, metrics.fillRate],
        latencies: state.timeSeries.latencies,
        blockTimes: [...state.timeSeries.blockTimes, blockTimeMs],
      };

      // Update snapshot (totalTransactions is updated separately when TXs confirm)
      const totalGasUsed = state.snapshot.totalGasUsed + metrics.gasUsed;
      const blocksProduced = blockMetrics.length;

      const avgFillRate = blockMetrics.reduce((sum, m) => sum + m.fillRate, 0) / blocksProduced;

      // Calculate block time stats (in ms) - only from blocks with valid block time (> 0)
      const validBlockTimes = blockMetrics
        .map(m => m.blockTime * 1000)
        .filter(t => t > 0);
      const avgBlockTimeMs = validBlockTimes.length > 0
        ? validBlockTimes.reduce((sum, t) => sum + t, 0) / validBlockTimes.length
        : 0;
      const minBlockTimeMs = validBlockTimes.length > 0
        ? Math.min(...validBlockTimes)
        : 0;
      const maxBlockTimeMs = validBlockTimes.length > 0
        ? Math.max(...validBlockTimes)
        : 0;

      const snapshot: MetricsSnapshot = {
        currentMgasPerSec: smoothedMgasPerSec,
        currentTxPerSec: smoothedTxPerSec,
        currentFillRate: metrics.fillRate,
        peakMgasPerSec: Math.max(state.snapshot.peakMgasPerSec, smoothedMgasPerSec),
        peakTxPerSec: Math.max(state.snapshot.peakTxPerSec, smoothedTxPerSec),
        averageFillRate: avgFillRate,
        totalGasUsed,
        totalTransactions: state.snapshot.totalTransactions, // Preserve current count
        blocksProduced,
        // Block time stats
        currentBlockTimeMs: blockTimeMs,
        avgBlockTimeMs,
        minBlockTimeMs,
        maxBlockTimeMs,
      };

      return { blockMetrics, timeSeries, snapshot };
    }),

  addTransaction: (tx) =>
    set((state) => {
      // Ignore live updates when in historical mode
      if (state.isHistoricalMode) return state;
      return { transactions: [...state.transactions, tx] };
    }),

  updateTransaction: (txHash, update) =>
    set((state) => {
      // Ignore live updates when in historical mode
      if (state.isHistoricalMode) return state;
      const transactions = state.transactions.map((tx) =>
        tx.txHash === txHash ? { ...tx, ...update } : tx
      );

      // Increment totalTransactions when a load test TX is confirmed
      const newTotalTransactions = update.status === "confirmed"
        ? state.snapshot.totalTransactions + 1
        : state.snapshot.totalTransactions;

      return {
        transactions,
        snapshot: {
          ...state.snapshot,
          totalTransactions: newTotalTransactions,
        },
      };
    }),

  recordLatency: (latencyMs) =>
    set((state) => {
      // Ignore live updates when in historical mode
      if (state.isHistoricalMode) return state;
      return {
        latencies: [...state.latencies, latencyMs],
        timeSeries: {
          ...state.timeSeries,
          latencies: [...state.timeSeries.latencies, latencyMs],
        },
      };
    }),

  reset: () =>
    set(() => ({
      blockMetrics: [],
      snapshot: { ...initialSnapshot },
      timeSeries: { ...initialTimeSeries },
      transactions: [],
      latencies: [],
      isHistoricalMode: false,
    })),

  setHistoricalMode: (isHistorical: boolean) =>
    set(() => ({ isHistoricalMode: isHistorical })),

  // Hydrate store with historical test data (for history detail view)
  hydrateFromHistory: (run: HistoricalTestRun, timeSeries: HistoricalTimeSeriesPoint[]) => {
    // Convert TimeSeriesPoint[] to MetricsTimeSeries format
    const timestamps = timeSeries.map(p => p.timestampMs / 1000);
    const txPerSec = timeSeries.map(p => p.currentTps);

    // Extract block metrics from time series (now available in historical data)
    const mgasPerSec = timeSeries.map(p => p.mgasPerSec ?? 0);
    const blockFillRate = timeSeries.map(p => p.fillRate ?? 0);

    set({
      blockMetrics: [], // Raw block data not available, but time series has aggregated values
      timeSeries: {
        timestamps,
        mgasPerSec,
        txPerSec,
        blockFillRate,
        latencies: [],
        blockTimes: [], // Not available in historical data
      },
      snapshot: {
        currentMgasPerSec: run.avgMgasPerSec ?? 0,
        currentTxPerSec: run.averageTps,
        currentFillRate: run.avgFillRate ?? 0,
        peakMgasPerSec: run.peakMgasPerSec ?? 0,
        peakTxPerSec: run.peakTps,
        averageFillRate: run.avgFillRate ?? 0,
        totalGasUsed: BigInt(run.totalGasUsed ?? 0),
        totalTransactions: run.txConfirmed,
        blocksProduced: run.blockCount ?? 0,
        // Block time stats not available in historical data
        currentBlockTimeMs: 0,
        avgBlockTimeMs: 0,
        minBlockTimeMs: 0,
        maxBlockTimeMs: 0,
      },
      transactions: [],
      latencies: [],
      isHistoricalMode: true, // Prevent live updates from interfering
    });
  },
    }),
    {
      name: "metrics-storage",
      // Don't persist BigInt-containing fields - metrics are ephemeral anyway
      // This avoids "Do not know how to serialize a BigInt" errors
      partialize: (state) => ({
        // Only persist simple number arrays that don't contain BigInt
        latencies: state.latencies,
        // Don't persist: blockMetrics (contains gasUsed/gasLimit BigInt),
        // snapshot (contains totalGasUsed BigInt), timeSeries, transactions
      }),
    }
  )
);
