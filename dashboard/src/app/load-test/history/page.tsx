"use client";

import { Suspense, useEffect, useState, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TestHistory } from "@/components/load-test/test-history";
import { HistoryHeader } from "@/components/load-test/history-header";
import { RealTimeChart } from "@/components/metrics/real-time-chart";
import { MetricsSnapshot } from "@/components/metrics/metrics-snapshot";
import { LatencyHistogram } from "@/components/metrics/latency-histogram";
import { TipHistogram } from "@/components/metrics/tip-histogram";
import { TxTypeBreakdown } from "@/components/metrics/tx-type-breakdown";
import { OnChainMetrics } from "@/components/metrics/on-chain-metrics";
import { VerificationDetails } from "@/components/metrics/verification-details";
import { ContractsAccounts } from "@/components/metrics/contracts-accounts";
import { PercentileTable } from "@/components/reports/percentile-table";
import { VerificationSummary } from "@/components/reports/verification-summary";
import { useGoLoadTestStore } from "@/stores/go-load-test-store";
import { useMetricsStore } from "@/stores/metrics-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, RefreshCw, AlertCircle } from "lucide-react";
import type { TestRun, TestRunDetail, TimeSeriesPoint } from "@/types/load-test";
import type { Statistics } from "@/types/metrics";
import { calculateStatistics } from "@/lib/statistics";

const LOAD_GEN_API = "/api/loadgen";

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
    // Realistic test specific metrics
    tipHistogram: run?.TipHistogram || run?.tipHistogram,
    txTypeMetrics: run?.TxTypeMetrics || run?.txTypeMetrics,
    pendingLatency: run?.PendingLatency || run?.pendingLatency,
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

// Detail view component
function HistoryDetailView({ testId }: { testId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testRun, setTestRun] = useState<TestRun | null>(null);

  const hydrateGoStore = useGoLoadTestStore((s) => s.hydrateFromHistory);
  const hydrateMetricsStore = useMetricsStore((s) => s.hydrateFromHistory);
  const resetGoStore = useGoLoadTestStore((s) => s.reset);
  const resetMetricsStore = useMetricsStore((s) => s.reset);

  const goLatencyStats = useGoLoadTestStore((s) => s.latencyStats);
  const goPreconfLatencyStats = useGoLoadTestStore((s) => s.preconfLatencyStats);
  const metricsTimeSeries = useMetricsStore((s) => s.timeSeries);

  const stats = useMemo(() => {
    const latencyStats: Statistics = goLatencyStats
      ? {
          min: goLatencyStats.min,
          max: goLatencyStats.max,
          mean: goLatencyStats.avg,
          median: goLatencyStats.p50,
          p75: goLatencyStats.p75,
          p90: goLatencyStats.p90,
          p95: goLatencyStats.p95,
          p99: goLatencyStats.p99,
          stdDev: 0,
          count: goLatencyStats.count,
        }
      : { min: 0, max: 0, mean: 0, median: 0, p75: 0, p90: 0, p95: 0, p99: 0, stdDev: 0, count: 0 };

    const preconfLatencyStats: Statistics = goPreconfLatencyStats
      ? {
          min: goPreconfLatencyStats.min,
          max: goPreconfLatencyStats.max,
          mean: goPreconfLatencyStats.avg,
          median: goPreconfLatencyStats.p50,
          p75: goPreconfLatencyStats.p75,
          p90: goPreconfLatencyStats.p90,
          p95: goPreconfLatencyStats.p95,
          p99: goPreconfLatencyStats.p99,
          stdDev: 0,
          count: goPreconfLatencyStats.count,
        }
      : { min: 0, max: 0, mean: 0, median: 0, p75: 0, p90: 0, p95: 0, p99: 0, stdDev: 0, count: 0 };

    const mgasStats = calculateStatistics(metricsTimeSeries.mgasPerSec);
    const txsStats = calculateStatistics(metricsTimeSeries.txPerSec);
    const fillStats = calculateStatistics(metricsTimeSeries.blockFillRate);

    return { latencyStats, preconfLatencyStats, mgasStats, txsStats, fillStats };
  }, [goLatencyStats, goPreconfLatencyStats, metricsTimeSeries]);

  useEffect(() => {
    async function loadTestData() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`${LOAD_GEN_API}/history/${testId}`);
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error("Test not found");
          }
          throw new Error(`Failed to load test: ${response.statusText}`);
        }

        const rawData = await response.json();
        const data = transformApiResponse(rawData);
        setTestRun(data.run);

        hydrateGoStore(data.run, data.timeSeries || []);
        hydrateMetricsStore(data.run, data.timeSeries || []);

        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load test");
        setLoading(false);
      }
    }

    loadTestData();

    return () => {
      resetGoStore();
      resetMetricsStore();
    };
  }, [testId, hydrateGoStore, hydrateMetricsStore, resetGoStore, resetMetricsStore]);

  const handleBack = useCallback(() => {
    router.push("/load-test/history");
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !testRun) {
    return (
      <Card className="max-w-md mx-auto">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <div>
              <h2 className="text-lg font-semibold">Error Loading Test</h2>
              <p className="text-sm text-muted-foreground mt-1">{error || "Test not found"}</p>
            </div>
            <Button onClick={handleBack} variant="outline" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to History
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="mb-6">
        <HistoryHeader testRun={testRun} onBack={handleBack} />
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <RealTimeChart />
        <MetricsSnapshot />
      </div>

      <div className="mb-6">
        <VerificationSummary />
      </div>

      {testRun && (
        <div className="mb-6">
          <OnChainMetrics testRun={testRun} />
        </div>
      )}

      {testRun && (testRun.environment || testRun.verification) && (
        <div className="mb-6">
          <VerificationDetails testRun={testRun} />
        </div>
      )}

      {testRun && (testRun.deployedContracts?.length || testRun.testAccounts) && (
        <div className="mb-6">
          <ContractsAccounts testRun={testRun} />
        </div>
      )}

      <div className="mb-6">
        <LatencyHistogram />
      </div>

      {(testRun?.pattern === "realistic" || testRun?.pattern === "adaptive-realistic") && (
        <div className="grid gap-4 md:grid-cols-2 mb-6">
          <TipHistogram />
          <TxTypeBreakdown />
        </div>
      )}

      <div className="mb-6">
        <PercentileTable
          latencyStats={stats.latencyStats}
          preconfLatencyStats={stats.preconfLatencyStats}
          mgasStats={stats.mgasStats}
          txsStats={stats.txsStats}
          fillStats={stats.fillStats}
        />
      </div>
    </>
  );
}

// List view component
function HistoryListView() {
  return (
    <>
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold">Test History</h1>
      </div>

      <TestHistory fullPage />
    </>
  );
}

// Content component that uses useSearchParams
function HistoryPageContent() {
  const searchParams = useSearchParams();
  const testId = searchParams.get("id");

  return (
    <main className="container mx-auto px-4 py-6">
      {testId ? <HistoryDetailView testId={testId} /> : <HistoryListView />}
    </main>
  );
}

// Main page component with Suspense boundary
export default function HistoryPage() {
  return (
    <div className="min-h-screen bg-background">
      <Suspense fallback={
        <main className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </main>
      }>
        <HistoryPageContent />
      </Suspense>
    </div>
  );
}
