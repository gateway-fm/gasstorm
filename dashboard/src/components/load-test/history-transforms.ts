import type { TestRun, TimeSeriesPoint } from "@/types/load-test";

// Transform Go API PascalCase to TypeScript camelCase for TestRun
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function transformTestRun(run: any): TestRun {
  return {
    id: run?.ID || run?.id || "",
    startedAt: run?.StartedAt || run?.startedAt || "",
    completedAt: run?.CompletedAt || run?.completedAt,
    pattern: run?.Pattern || run?.pattern || "constant",
    transactionType: run?.TransactionType || run?.transactionType || "eth-transfer",
    durationMs: run?.DurationMs || run?.durationMs || 0,
    txSent: run?.TxSent || run?.txSent || 0,
    txConfirmed: run?.TxConfirmed || run?.txConfirmed || 0,
    txFailed: run?.TxFailed || run?.txFailed || 0,
    averageTps: run?.AverageTPS || run?.averageTps || 0,
    peakTps: run?.PeakTPS || run?.peakTps || 0,
    latencyStats: run?.LatencyStats || run?.latencyStats,
    preconfLatency: run?.PreconfLatency || run?.preconfLatency,
    config: run?.Config || run?.config,
    status: run?.Status || run?.status || "completed",
    errorMessage: run?.ErrorMessage || run?.errorMessage,
    txLoggingEnabled: run?.TxLoggingEnabled ?? run?.txLoggingEnabled ?? false,
    executionLayer: run?.ExecutionLayer || run?.executionLayer || "reth",
    // Block metrics (aggregated)
    blockCount: run?.BlockCount || run?.blockCount,
    totalGasUsed: run?.TotalGasUsed || run?.totalGasUsed,
    avgFillRate: run?.AvgFillRate || run?.avgFillRate,
    peakMgasPerSec: run?.PeakMgasPerSec || run?.peakMgasPerSec,
    avgMgasPerSec: run?.AvgMgasPerSec || run?.avgMgasPerSec,
    // User metadata
    customName: run?.CustomName ?? run?.customName,
    isFavorite: run?.IsFavorite ?? run?.isFavorite ?? false,
  };
}

// Transform Go API PascalCase to TypeScript camelCase for TimeSeriesPoint
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function transformTimeSeriesPoint(p: any): TimeSeriesPoint {
  return {
    timestampMs: p?.TimestampMs || p?.timestampMs || 0,
    txSent: p?.TxSent || p?.txSent || 0,
    txConfirmed: p?.TxConfirmed || p?.txConfirmed || 0,
    txFailed: p?.TxFailed || p?.txFailed || 0,
    currentTps: p?.CurrentTPS || p?.currentTps || 0,
    targetTps: p?.TargetTPS || p?.targetTps || 0,
    pendingCount: p?.PendingCount || p?.pendingCount || 0,
    // Block metrics per sample period
    gasUsed: p?.GasUsed || p?.gasUsed,
    gasLimit: p?.GasLimit || p?.gasLimit,
    blockCount: p?.BlockCount || p?.blockCount,
    mgasPerSec: p?.MgasPerSec || p?.mgasPerSec,
    fillRate: p?.FillRate || p?.fillRate,
  };
}
