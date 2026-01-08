import type { LoadTestConfig, TransactionRecord } from "./load-test";
import type { BlockMetrics, Statistics, MetricsTimeSeries } from "./metrics";

export interface LoadTestReportMeta {
  testId: string;
  startTime: string; // ISO 8601
  endTime: string;
  duration: number; // seconds
  config: LoadTestConfig;
}

export interface LoadTestReportSummary {
  totalTxSent: number;
  totalTxConfirmed: number;
  totalTxFailed: number;
  peakMgasPerSec: number;
  peakTxPerSec: number;
  averageBlockFillRate: number;
  blocksProduced: number;
  totalGasUsed: string; // bigint as string for JSON
}

export interface LoadTestReport {
  meta: LoadTestReportMeta;
  summary: LoadTestReportSummary;
  latency: Statistics;
  throughput: {
    mgas: Statistics;
    txs: Statistics;
  };
  blockFill: Statistics;
  timeSeries: MetricsTimeSeries;
  rawData: {
    transactions: TransactionRecord[];
    blocks: BlockMetrics[];
  };
}

export function generateTestId(): string {
  return `lt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
