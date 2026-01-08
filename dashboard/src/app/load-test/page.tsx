"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { Header } from "@/components/layout/header";
import { LoadTestConfig } from "@/components/load-test/load-test-config";
import { LoadTestRunner } from "@/components/load-test/load-test-runner";
import { TestHistory } from "@/components/load-test/test-history";
import { RealTimeChart } from "@/components/metrics/real-time-chart";
import { LatencyHistogram } from "@/components/metrics/latency-histogram";
import { MetricsSnapshot } from "@/components/metrics/metrics-snapshot";
import { BottleneckAnalysis } from "@/components/metrics/bottleneck-analysis";
import { TipHistogram } from "@/components/metrics/tip-histogram";
import { TxTypeBreakdown } from "@/components/metrics/tx-type-breakdown";
import { PercentileTable } from "@/components/reports/percentile-table";
import { ExportControls } from "@/components/reports/export-controls";
import { VerificationSummary } from "@/components/reports/verification-summary";
import { useL1WebSocket, useL2WebSocket } from "@/hooks/use-websocket";
import { useGoLoadTestStore } from "@/stores/go-load-test-store";
import { useMetricsStore } from "@/stores/metrics-store";
import { useChainStore } from "@/stores/chain-store";
import { l2 } from "@/lib/rpc-client";
import type { BlockMetrics, Statistics } from "@/types/metrics";
import { calculateStatistics } from "@/lib/statistics";
import Link from "next/link";

