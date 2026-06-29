export type LoadPattern = "constant" | "ramp" | "spike" | "adaptive" | "realistic" | "adaptive-realistic";

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
  | "erc721-transfer"
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
    id: "erc721-transfer",
    label: "ERC721 Transfer",
    gasEstimate: 90000,
    requiresContract: true,
    description: "NFT transfer (ERC721). Pre-mint tokens during setup, then transfer them under load.",
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
  nft?: string;
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

  // Privacy mode (routes TXs through privacy proxy)
  privacyMode?: boolean;

  // Gasless network: skip account funding and send 0-value transactions.
  // For chains with zero gas fees (eth-transfer only — contract types need a
  // funded deployer).
  gasless?: boolean;

  // Privacy proxy JWT pasted in the UI (PROD: copied from the proxy after login).
  // Delivered to the privacy-token-receiver before Start; optional (empty = use
  // the existing/auto-refreshed token file).
  privacyAuthToken?: string;

  // Nonce gap healing (sends no-op self-transfers to fill gaps during test)
  fixNonceGaps?: boolean;

  // ERC-721 pre-mint count (only used when transactionType === "erc721-transfer").
  // Mints this many NFTs from the deployer during setup before the transfer load
  // test begins. Token IDs are sequential starting from 0. 0 = no pre-mint.
  erc721PreMint?: number;
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

export type LoadTestStatus = "idle" | "initializing" | "running" | "paused" | "verifying" | "completed" | "error";

// Initialization phases during test startup
export type InitPhase =
  | ""
  | "generating_accounts"
  | "funding_accounts"
  | "waiting_for_funding"
  | "initializing_nonces"
  | "deploying_contracts"
  | "starting_workers";

// Verification phases during post-test verification
export type VerifyPhase =
  | ""
  | "on_chain_metrics"
  | "aggregating"
  | "tx_count"
  | "tip_ordering"
  | "receipts";

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

// TX Flow Statistics - tracks transaction journey through stages
export interface TxFlowStats {
  directConfirmed: number; // sent → confirmed (no preconf)
  pendingConfirmed: number; // sent → pending → confirmed
  preconfConfirmed: number; // sent → pending → preconfirmed → confirmed
  droppedRequeued: number; // had dropped/requeued in flow
  revokedFlow: number; // had revoked in flow
  failedFlow: number; // ended in failed
  totalTracked: number; // Total TXs tracked
  avgStageCount: number; // Average stages per TX
}

// Block rejections from builder
export interface BuilderBlockRejections {
  nonceTooLow: number;
  nonceTooHigh: number;
  gasLimitExceeded: number;
  insufficientFunds: number;
  duplicate: number;
  other: number;
}

// Block metrics event from builder's /block-metrics WebSocket
export interface BuilderBlockMetrics {
  blockNumber: number;
  blockHash: string;
  timestamp: number; // Block timestamp (Unix seconds)
  emittedAt: number; // When event was emitted (Unix ms)
  gasUsed: number;
  gasLimit: number;
  txCount: number;
  fillRate: number; // gasUsed/gasLimit * 100
  filterDurationMs: number;
  engineApiDurationMs: number;
  fcuDurationMs: number;
  getPayloadDurationMs: number;
  totalBuildDurationMs: number;
  rejections: BuilderBlockRejections;
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
  txDiscarded?: number; // Transactions still pending at test end (discarded)
  averageTps: number;
  peakTps?: number;
  latency?: LatencyStats;
  preconfLatency?: LatencyStats;
  flowStats?: TxFlowStats; // TX flow tracking stats
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
    privacyMode?: boolean;
  };
  environment?: EnvironmentSnapshot;
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
  privacyMode: false,
  privacyAuthToken: "",
  gasless: false,
  fixNonceGaps: false,
  erc721PreMint: 1000,
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
  status: "pending" | "confirmed" | "failed" | "discarded";
  errorReason?: string;
  fromAccount: number;
  nonce: number;
  gasTipGwei?: number;
}

// Execution layer type
export type ExecutionLayer = "reth" | "cdk-erigon" | "gravity-reth";

// TX ordering mode from block builder
export type TxOrdering = "fifo" | "tip_desc" | "tip_asc";

// Environment snapshot captures builder and load-gen config at test start
export interface EnvironmentSnapshot {
  // Block builder config (from /status)
  builderBlockTimeMs: number;
  builderGasLimit: number;
  builderMaxTxsPerBlock: number;
  builderTxOrdering: TxOrdering;
  builderEnablePreconfs: boolean;
  builderSkipEmptyBlocks: boolean;
  builderIncludeDepositTx?: boolean;
  builderBlockAttestationEnabled?: boolean;
  builderHsmProvider?: string;
  builderHsmKeyIdActive?: string;
  builderHsmFailoverEnabled?: boolean;
  // Load generator config
  loadGenGasTipCapGwei: number;
  loadGenGasFeeCapGwei: number;
  loadGenExecutionLayer: ExecutionLayer;
  // Node identification (for test reproducibility and comparison)
  nodeName: string;        // "op-reth", "gravity-reth", "cdk-erigon"
  nodeVersion: string;     // e.g., "reth/v1.9.3-op/...", "erigon/..."
  nodeImage?: string;      // Docker image used (if available)
  chainId: number;         // Chain ID from eth_chainId
  useBlockBuilder: boolean; // true if external block builder, false for internal sequencer
}

