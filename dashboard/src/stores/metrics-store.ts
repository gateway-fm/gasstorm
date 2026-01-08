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
}

// Types for historical data hydration
interface HistoricalTestRun {
  txConfirmed: number;
  averageTps: number;
  peakTps: number;
}

interface HistoricalTimeSeriesPoint {
  timestampMs: number;
  currentTps: number;
  targetTps: number;
}

interface MetricsActions {
  addBlockMetrics: (metrics: BlockMetrics) => void;
  addTransaction: (tx: TransactionRecord) => void;
  updateTransaction: (txHash: string, update: Partial<TransactionRecord>) => void;
  recordLatency: (latencyMs: number) => void;
  reset: () => void;
  hydrateFromHistory: (run: HistoricalTestRun, timeSeries: HistoricalTimeSeriesPoint[]) => void;
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
};

const initialTimeSeries: MetricsTimeSeries = {
  timestamps: [],
  mgasPerSec: [],
  txPerSec: [],
  blockFillRate: [],
  latencies: [],
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

  // Actions
  addBlockMetrics: (metrics) =>
    set((state) => {
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

      // Update time series with smoothed values
      const timeSeries = {
        timestamps: [...state.timeSeries.timestamps, metrics.timestamp],
        mgasPerSec: [...state.timeSeries.mgasPerSec, smoothedMgasPerSec],
        txPerSec: [...state.timeSeries.txPerSec, smoothedTxPerSec],
        blockFillRate: [...state.timeSeries.blockFillRate, metrics.fillRate],
        latencies: state.timeSeries.latencies,
      };

      // Update snapshot (totalTransactions is updated separately when TXs confirm)
      const totalGasUsed = state.snapshot.totalGasUsed + metrics.gasUsed;
      const blocksProduced = blockMetrics.length;

      const avgFillRate = blockMetrics.reduce((sum, m) => sum + m.fillRate, 0) / blocksProduced;

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
      };

      return { blockMetrics, timeSeries, snapshot };
    }),

  addTransaction: (tx) =>
    set((state) => ({
      transactions: [...state.transactions, tx],
    })),

  updateTransaction: (txHash, update) =>
    set((state) => {
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
    set((state) => ({
      latencies: [...state.latencies, latencyMs],
      timeSeries: {
        ...state.timeSeries,
        latencies: [...state.timeSeries.latencies, latencyMs],
      },
    })),

  reset: () =>
    set(() => ({
      blockMetrics: [],
      snapshot: { ...initialSnapshot },
      timeSeries: { ...initialTimeSeries },
      transactions: [],
      latencies: [],
    })),

  // Hydrate store with historical test data (for history detail view)
  hydrateFromHistory: (run: HistoricalTestRun, timeSeries: HistoricalTimeSeriesPoint[]) => {
    // Convert TimeSeriesPoint[] to MetricsTimeSeries format
    // Note: Block metrics (Mgas/s, fillRate) are not available in historical data
    const timestamps = timeSeries.map(p => p.timestampMs / 1000);
    const txPerSec = timeSeries.map(p => p.currentTps);

    set({
      blockMetrics: [], // Not available in history
      timeSeries: {
        timestamps,
        mgasPerSec: [], // Not available in history
        txPerSec,
        blockFillRate: [], // Not available in history
        latencies: [],
      },
      snapshot: {
        currentMgasPerSec: 0,
        currentTxPerSec: run.averageTps,
        currentFillRate: 0,
        peakMgasPerSec: 0,
        peakTxPerSec: run.peakTps,
        averageFillRate: 0,
        totalGasUsed: 0n,
        totalTransactions: run.txConfirmed,
        blocksProduced: 0,
      },
      transactions: [],
      latencies: [],
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
