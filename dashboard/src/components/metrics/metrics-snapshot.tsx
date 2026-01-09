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

  if (deviation <= 0.2) return "text-green-400";  // Within 20%
  if (deviation <= 0.5) return "text-yellow-400"; // Within 50%
  return "text-red-400";                           // More than 50% off
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
  const { snapshot, blockMetrics, timeSeries, isHistoricalMode } = useMetricsStore();
  const { latestBaseFeeGwei, latestGasPriceGwei } = useGoLoadTestStore();

  // Check if we have block metrics (live mode with raw block data)
  const hasBlockMetrics = blockMetrics.length > 0;

  // In historical mode, check if we have time series data with Mgas/s
  const hasHistoricalMgasData = isHistoricalMode && timeSeries.mgasPerSec.some(v => v > 0);

  // Use Mgas display if we have live block metrics OR historical Mgas data
  const showMgasMetrics = hasBlockMetrics || hasHistoricalMgasData;

  // Target block time - only relevant for live mode
  const targetBlockTimeMs = 2000;

  // For historical mode: use showMgasMetrics to determine what to display
  // This ensures label and value/unit are always consistent
  const showMgasLabel = showMgasMetrics;

  const metrics = [
    {
      label: showMgasLabel ? (isHistoricalMode ? "Avg Mgas/s" : "Current Mgas/s") : "Avg tx/s",
      value: showMgasMetrics ? snapshot.currentMgasPerSec.toFixed(2) : snapshot.currentTxPerSec.toFixed(1),
      unit: showMgasMetrics ? "Mgas/s" : "tx/s",
      color: showMgasMetrics ? "text-blue-400" : "text-purple-400",
    },
    {
      label: showMgasLabel ? "Peak Mgas/s" : "Peak tx/s",
      value: showMgasMetrics ? snapshot.peakMgasPerSec.toFixed(2) : snapshot.peakTxPerSec.toFixed(1),
      unit: showMgasMetrics ? "Mgas/s" : "tx/s",
      color: "text-green-400",
    },
    {
      label: showMgasLabel ? (isHistoricalMode ? "Avg tx/s" : "Current tx/s") : "Confirmed",
      value: showMgasMetrics ? snapshot.currentTxPerSec.toFixed(1) : snapshot.totalTransactions.toLocaleString(),
      unit: showMgasMetrics ? "tx/s" : "txs",
      color: "text-purple-400",
    },
    {
      label: showMgasLabel ? "Peak tx/s" : "Success Rate",
      value: showMgasMetrics
        ? snapshot.peakTxPerSec.toFixed(1)
        : snapshot.totalTransactions > 0 ? "100%" : "-",
      unit: showMgasMetrics ? "tx/s" : "",
      color: showMgasMetrics ? "text-purple-400" : "text-green-400",
    },
    {
      label: "Block Time",
      value: hasBlockMetrics ? formatBlockTime(snapshot.currentBlockTimeMs) : "N/A",
      unit: hasBlockMetrics && snapshot.currentBlockTimeMs > 0 && snapshot.currentBlockTimeMs < 1000 ? "ms" : "",
      color: hasBlockMetrics ? getBlockTimeColor(snapshot.currentBlockTimeMs, targetBlockTimeMs) : "text-muted-foreground",
    },
    {
      label: "Avg Block Time",
      value: hasBlockMetrics ? formatBlockTime(snapshot.avgBlockTimeMs) : "N/A",
      unit: hasBlockMetrics && snapshot.avgBlockTimeMs > 0 && snapshot.avgBlockTimeMs < 1000 ? "ms" : "",
      color: hasBlockMetrics ? getBlockTimeColor(snapshot.avgBlockTimeMs, targetBlockTimeMs) : "text-muted-foreground",
    },
    {
      label: "Avg Fill Rate",
      value: showMgasMetrics ? formatPercent(snapshot.averageFillRate) : "N/A",
      unit: "",
      color: showMgasMetrics ? "text-orange-400" : "text-muted-foreground",
    },
    {
      label: "Blocks",
      value: showMgasMetrics ? snapshot.blocksProduced.toString() : "N/A",
      unit: "",
      color: "text-muted-foreground",
    },
    {
      label: "Base Fee",
      value: !isHistoricalMode ? formatGasPrice(latestBaseFeeGwei) : "N/A",
      unit: !isHistoricalMode && latestBaseFeeGwei > 0 ? "gwei" : "",
      color: latestBaseFeeGwei > 1.5 ? "text-red-400" : (latestBaseFeeGwei > 1.0 ? "text-yellow-400" : "text-green-400"),
    },
    {
      label: "Gas Price",
      value: !isHistoricalMode ? formatGasPrice(latestGasPriceGwei) : "N/A",
      unit: !isHistoricalMode && latestGasPriceGwei > 0 ? "gwei" : "",
      color: latestGasPriceGwei > 2.0 ? "text-red-400" : (latestGasPriceGwei > 1.5 ? "text-yellow-400" : "text-green-400"),
    },
    {
      label: "Total Gas",
      value: showMgasMetrics ? formatGas(snapshot.totalGasUsed) : "N/A",
      unit: "",
      color: "text-cyan-400",
    },
    {
      label: "Total Txs",
      value: snapshot.totalTransactions.toLocaleString(),
      unit: "",
      color: "text-amber-400",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          {isHistoricalMode ? "Historical Metrics" : (hasBlockMetrics ? "Live Metrics" : "Test Metrics")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">{metric.label}</p>
              <p className={`text-xl font-bold font-mono ${metric.color}`}>
                {metric.value}
                {metric.unit && (
                  <span className="text-xs font-normal text-muted-foreground ml-1">
                    {metric.unit}
                  </span>
                )}
              </p>
            </div>
          ))}
        </div>
        {hasBlockMetrics && snapshot.minBlockTimeMs > 0 && (
          <div className="mt-3 pt-3 border-t">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Block Time (min/max)</span>
              <span className="font-mono">
                {formatBlockTime(snapshot.minBlockTimeMs)} / {formatBlockTime(snapshot.maxBlockTimeMs)}
                {snapshot.minBlockTimeMs < 1000 && <span className="text-xs text-muted-foreground ml-1">ms</span>}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
