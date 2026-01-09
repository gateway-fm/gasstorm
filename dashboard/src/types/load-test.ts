export type LoadPattern = "constant" | "ramp" | "spike" | "adaptive" | "realistic";

export type TipDistribution = "exponential" | "power-law" | "uniform";

export interface TxTypeRatios {
  ethTransfer: number;
  erc20Transfer: number;
  erc20Approve: number;
  uniswapSwap: number;
  storageWrite: number;
  heavyCompute: number;
}

export interface RealisticTestConfig {
  numAccounts: number;
  targetTps: number;
  minTipGwei: number;
  maxTipGwei: number;
  tipDistribution: TipDistribution;
  txTypeRatios: TxTypeRatios;
}

export interface TipHistogramBucket {
  minGwei: number;
  maxGwei: number;
  count: number;
}

export interface TxTypeMetrics {
  type: TransactionType;
  sent: number;
  confirmed: number;
  failed: number;
  avgTipGwei: number;
}

export type TransactionType =
  | "eth-transfer"
  | "erc20-transfer"
  | "erc20-approve"
  | "uniswap-swap"
  | "storage-write"
  | "heavy-compute";

export interface TransactionTypeInfo {
  id: TransactionType;
  label: string;
  gasEstimate: number;
  requiresContract: boolean;
  description: string;
}

export const TRANSACTION_TYPES: TransactionTypeInfo[] = [
  {
    id: "eth-transfer",
    label: "ETH Transfer",
    gasEstimate: 21000,
    requiresContract: false,
    description: "Simple native ETH transfer",
  },
  {
    id: "erc20-transfer",
    label: "ERC20 Transfer",
    gasEstimate: 65000,
    requiresContract: true,
    description: "Token transfer (ERC20)",
  },
  {
    id: "erc20-approve",
    label: "ERC20 Approve",
    gasEstimate: 46000,
    requiresContract: true,
    description: "Token approval (ERC20)",
  },
  {
    id: "uniswap-swap",
    label: "Uniswap Swap",
    gasEstimate: 150000,
    requiresContract: true,
    description: "DEX-style token swap",
  },
  {
    id: "storage-write",
    label: "Storage Write",
    gasEstimate: 43000,
    requiresContract: true,
    description: "Write to contract storage",
  },
  {
    id: "heavy-compute",
    label: "Heavy Compute",
    gasEstimate: 500000,
    requiresContract: true,
    description: "Keccak256 loops (configurable gas)",
  },
];

export interface DeployedContracts {
  erc20?: string;
  simpleSwap?: string;
  gasConsumer?: string;
  deployedAt?: number;
}

export interface LoadTestConfig {
  pattern: LoadPattern;
  duration: number; // seconds
  transactionType: TransactionType;

  // Constant rate
  constantRate?: number; // tx/s

  // Ramp pattern
  rampStart?: number; // starting tx/s
  rampEnd?: number; // ending tx/s
  rampSteps?: number; // number of steps

  // Spike pattern
  baselineRate?: number; // normal tx/s
  spikeRate?: number; // burst tx/s
  spikeDuration?: number; // seconds
  spikeInterval?: number; // seconds between spikes

  // Adaptive mode pattern
  adaptiveInitialRate?: number; // starting tx/s (default: 10)
  adaptiveTargetPending?: number; // target pending tx count (default: 50)
  adaptiveRateStep?: number; // rate adjustment step (default: 5)

  // Realistic mode pattern
  realisticConfig?: RealisticTestConfig;

  // Common
  txValue?: bigint; // wei per tx (default 1 ETH)
  gasLimit?: number; // gas limit per tx (default 21000)

  // Builder configuration (fetched from builder status)
  blockTimeMs?: number; // target block time from builder
}

export type TransactionStatus = "pending" | "confirmed" | "failed";

export interface TransactionRecord {
  txHash: string;
  nonce: number;
  submittedAt: number; // Unix timestamp ms
  submittedAtBlock: number; // L2 block when submitted
  confirmedAt?: number; // Unix timestamp ms
  confirmedInBlock?: number; // L2 block when confirmed
  gasUsed?: bigint;
  status: TransactionStatus;
}

export type LoadTestStatus = "idle" | "running" | "paused" | "completed" | "error";

