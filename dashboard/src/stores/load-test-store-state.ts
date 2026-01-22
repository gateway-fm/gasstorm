/**
 * Load test store state types and initial values
 */

import type {
  LoadTestConfig,
  LoadTestStatus,
  LatencyStats,
  InitPhase,
  TipHistogramBucket,
  TxTypeMetrics,
} from "@/types/load-test";
import { DEFAULT_LOAD_TEST_CONFIG } from "@/types/load-test";
import type { ChartTimeSeries } from "./load-test-websocket";
import type { HistoricalTestRun, HistoricalTimeSeriesPoint } from "./load-test-api";

export interface GoLoadTestState {
  status: LoadTestStatus;
  config: LoadTestConfig;
  startTime: number | null;
  elapsedTime: number;
  currentRate: number;
  txSentCount: number;
  txConfirmedCount: number;
  txFailedCount: number;
  txDiscardedCount: number;
  averageTps: number;
  targetTps: number;
  peakTps: number;
  durationSec: number;
  error: string | null;
  isPolling: boolean;
  isStarting: boolean;
  wsConnected: boolean;
  // Initialization progress
  initPhase: InitPhase;
  initProgress: string;
  accountsTotal: number;
  accountsGenerated: number;
  fundingTxsSent: number;
  fundingTxsTotal: number;
  contractsDeployed: number;
  contractsTotal: number;
  // Preconfirmation stage counters
  txPendingCount: number;
  txPreconfirmedCount: number;
  txRevokedCount: number;
  txDroppedCount: number;
  txRequeuedCount: number;
  // Latency statistics
  latencyStats: LatencyStats | null;
  preconfLatencyStats: LatencyStats | null;
  pendingLatencyStats: LatencyStats | null;
  // Realistic test specific
  tipHistogram: TipHistogramBucket[];
  txTypeMetrics: TxTypeMetrics[];
  accountsActive: number;
  accountsFunded: number;
  // Block gas metrics
  latestBaseFeeGwei: number;
  latestGasPriceGwei: number;
  latestGasUsed: number;
  // Aggregate block metrics
  totalGasUsed: number;
  blockCount: number;
  peakMgasPerSec: number;
  avgMgasPerSec: number;
  avgFillRate: number;
  // Current rolling metrics
  currentMgasPerSec: number;
  currentFillRate: number;
  // Time series for live chart
  chartTimeSeries: ChartTimeSeries;
  // Historical mode
  isHistoricalMode: boolean;
}

export interface GoLoadTestActions {
  setConfig: (config: Partial<LoadTestConfig>) => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  reset: () => Promise<void>;
  pollStatus: () => Promise<void>;
  checkAndReconnect: () => Promise<void>;
  hydrateFromHistory: (run: HistoricalTestRun, timeSeries: HistoricalTimeSeriesPoint[]) => void;
  setHistoricalMode: (isHistorical: boolean) => void;
}

export type GoLoadTestStore = GoLoadTestState & GoLoadTestActions;

// Initial state for the store
export const INITIAL_STATE: GoLoadTestState = {
  status: "idle",
  config: { ...DEFAULT_LOAD_TEST_CONFIG },
  startTime: null,
  elapsedTime: 0,
  currentRate: 0,
  txSentCount: 0,
  txConfirmedCount: 0,
  txFailedCount: 0,
  txDiscardedCount: 0,
  averageTps: 0,
  targetTps: 0,
  peakTps: 0,
  durationSec: 60,
  error: null,
  isPolling: false,
  isStarting: false,
  wsConnected: false,
  // Initialization progress
  initPhase: "",
  initProgress: "",
  accountsTotal: 0,
  accountsGenerated: 0,
  fundingTxsSent: 0,
  fundingTxsTotal: 0,
  contractsDeployed: 0,
  contractsTotal: 0,
  // Preconfirmation stage counters
  txPendingCount: 0,
  txPreconfirmedCount: 0,
  txRevokedCount: 0,
  txDroppedCount: 0,
  txRequeuedCount: 0,
  // Latency stats
  latencyStats: null,
  preconfLatencyStats: null,
  pendingLatencyStats: null,
  // Realistic test specific
  tipHistogram: [],
  txTypeMetrics: [],
  accountsActive: 0,
  accountsFunded: 0,
  // Block gas metrics
  latestBaseFeeGwei: 0,
  latestGasPriceGwei: 0,
  latestGasUsed: 0,
  // Aggregate block metrics
  totalGasUsed: 0,
  blockCount: 0,
  peakMgasPerSec: 0,
  avgMgasPerSec: 0,
  avgFillRate: 0,
  // Current rolling metrics
  currentMgasPerSec: 0,
  currentFillRate: 0,
  // Time series
  chartTimeSeries: {
    timestamps: [],
    mgasPerSec: [],
    txPerSec: [],
    fillRate: [],
  },
  // Historical mode
  isHistoricalMode: false,
};

// Reset state (same as initial except preserves config)
export function getResetState(): Partial<GoLoadTestState> {
  return {
    status: "idle",
    startTime: null,
    elapsedTime: 0,
    txSentCount: 0,
    txConfirmedCount: 0,
    txFailedCount: 0,
    txDiscardedCount: 0,
    currentRate: 0,
    averageTps: 0,
    targetTps: 0,
    peakTps: 0,
    error: null,
    isPolling: false,
    isStarting: false,
    // Initialization progress
    initPhase: "",
    initProgress: "",
    accountsTotal: 0,
    accountsGenerated: 0,
    fundingTxsSent: 0,
    fundingTxsTotal: 0,
    contractsDeployed: 0,
    contractsTotal: 0,
    // Preconfirmation stage counters
    txPendingCount: 0,
    txPreconfirmedCount: 0,
    txRevokedCount: 0,
    txDroppedCount: 0,
    txRequeuedCount: 0,
    // Latency stats
    latencyStats: null,
    preconfLatencyStats: null,
    pendingLatencyStats: null,
    // Realistic test specific
    tipHistogram: [],
    txTypeMetrics: [],
    accountsActive: 0,
    accountsFunded: 0,
    // Block gas metrics
    latestBaseFeeGwei: 0,
    latestGasPriceGwei: 0,
    latestGasUsed: 0,
    // Aggregate block metrics
    totalGasUsed: 0,
    blockCount: 0,
    peakMgasPerSec: 0,
    avgMgasPerSec: 0,
    avgFillRate: 0,
    // Current rolling metrics
    currentMgasPerSec: 0,
    currentFillRate: 0,
    // Time series
    chartTimeSeries: {
      timestamps: [],
      mgasPerSec: [],
      txPerSec: [],
      fillRate: [],
    },
    // Historical mode
    isHistoricalMode: false,
  };
}
