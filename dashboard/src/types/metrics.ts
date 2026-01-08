export interface BlockMetrics {
  blockNumber: number;
  timestamp: number;
  arrivedAt: number; // milliseconds (Date.now()) when block was received
  gasUsed: bigint;
  gasLimit: bigint;
  transactionCount: number;
  blockTime: number; // seconds since previous block (calculated from arrivedAt)
  mgasPerSec: number; // million gas per second
  txPerSec: number; // transactions per second
  fillRate: number; // percentage 0-100
}

export interface Statistics {
  min: number;
  max: number;
  mean: number;
  median: number; // p50
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  stdDev: number;
  count: number;
}

export interface MetricsTimeSeries {
  timestamps: number[];
  mgasPerSec: number[];
  txPerSec: number[];
  blockFillRate: number[];
  latencies: number[];
  blockTimes: number[]; // block time in milliseconds
}

export interface MetricsSnapshot {
  currentMgasPerSec: number;
  currentTxPerSec: number;
  currentFillRate: number;
  peakMgasPerSec: number;
  peakTxPerSec: number;
  averageFillRate: number;
  totalGasUsed: bigint;
  totalTransactions: number;
  blocksProduced: number;
  // Block time stats (milliseconds)
  currentBlockTimeMs: number;
  avgBlockTimeMs: number;
  minBlockTimeMs: number;
  maxBlockTimeMs: number;
}