// Single ordering violation in a block
export interface OrderingViolation {
  blockNumber: number;
  txIndex: number;
  expectedTip: number; // Tip at index-1
  actualTip: number;
}

// Per-block tip analysis
export interface BlockTipAnalysis {
  blockNumber: number;
  txCount: number;
  tips: number[]; // First 10 tips for inspection
  isOrdered: boolean;
}

// Tip ordering verification result
export interface TipOrderingResult {
  verified: boolean;
  totalBlocks: number;
  blocksSampled: number;
  correctlyOrdered: number;
  violationCount: number; // Total violations (works for both incremental and non-incremental modes)
  orderingViolations?: OrderingViolation[]; // Detailed violations (may be empty in incremental mode)
  sampleBlocks?: BlockTipAnalysis[];
}

// Individual TX receipt sample
export interface TxReceiptSample {
  txHash: string;
  blockNumber: number;
  gasUsed: number;
  status: number; // 1=success, 0=revert
  effectiveGasPrice: number;
}

// TX receipt verification result
export interface TxReceiptVerification {
  sampleSize: number;
  successCount: number;
  revertCount: number;
  avgGasUsed: number;
  minGasUsed: number;
  maxGasUsed: number;
  totalGasVerified: number;
  samples?: TxReceiptSample[]; // First 10 for inspection
  revertedTxs?: TxReceiptSample[]; // All reverted TXs (up to 100)
}

// Header attestation signature for a finalized block
export interface HeaderAttestation {
  schemaVersion?: number;
  status?: "signed" | "failed" | string;
  blockNumber: number;
  blockHash?: string;
  parentHash?: string;
  stateRoot?: string;
  receiptsRoot?: string;
  timestamp?: number;
  gasUsed?: number;
  baseFeeWei?: string;
  sequencer?: string;
  digestHex?: string;
  signatureHex?: string;
  rHex?: string;
  sHex?: string;
  v?: number;
  keyId?: string;
  provider?: string;
  failover?: boolean;
  error?: string;
  signedAt?: string;
}

// Overall verification result
export interface VerificationResult {
  // On-chain metrics comparison
  metricsMatch: boolean;
  txCountDelta: number; // OnChain - Confirmed
  gasUsedDelta: number;
  // Tip ordering verification (if tip_desc or tip_asc)
  tipOrdering?: TipOrderingResult;
  // TX receipt sampling
  txReceipts?: TxReceiptVerification;
  // Summary
  allChecksPass: boolean;
  warnings?: string[];
  // Header attestation signatures (HSM / block attestation)
  headerAttestationExpected?: number;
  headerAttestationFound?: number;
  headerAttestations?: HeaderAttestation[];
}

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
  txDiscarded?: number; // Transactions still pending at test end (discarded)
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
  // User-defined metadata
  customName?: string;
  isFavorite: boolean;
  // Realistic test specific metrics
  tipHistogram?: TipHistogramBucket[];
  txTypeMetrics?: TxTypeMetrics[];
  pendingLatency?: LatencyStats;
  accountsActive?: number;
  accountsFunded?: number;
  // TX flow tracking stats
  flowStats?: TxFlowStats;
  // On-chain verification metrics (actual chain state after test)
  onChainFirstBlock?: number;
  onChainLastBlock?: number;
  onChainTxCount?: number;
  onChainGasUsed?: number;
  onChainMgasPerSec?: number;
  onChainTps?: number;
  onChainDurationSecs?: number;
  // Environment snapshot (builder + load-gen config at test start)
  environment?: EnvironmentSnapshot;
  // Verification results (post-test chain analysis)
  verification?: VerificationResult;
  // Deployed contracts info
  deployedContracts?: DeployedContractInfo[];
  // Test accounts info
  testAccounts?: TestAccountsInfo;
}

// Deployed contract information
export interface DeployedContractInfo {
  name: string;
  address: string;
}

// Account role in the test
export type AccountRole = "deployer" | "funder" | "funded" | "built-in";

// Individual account with its role
export interface AccountInfo {
  address: string;
  role: AccountRole;
  index: number; // Index within its category
}

// Test accounts information
export interface TestAccountsInfo {
  totalCount: number;
  dynamicCount: number;
  fundedCount: number;
  funderAddress: string;
  accounts?: string[]; // Legacy: Limited to first 100
  allAccounts?: AccountInfo[]; // All accounts with their roles
}

// Update request for test run metadata
export interface TestRunMetadataUpdate {
  customName?: string;
  isFavorite?: boolean;
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
