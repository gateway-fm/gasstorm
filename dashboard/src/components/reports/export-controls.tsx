"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGoLoadTestStore } from "@/stores/go-load-test-store";
import { useMetricsStore } from "@/stores/metrics-store";
import { calculateStatistics } from "@/lib/statistics";
import { generateTestId } from "@/types/report";
import type { LoadTestReport } from "@/types/report";
import { toast } from "sonner";

function generateReport(): LoadTestReport | null {
  const loadTestState = useGoLoadTestStore.getState();
  const metricsState = useMetricsStore.getState();

  if (!loadTestState.config || loadTestState.txSentCount === 0) return null;

  const startTime = loadTestState.startTime ?? Date.now();
  const endTime = startTime + loadTestState.elapsedTime * 1000;

  // Convert Go latency stats to latencies array for statistics
  const latencies: number[] = [];
  if (loadTestState.latencyStats) {
    // Use the stats directly since we have percentiles
    const ls = loadTestState.latencyStats;
    // Create a synthetic array that will produce similar stats
    for (let i = 0; i < ls.count; i++) {
      latencies.push(ls.avg); // Approximate with avg
    }
  }

  const mgasValues = metricsState.timeSeries.mgasPerSec;
  const txsValues = metricsState.timeSeries.txPerSec;
  const fillValues = metricsState.timeSeries.blockFillRate;

  // Build latency stats from Go load generator data
  const latencyStats = loadTestState.latencyStats ? {
    min: loadTestState.latencyStats.min,
    max: loadTestState.latencyStats.max,
    mean: loadTestState.latencyStats.avg,
    median: loadTestState.latencyStats.p50,
    p75: loadTestState.latencyStats.p75,
    p90: loadTestState.latencyStats.p90,
    p95: loadTestState.latencyStats.p95,
    p99: loadTestState.latencyStats.p99,
    stdDev: 0,
    count: loadTestState.latencyStats.count,
  } : calculateStatistics(latencies);

  const report: LoadTestReport = {
    meta: {
      testId: generateTestId(),
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
      duration: loadTestState.elapsedTime,
      config: loadTestState.config,
    },
    summary: {
      totalTxSent: loadTestState.txSentCount,
      totalTxConfirmed: loadTestState.txConfirmedCount,
      totalTxFailed: loadTestState.txFailedCount,
      peakMgasPerSec: metricsState.snapshot.peakMgasPerSec,
      peakTxPerSec: metricsState.snapshot.peakTxPerSec,
      averageBlockFillRate: metricsState.snapshot.averageFillRate,
      blocksProduced: metricsState.snapshot.blocksProduced,
      totalGasUsed: metricsState.snapshot.totalGasUsed.toString(),
    },
    latency: latencyStats,
    throughput: {
      mgas: calculateStatistics(mgasValues),
      txs: calculateStatistics(txsValues),
    },
    blockFill: calculateStatistics(fillValues),
    timeSeries: metricsState.timeSeries,
    rawData: {
      transactions: [],
      blocks: metricsState.blockMetrics,
    },
  };

  return report;
}

function downloadJson(report: LoadTestReport) {
  // Custom replacer to handle BigInt serialization (gasUsed, gasLimit in block metrics)
  const json = JSON.stringify(report, (_, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  }, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `load-test-${report.meta.testId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadCsv(report: LoadTestReport) {
  const lines: string[] = [];

  // Summary section
  lines.push("# Summary");
  lines.push("Metric,Value");
  lines.push(`Test ID,${report.meta.testId}`);
  lines.push(`Start Time,${report.meta.startTime}`);
  lines.push(`End Time,${report.meta.endTime}`);
  lines.push(`Duration (s),${report.meta.duration}`);
  lines.push(`Pattern,${report.meta.config.pattern}`);
  lines.push(`Total TX Sent,${report.summary.totalTxSent}`);
  lines.push(`Total TX Confirmed,${report.summary.totalTxConfirmed}`);
  lines.push(`Total TX Failed,${report.summary.totalTxFailed}`);
  lines.push(`Peak Mgas/s,${report.summary.peakMgasPerSec}`);
  lines.push(`Peak tx/s,${report.summary.peakTxPerSec}`);
  lines.push(`Avg Block Fill Rate,${report.summary.averageBlockFillRate}`);
  lines.push(`Blocks Produced,${report.summary.blocksProduced}`);
  lines.push("");

  // Statistics section
  lines.push("# Statistics");
  lines.push("Metric,Min,Mean,Median,p75,p90,p95,p99,Max,StdDev,Count");
  const statsRows = [
    { name: "Latency (ms)", stats: report.latency },
    { name: "Mgas/s", stats: report.throughput.mgas },
    { name: "tx/s", stats: report.throughput.txs },
    { name: "Block Fill %", stats: report.blockFill },
  ];
  for (const row of statsRows) {
    const s = row.stats;
    lines.push(
      `${row.name},${s.min},${s.mean},${s.median},${s.p75},${s.p90},${s.p95},${s.p99},${s.max},${s.stdDev},${s.count}`
    );
  }
  lines.push("");

  // Time series section
  lines.push("# Time Series");
  lines.push("Timestamp,Mgas/s,tx/s,Block Fill %");
  for (let i = 0; i < report.timeSeries.timestamps.length; i++) {
    lines.push(
      `${report.timeSeries.timestamps[i]},${report.timeSeries.mgasPerSec[i]},${report.timeSeries.txPerSec[i]},${report.timeSeries.blockFillRate[i]}`
    );
  }

  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `load-test-${report.meta.testId}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportControls() {
  const { status } = useGoLoadTestStore();

  const handleExportJson = () => {
    const report = generateReport();
    if (report) {
      downloadJson(report);
      toast.success("Report exported as JSON");
    } else {
      toast.error("No report data available");
    }
  };

  const handleExportCsv = () => {
    const report = generateReport();
    if (report) {
      downloadCsv(report);
      toast.success("Report exported as CSV");
    } else {
      toast.error("No report data available");
    }
  };

  const isDisabled = status !== "completed";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Export Report</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportJson} disabled={isDisabled}>
            Export JSON
          </Button>
          <Button variant="outline" onClick={handleExportCsv} disabled={isDisabled}>
            Export CSV
          </Button>
        </div>
        {isDisabled && (
          <p className="text-xs text-muted-foreground mt-2">
            Complete a load test to export the report
          </p>
        )}
      </CardContent>
    </Card>
  );
}