export interface LoadTestState {
  status: LoadTestStatus;
  config: LoadTestConfig | null;
  startTime: number | null;
  elapsedTime: number;
  transactions: TransactionRecord[];
  currentRate: number; // current tx/s target
  txSentCount: number;
  txConfirmedCount: number;
  txFailedCount: number;
  error: string | null;
}

export type VerificationStatus = "idle" | "verifying" | "completed" | "error";

export interface CorrectnessResult {
  totalSent: number;
  onChainConfirmed: number;
  onChainFailed: number;
  missing: number;
  nonceGaps: number[];
  missingTxHashes: string[];
  verified: boolean;
  verifiedAt: number; // timestamp
}

export const DEFAULT_REALISTIC_CONFIG: RealisticTestConfig = {
  numAccounts: 100,
  targetTps: 500,
  minTipGwei: 0,
  maxTipGwei: 10,
  tipDistribution: "exponential",
  txTypeRatios: {
    ethTransfer: 50,
    erc20Transfer: 20,
    erc20Approve: 5,
    uniswapSwap: 15,
    storageWrite: 5,
    heavyCompute: 5,
  },
};

// Latency statistics from Go load generator
export interface LatencyStats {
  count: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  buckets: { label: string; count: number }[];
}

// Test result from history
export interface TestResult {
  id: string;
  startedAt: string;
  completedAt: string;
  pattern: LoadPattern;
  transactionType: TransactionType;
  durationMs: number;
  txSent: number;
  txConfirmed: number;
  txFailed: number;
  averageTps: number;
  peakTps?: number;
  latency?: LatencyStats;
  preconfLatency?: LatencyStats;
  config: {
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
}

export const DEFAULT_LOAD_TEST_CONFIG: LoadTestConfig = {
  pattern: "constant",
  duration: 60,
  transactionType: "eth-transfer",
  constantRate: 100,
  rampStart: 100,
  rampEnd: 5000,
  rampSteps: 10,
  baselineRate: 100,
  spikeRate: 5000,
  spikeDuration: 5,
  spikeInterval: 15,
  adaptiveInitialRate: 100,
  adaptiveTargetPending: 1000,
  adaptiveRateStep: 100,
  realisticConfig: DEFAULT_REALISTIC_CONFIG,
  txValue: 1000000000000000000n, // 1 ETH
  gasLimit: 21000,
};

// Time-series point from persistent storage
export interface TimeSeriesPoint {
  timestampMs: number; // Milliseconds since test start
  txSent: number;
  txConfirmed: number;
  txFailed: number;
  currentTps: number;
  targetTps: number;
  pendingCount: number;
  // Block metrics (from L2 newHeads subscription)
  gasUsed?: number;
  gasLimit?: number;
  blockCount?: number;
  mgasPerSec?: number;
  fillRate?: number;
}

// Transaction log entry from persistent storage
export interface TransactionLogEntry {
  txHash: string;
  sentAtMs: number;
  confirmedAtMs?: number;
  preconfAtMs?: number;
  confirmLatencyMs?: number;
  preconfLatencyMs?: number;
  status: "pending" | "confirmed" | "failed";
  errorReason?: string;
  fromAccount: number;
  nonce: number;
  gasTipGwei?: number;
}

// Execution layer type
export type ExecutionLayer = "reth" | "cdk-erigon";

// Test run from persistent storage (enhanced version of TestResult)
export interface TestRun {
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
  config?: TestResult["config"];
  status: "running" | "completed" | "error";
  errorMessage?: string;
  txLoggingEnabled: boolean;
  executionLayer: ExecutionLayer; // "reth" or "cdk-erigon"
  // Block metrics (aggregated from time series)
  blockCount?: number;
  totalGasUsed?: number;
  avgFillRate?: number;
  peakMgasPerSec?: number;
  avgMgasPerSec?: number;
}

// Test run with time-series detail
export interface TestRunDetail {
  run: TestRun;
  timeSeries: TimeSeriesPoint[];
}

// Paginated responses
export interface PaginatedTestRuns {
  runs: TestRun[];
  total: number;
  limit: number;
  offset: number;
}

export interface PaginatedTxLogs {
  transactions: TransactionLogEntry[];
  total: number;
  limit: number;
  offset: number;
}
