"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMetricsStore } from "@/stores/metrics-store";
import { useGoLoadTestStore } from "@/stores/go-load-test-store";
import { formatGas, formatPercent } from "@/lib/statistics";

// Format block time in ms with appropriate precision
function formatBlockTime(ms: number): string {
  if (ms === 0) return "N/A";
  if (ms < 1000) return `${Math.round(ms)}`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// Get color based on block time relative to target
// Green: within ±20% of target
// Yellow: within ±50% of target
// Red: more than 50% off target
function getBlockTimeColor(ms: number, targetMs: number): string {
  if (ms === 0) return "text-muted-foreground";

  const deviation = Math.abs(ms - targetMs) / targetMs;

  if (deviation <= 0.2) return "text-success";  // Within 20%
  if (deviation <= 0.5) return "text-warning"; // Within 50%
  return "text-destructive";                    // More than 50% off
}

// Format gas price - show more precision for very low values
function formatGasPrice(gwei: number): string {
  if (gwei === 0) return "—";
  if (gwei < 0.001) return gwei.toExponential(1);
  if (gwei < 0.1) return gwei.toFixed(4);
  if (gwei < 1) return gwei.toFixed(3);
  return gwei.toFixed(2);
}

export function MetricsSnapshot() {
  const { snapshot, blockMetrics, timeSeries } = useMetricsStore();
  const {
    status: goStatus,
    isHistoricalMode: goIsHistorical,
    latestBaseFeeGwei,
    latestGasPriceGwei,
    txConfirmedCount,
    currentRate: goCurrentTps,
    averageTps: goAverageTps,
    peakTps: goPeakTps,
    // Aggregate block metrics from Go load generator
    totalGasUsed: goTotalGasUsed,
    blockCount: goBlockCount,
    peakMgasPerSec: goPeakMgasPerSec,
    avgMgasPerSec: goAvgMgasPerSec,
    avgFillRate: goAvgFillRate,
  } = useGoLoadTestStore();

  // goIsHistorical = true ONLY when viewing DB-hydrated history (hydrateFromHistory).
  // For data source branching: DB history → metricsStore snapshot, everything else → goLoadTestStore.
  const isLiveRunning = goStatus === "running" || goStatus === "initializing" || goStatus === "verifying";

  // DB-hydrated history → use metricsStore snapshot. Everything else → goLoadTestStore.
  const totalTxs = goIsHistorical ? snapshot.totalTransactions : txConfirmedCount;

  // Check if we have block metrics from Go load generator (live mode) or from metrics-store
  const hasGoBlockMetrics = goBlockCount > 0 || goTotalGasUsed > 0;
  const hasBlockMetrics = blockMetrics.length > 0 || hasGoBlockMetrics;

  // In DB historical mode, check if we have Mgas/s data either in time series OR in snapshot aggregates
  const hasHistoricalMgasData = goIsHistorical && (
    timeSeries.mgasPerSec.some(v => v > 0) ||
    snapshot.currentMgasPerSec > 0 ||
    snapshot.peakMgasPerSec > 0
  );

  // Use Mgas display if we have live block metrics OR historical Mgas data
  const showMgasMetrics = hasBlockMetrics || hasHistoricalMgasData;

  // Target block time - only relevant for live mode
  const targetBlockTimeMs = 2000;

  // DB history → metricsStore snapshot values. Live/completed → goLoadTestStore values.
  const peakMgasPerSec = goIsHistorical ? snapshot.peakMgasPerSec : goPeakMgasPerSec;
  const avgMgasPerSec = goIsHistorical ? snapshot.currentMgasPerSec : goAvgMgasPerSec;
  const avgFillRate = goIsHistorical ? snapshot.averageFillRate : goAvgFillRate;
  const blocksProduced = goIsHistorical ? snapshot.blocksProduced : goBlockCount;
  const totalGasUsed = goIsHistorical ? snapshot.totalGasUsed : BigInt(goTotalGasUsed);

  const metrics = [
    {
      label: isLiveRunning ? "Now" : "Avg",
      value: showMgasMetrics ? avgMgasPerSec.toFixed(1) : snapshot.currentTxPerSec.toFixed(1),
      unit: showMgasMetrics ? "Mgas/s" : "tx/s",
      color: showMgasMetrics ? "text-info" : "text-primary",
    },
    {
      label: "Peak",
      value: showMgasMetrics ? peakMgasPerSec.toFixed(1) : snapshot.peakTxPerSec.toFixed(1),
      unit: showMgasMetrics ? "Mgas/s" : "tx/s",
      color: "text-success",
    },
    {
      label: isLiveRunning ? "TPS" : "Avg TPS",
      value: showMgasMetrics
        ? (isLiveRunning ? goCurrentTps : goAverageTps).toFixed(0)
        : snapshot.totalTransactions.toLocaleString(),
      unit: showMgasMetrics ? "" : "txs",
      color: "text-primary",
    },
    {
      label: "Peak TPS",
      value: showMgasMetrics
        ? goPeakTps.toFixed(0)
        : snapshot.totalTransactions > 0 ? "100%" : "-",
      unit: "",
      color: showMgasMetrics ? "text-primary" : "text-success",
    },
    {
      label: "Block",
      value: (blockMetrics.length > 0 || snapshot.currentBlockTimeMs > 0) ? formatBlockTime(snapshot.currentBlockTimeMs) : "—",
      unit: (blockMetrics.length > 0 || snapshot.currentBlockTimeMs > 0) && snapshot.currentBlockTimeMs > 0 && snapshot.currentBlockTimeMs < 1000 ? "ms" : "",
      color: (blockMetrics.length > 0 || snapshot.currentBlockTimeMs > 0) ? getBlockTimeColor(snapshot.currentBlockTimeMs, targetBlockTimeMs) : "text-muted-foreground",
    },
    {
      label: "Avg Block",
      value: (blockMetrics.length > 0 || snapshot.avgBlockTimeMs > 0) ? formatBlockTime(snapshot.avgBlockTimeMs) : "—",
      unit: (blockMetrics.length > 0 || snapshot.avgBlockTimeMs > 0) && snapshot.avgBlockTimeMs > 0 && snapshot.avgBlockTimeMs < 1000 ? "ms" : "",
      color: (blockMetrics.length > 0 || snapshot.avgBlockTimeMs > 0) ? getBlockTimeColor(snapshot.avgBlockTimeMs, targetBlockTimeMs) : "text-muted-foreground",
    },
    {
      label: "Fill",
      value: showMgasMetrics ? formatPercent(avgFillRate) : "—",
      unit: "",
      color: showMgasMetrics ? "text-warning" : "text-muted-foreground",
    },
    {
      label: "Blocks",
      value: showMgasMetrics ? blocksProduced.toString() : "—",
      unit: "",
      color: "text-muted-foreground",
    },
    {
      label: "Base Fee",
      value: formatGasPrice(goIsHistorical ? snapshot.baseFeeGwei ?? 0 : latestBaseFeeGwei),
      unit: (goIsHistorical ? (snapshot.baseFeeGwei ?? 0) > 0 : latestBaseFeeGwei > 0) ? "gwei" : "",
      color: (goIsHistorical ? (snapshot.baseFeeGwei ?? 0) : latestBaseFeeGwei) > 1.5 ? "text-destructive" : ((goIsHistorical ? (snapshot.baseFeeGwei ?? 0) : latestBaseFeeGwei) > 1.0 ? "text-warning" : "text-success"),
    },
    {
      label: "Gas Price",
      value: formatGasPrice(goIsHistorical ? snapshot.gasPriceGwei ?? 0 : latestGasPriceGwei),
      unit: (goIsHistorical ? (snapshot.gasPriceGwei ?? 0) > 0 : latestGasPriceGwei > 0) ? "gwei" : "",
      color: (goIsHistorical ? (snapshot.gasPriceGwei ?? 0) : latestGasPriceGwei) > 2.0 ? "text-destructive" : ((goIsHistorical ? (snapshot.gasPriceGwei ?? 0) : latestGasPriceGwei) > 1.5 ? "text-warning" : "text-success"),
    },
    {
      label: "Total Gas",
      value: showMgasMetrics ? formatGas(totalGasUsed) : "—",
      unit: "",
      color: "text-info",
    },
    {
      label: "Total Txs",
      value: totalTxs.toLocaleString(),
      unit: "",
      color: "text-warning",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold font-mono">
          {goIsHistorical ? "Historical Metrics" : isLiveRunning ? "Live Metrics" : (goStatus === "completed" || goStatus === "error") ? "Test Results" : "Test Metrics"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-lg border p-2 min-w-0 overflow-hidden">
              <p className="text-[10px] text-muted-foreground font-mono truncate">{metric.label}</p>
              <p className={`text-base font-bold font-mono ${metric.color} truncate`}>
                {metric.value}
              </p>
              {metric.unit && (
                <p className="text-[10px] text-muted-foreground font-mono truncate">{metric.unit}</p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
