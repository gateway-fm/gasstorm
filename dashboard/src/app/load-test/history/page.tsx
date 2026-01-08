"use client";

import { Suspense, useEffect, useState, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Header } from "@/components/layout/header";
import { TestHistory } from "@/components/load-test/test-history";
import { HistoryHeader } from "@/components/load-test/history-header";
import { RealTimeChart } from "@/components/metrics/real-time-chart";
import { MetricsSnapshot } from "@/components/metrics/metrics-snapshot";
import { LatencyHistogram } from "@/components/metrics/latency-histogram";
import { TipHistogram } from "@/components/metrics/tip-histogram";
import { TxTypeBreakdown } from "@/components/metrics/tx-type-breakdown";
import { PercentileTable } from "@/components/reports/percentile-table";
import { VerificationSummary } from "@/components/reports/verification-summary";
import { useGoLoadTestStore } from "@/stores/go-load-test-store";
import { useMetricsStore } from "@/stores/metrics-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, RefreshCw, AlertCircle } from "lucide-react";
import type { TestRun, TestRunDetail } from "@/types/load-test";
import type { Statistics } from "@/types/metrics";
import { calculateStatistics } from "@/lib/statistics";

const LOAD_GEN_API = "/api/loadgen";

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

        const data: TestRunDetail = await response.json();
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

      <div className="mb-6">
        <LatencyHistogram />
      </div>

      {testRun.pattern === "stress" && (
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
  const router = useRouter();

  return (
    <>
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.push("/load-test")} className="gap-2 -ml-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Load Test
        </Button>
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
      <Header l1WsConnected={false} l2WsConnected={false} loadGenWsConnected={false} />

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
