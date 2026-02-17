import type { TestRun, TimeSeriesPoint } from "@/types/load-test";

// Normalize latency stats regardless of PascalCase/camelCase payload shape
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformLatencyStats(stats: any) {
  if (!stats) return undefined;
  const buckets = stats.Buckets || stats.buckets;
  return {
    count: stats.Count ?? stats.count ?? 0,
    min: stats.Min ?? stats.min ?? 0,
    max: stats.Max ?? stats.max ?? 0,
    avg: stats.Avg ?? stats.avg ?? 0,
    p50: stats.P50 ?? stats.p50 ?? 0,
    p75: stats.P75 ?? stats.p75 ?? 0,
    p90: stats.P90 ?? stats.p90 ?? 0,
    p95: stats.P95 ?? stats.p95 ?? 0,
    p99: stats.P99 ?? stats.p99 ?? 0,
    buckets: Array.isArray(buckets)
      ? buckets.map((b: { Label?: string; label?: string; Count?: number; count?: number }) => ({
          label: b?.Label || b?.label || "",
          count: b?.Count ?? b?.count ?? 0,
        }))
      : [],
  };
}

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
    latencyStats: transformLatencyStats(run?.LatencyStats || run?.latencyStats),
    preconfLatency: transformLatencyStats(run?.PreconfLatency || run?.preconfLatency),
    pendingLatency: transformLatencyStats(run?.PendingLatency || run?.pendingLatency),
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
    environment: run?.Environment || run?.environment,
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
