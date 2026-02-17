"use client";

import { useState, useEffect, useCallback } from "react";
import type { TestRun, TestRunDetail, TimeSeriesPoint } from "@/types/load-test";

const LOAD_GEN_API = "/api/loadgen";

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

// Transform Go API PascalCase response to TypeScript camelCase
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformApiResponse(data: any): TestRunDetail {
  const run = data.Run || data.run;
  const timeSeries = data.TimeSeries || data.timeSeries || [];

  // Transform TestRun from PascalCase to camelCase
  const transformedRun: TestRun = {
    id: run?.ID || run?.id || "",
    startedAt: run?.StartedAt || run?.startedAt || "",
    completedAt: run?.CompletedAt || run?.completedAt,
    pattern: run?.Pattern || run?.pattern || "constant",
    transactionType: run?.TransactionType || run?.transactionType || "eth-transfer",
    durationMs: run?.DurationMs || run?.durationMs || 0,
    txSent: run?.TxSent || run?.txSent || 0,
    txConfirmed: run?.TxConfirmed || run?.txConfirmed || 0,
    txFailed: run?.TxFailed || run?.txFailed || 0,
    txDiscarded: run?.TxDiscarded || run?.txDiscarded || 0,
    averageTps: run?.AverageTPS || run?.averageTps || 0,
    peakTps: run?.PeakTPS || run?.peakTps || 0,
    latencyStats: transformLatencyStats(run?.LatencyStats || run?.latencyStats),
    preconfLatency: transformLatencyStats(run?.PreconfLatency || run?.preconfLatency),
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
    // Realistic test specific metrics
    tipHistogram: run?.TipHistogram || run?.tipHistogram,
    txTypeMetrics: run?.TxTypeMetrics || run?.txTypeMetrics,
    pendingLatency: transformLatencyStats(run?.PendingLatency || run?.pendingLatency),
    accountsActive: run?.AccountsActive || run?.accountsActive,
    accountsFunded: run?.AccountsFunded || run?.accountsFunded,
    // On-chain verification metrics
    onChainFirstBlock: run?.OnChainFirstBlock || run?.onChainFirstBlock,
    onChainLastBlock: run?.OnChainLastBlock || run?.onChainLastBlock,
    onChainTxCount: run?.OnChainTxCount || run?.onChainTxCount,
    onChainGasUsed: run?.OnChainGasUsed || run?.onChainGasUsed,
    onChainMgasPerSec: run?.OnChainMgasPerSec || run?.onChainMgasPerSec,
    onChainTps: run?.OnChainTps || run?.onChainTps,
    onChainDurationSecs: run?.OnChainDurationSecs || run?.onChainDurationSecs,
    // Environment snapshot and verification results
    environment: run?.Environment || run?.environment,
    verification: run?.Verification || run?.verification,
    // Deployed contracts and accounts
    deployedContracts: run?.DeployedContracts || run?.deployedContracts,
    testAccounts: run?.TestAccounts || run?.testAccounts,
  };

  // Transform TimeSeriesPoint[] from PascalCase to camelCase
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transformedTimeSeries: TimeSeriesPoint[] = timeSeries.map((p: any) => ({
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
  }));

  return {
    run: transformedRun,
    timeSeries: transformedTimeSeries,
  };
}

interface UseComparisonResult {
  testA: TestRun | null;
  testB: TestRun | null;
  timeSeriesA: TimeSeriesPoint[];
  timeSeriesB: TimeSeriesPoint[];
  loading: boolean;
  error: string | null;
  swap: () => void;
}

export function useComparison(leftId: string | null, rightId: string | null): UseComparisonResult {
  const [testA, setTestA] = useState<TestRun | null>(null);
  const [testB, setTestB] = useState<TestRun | null>(null);
  const [timeSeriesA, setTimeSeriesA] = useState<TimeSeriesPoint[]>([]);
  const [timeSeriesB, setTimeSeriesB] = useState<TimeSeriesPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [swapped, setSwapped] = useState(false);

  useEffect(() => {
    async function fetchBothTests() {
      if (!leftId || !rightId) {
        setError("Two test IDs are required for comparison");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const [leftResponse, rightResponse] = await Promise.all([
          fetch(`${LOAD_GEN_API}/history/${leftId}`),
          fetch(`${LOAD_GEN_API}/history/${rightId}`),
        ]);

        if (!leftResponse.ok) {
          throw new Error(`Failed to load test A: ${leftResponse.statusText}`);
        }
        if (!rightResponse.ok) {
          throw new Error(`Failed to load test B: ${rightResponse.statusText}`);
        }

        const [leftData, rightData] = await Promise.all([
          leftResponse.json(),
          rightResponse.json(),
        ]);

        const transformedLeft = transformApiResponse(leftData);
        const transformedRight = transformApiResponse(rightData);

        setTestA(transformedLeft.run);
        setTestB(transformedRight.run);
        setTimeSeriesA(transformedLeft.timeSeries);
        setTimeSeriesB(transformedRight.timeSeries);
        setSwapped(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load tests");
      } finally {
        setLoading(false);
      }
    }

    fetchBothTests();
  }, [leftId, rightId]);

  const swap = useCallback(() => {
    setSwapped((prev) => !prev);
  }, []);

  // Return swapped values if swapped
  if (swapped) {
    return {
      testA: testB,
      testB: testA,
      timeSeriesA: timeSeriesB,
      timeSeriesB: timeSeriesA,
      loading,
      error,
      swap,
    };
  }

  return {
    testA,
    testB,
    timeSeriesA,
    timeSeriesB,
    loading,
    error,
    swap,
  };
}
