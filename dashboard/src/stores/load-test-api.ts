/**
 * Load test API types and helpers
 * Handles communication with the Go load generator service
 */

import type {
  LoadPattern,
  TransactionType,
  RealisticTestConfig,
  TipHistogramBucket,
  TxTypeMetrics,
  LatencyStats,
  InitPhase,
  VerifyPhase,
} from "@/types/load-test";

// Load generator API base URL - proxied through nginx in docker
export const LOAD_GEN_API = "/api/loadgen";

/**
 * Get WebSocket URL for load generator
 * In dev mode (port 3000), connect directly since Next.js rewrites don't support WebSocket upgrades
 */
export function getLoadGenWsUrl(): string {
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

/**
 * Fetch from load generator API with JSON headers
 */
export async function fetchLoadGenAPI(endpoint: string, options?: RequestInit): Promise<Response> {
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

// Go load generator API response type
export interface GoLoadTestMetrics {
  status: "idle" | "initializing" | "running" | "verifying" | "completed" | "error";
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
  peakTps?: number;
  error?: string;
  // Initialization progress
  initPhase?: InitPhase;
  initProgress?: string;
  accountsTotal?: number;
  accountsGenerated?: number;
  fundingTxsSent?: number;
  fundingTxsTotal?: number;
  contractsDeployed?: number;
  contractsTotal?: number;
  // Verification progress
  verifyPhase?: VerifyPhase;
  verifyProgress?: string;
  blocksToVerify?: number;
  blocksVerified?: number;
  receiptsToSample?: number;
  receiptsSampled?: number;
  // Preconfirmation stage counters
  txPending?: number;
  txPreconfirmed?: number;
  txRevoked?: number;
  txDropped?: number;
  txRequeued?: number;
  // Latency statistics
  latency?: LatencyStats;
  preconfLatency?: LatencyStats;
  pendingLatency?: LatencyStats;
  // Realistic test specific
  tipHistogram?: TipHistogramBucket[];
  txTypeMetrics?: TxTypeMetrics[];
  accountsActive?: number;
  accountsFunded?: number;
  // Block gas metrics
  latestBaseFeeGwei?: number;
  latestGasPriceGwei?: number;
  latestGasUsed?: number;
  // Aggregate block metrics
  totalGasUsed?: number;
  blockCount?: number;
  peakMgasPerSec?: number;
  avgMgasPerSec?: number;
  avgFillRate?: number;
  // Current rolling metrics
  currentMgasPerSec?: number;
  currentFillRate?: number;
}

// Request payload to Go load generator
export interface StartTestRequest {
  pattern: LoadPattern;
  durationSec: number;
  numAccounts: number;
  transactionType?: TransactionType;
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
  // Adaptive pattern
  adaptiveInitialRate?: number;
  adaptiveTargetPending?: number;
  adaptiveRateStep?: number;
  // Realistic pattern
  realisticConfig?: RealisticTestConfig;
}

// Types for historical data hydration
export interface HistoricalTestRun {
  id: string;
  startedAt: string;
  completedAt?: string;
  pattern: LoadPattern;
  transactionType: TransactionType;
  durationMs: number;
  txSent: number;
  txConfirmed: number;
  txFailed: number;
  txDiscarded?: number;
  averageTps: number;
  peakTps: number;
  latencyStats?: LatencyStats;
  preconfLatency?: LatencyStats;
  pendingLatency?: LatencyStats;
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
    adaptiveInitialRate?: number;
    adaptiveTargetPending?: number;
    adaptiveRateStep?: number;
    realisticConfig?: RealisticTestConfig;
  };
  tipHistogram?: TipHistogramBucket[];
  txTypeMetrics?: TxTypeMetrics[];
  accountsActive?: number;
  accountsFunded?: number;
}

export interface HistoricalTimeSeriesPoint {
  timestampMs: number;
  txSent: number;
  txConfirmed: number;
  txFailed: number;
  currentTps: number;
  targetTps: number;
  pendingCount: number;
}