export default function LoadTestPage() {
  const { status, checkAndReconnect, latencyStats: goLatencyStats, preconfLatencyStats: goPreconfLatencyStats, wsConnected: loadGenWsConnected } = useGoLoadTestStore();
  const { addBlockMetrics, timeSeries } = useMetricsStore();
  const { builder } = useChainStore();
  const prevStatusRef = useRef(status);
  // Track previous block arrival time in a ref to avoid stale closure issues
  const lastBlockArrivalRef = useRef<number | null>(null);

  // On mount, check if a test is already running and reconnect to it
  useEffect(() => {
    checkAndReconnect();
  }, [checkAndReconnect]);

  // Track status changes (Go load generator handles verification internally)
  useEffect(() => {
    // Reset block arrival tracking when test ends (to avoid stale timing on next test)
    if (status === "idle" && prevStatusRef.current !== "idle") {
      lastBlockArrivalRef.current = null;
    }
    prevStatusRef.current = status;
  }, [status]);

  // Calculate statistics for the report table
  // Latency stats come from Go load generator, others from block metrics
  const stats = useMemo(() => {
    // Convert Go latency stats to our Statistics format
    const latencyStats: Statistics = goLatencyStats ? {
      min: goLatencyStats.min,
      max: goLatencyStats.max,
      mean: goLatencyStats.avg,
      median: goLatencyStats.p50,
      p75: goLatencyStats.p75,
      p90: goLatencyStats.p90,
      p95: goLatencyStats.p95,
      p99: goLatencyStats.p99,
      stdDev: 0, // Not provided by Go
      count: goLatencyStats.count,
    } : {
      min: 0, max: 0, mean: 0, median: 0, p75: 0, p90: 0, p95: 0, p99: 0, stdDev: 0, count: 0,
    };

    // Convert Go preconf latency stats to our Statistics format
    const preconfLatencyStats: Statistics = goPreconfLatencyStats ? {
      min: goPreconfLatencyStats.min,
      max: goPreconfLatencyStats.max,
      mean: goPreconfLatencyStats.avg,
      median: goPreconfLatencyStats.p50,
      p75: goPreconfLatencyStats.p75,
      p90: goPreconfLatencyStats.p90,
      p95: goPreconfLatencyStats.p95,
      p99: goPreconfLatencyStats.p99,
      stdDev: 0, // Not provided by Go
      count: goPreconfLatencyStats.count,
    } : {
      min: 0, max: 0, mean: 0, median: 0, p75: 0, p90: 0, p95: 0, p99: 0, stdDev: 0, count: 0,
    };

    const mgasStats = calculateStatistics(timeSeries.mgasPerSec);
    const txsStats = calculateStatistics(timeSeries.txPerSec);
    const fillStats = calculateStatistics(timeSeries.blockFillRate);
    return { latencyStats, preconfLatencyStats, mgasStats, txsStats, fillStats };
  }, [goLatencyStats, goPreconfLatencyStats, timeSeries]);

  // Handle new L2 block - collect metrics and check for TX confirmations
  const handleL2NewHead = useCallback(
    async (head: { number: string; hash: string; timestamp: string; gasUsed: string; gasLimit: string }) => {
      const blockNum = parseInt(head.number, 16);

      // Get full block data
      try {
        const block = await l2.getBlockByNumber(blockNum);
        if (!block) return;

        const arrivedAt = Date.now();
        const gasUsed = BigInt(block.gasUsed);
        const gasLimit = BigInt(block.gasLimit);
        const timestamp = parseInt(block.timestamp, 16);
        const txCount = block.transactions.length;

        // Calculate time since last block using ref to avoid stale closure
        // Use arrival timestamps (ms precision) since block timestamps are seconds
        const prevArrival = lastBlockArrivalRef.current;
        // Use configured block time as fallback for first block
        const blockTimeMs = prevArrival !== null ? arrivedAt - prevArrival : (builder.blockTimeMs || 2000);
        const blockTime = blockTimeMs / 1000; // Convert to seconds

        // Update ref for next block
        lastBlockArrivalRef.current = arrivedAt;

        // Calculate metrics (blockTime is now in seconds with ms precision)
        const mgasPerSec = blockTime > 0 ? Number(gasUsed) / 1_000_000 / blockTime : 0;
        const txPerSec = blockTime > 0 ? txCount / blockTime : 0;
        const fillRate = Number(gasUsed) / Number(gasLimit) * 100;

        const metrics: BlockMetrics = {
          blockNumber: blockNum,
          timestamp,
          arrivedAt,
          gasUsed,
          gasLimit,
          transactionCount: txCount,
          blockTime,
          mgasPerSec,
          txPerSec,
          fillRate,
        };

        addBlockMetrics(metrics);

        // Note: Transaction confirmation tracking is handled by the Go load generator
        // The metrics store receives block data for charts via addBlockMetrics above
      } catch (error) {
        console.error("Failed to fetch block:", error);
      }
    },
    [addBlockMetrics, builder.blockTimeMs]
  );

  const { isConnected: l1WsConnected } = useL1WebSocket();
  const { isConnected: l2WsConnected } = useL2WebSocket(handleL2NewHead);

  return (
    <div className="min-h-screen bg-background">
      <Header l1WsConnected={l1WsConnected} l2WsConnected={l2WsConnected} loadGenWsConnected={loadGenWsConnected} />

      <main className="container mx-auto px-4 py-6">
        {/* Configuration and Runner */}
        <div className="grid gap-4 md:grid-cols-2 mb-6">
          <LoadTestConfig />
          <LoadTestRunner />
        </div>

        {/* Bottleneck Analysis - Always visible during/after test */}
        {(status === "running" || status === "completed") && (
          <div className="mb-6">
            <BottleneckAnalysis />
          </div>
        )}

        {/* Real-time Charts */}
        <div className="grid gap-4 md:grid-cols-3 mb-6">
          <RealTimeChart />
          <MetricsSnapshot />
        </div>

        {/* Verification Summary */}
        <div className="mb-6">
          <VerificationSummary />
        </div>

        {/* Latency Histograms (Preconf + Confirmation) */}
        <div className="mb-6">
          <LatencyHistogram />
        </div>

        {/* Stress Test Metrics - only shown for stress mode */}
        <div className="grid gap-4 md:grid-cols-2 mb-6">
          <TipHistogram />
          <TxTypeBreakdown />
        </div>

        {/* Test History */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">Test History</h2>
            <Link
              href="/load-test/history"
              className="text-sm text-muted-foreground hover:text-foreground hover:underline"
            >
              View All History →
            </Link>
          </div>
          <TestHistory />
        </div>

        {/* Export Controls */}
        <div className="mb-6">
          <ExportControls />
        </div>

        {/* Statistics Table - Full width for better readability */}
        {(status === "running" || status === "completed") && (
          <div className="mb-6">
            <PercentileTable
              latencyStats={stats.latencyStats}
              preconfLatencyStats={stats.preconfLatencyStats}
              mgasStats={stats.mgasStats}
              txsStats={stats.txsStats}
              fillStats={stats.fillStats}
            />
          </div>
        )}
      </main>
    </div>
  );
}
