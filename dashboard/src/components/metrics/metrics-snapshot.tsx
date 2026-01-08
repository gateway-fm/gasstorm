"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMetricsStore } from "@/stores/metrics-store";
import { useChainStore } from "@/stores/chain-store";
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

export function MetricsSnapshot() {
  const { snapshot, blockMetrics } = useMetricsStore();
  const { builder } = useChainStore();

  // Check if we have block metrics (not available in historical mode)
  const hasBlockMetrics = blockMetrics.length > 0;

  // Target block time from config (default 2000ms if not set)
  const targetBlockTimeMs = builder.blockTimeMs || 2000;

  const metrics = [
    {
      label: hasBlockMetrics ? "Current Mgas/s" : "Avg tx/s",
      value: hasBlockMetrics ? snapshot.currentMgasPerSec.toFixed(2) : snapshot.currentTxPerSec.toFixed(1),
      unit: hasBlockMetrics ? "Mgas/s" : "tx/s",
      color: hasBlockMetrics ? "text-blue-400" : "text-purple-400",
    },
    {
      label: hasBlockMetrics ? "Peak Mgas/s" : "Peak tx/s",
      value: hasBlockMetrics ? snapshot.peakMgasPerSec.toFixed(2) : snapshot.peakTxPerSec.toFixed(1),
      unit: hasBlockMetrics ? "Mgas/s" : "tx/s",
      color: "text-green-400",
    },
    {
      label: hasBlockMetrics ? "Current tx/s" : "Confirmed",
      value: hasBlockMetrics ? snapshot.currentTxPerSec.toFixed(1) : snapshot.totalTransactions.toLocaleString(),
      unit: hasBlockMetrics ? "tx/s" : "txs",
      color: "text-purple-400",
    },
    {
      label: hasBlockMetrics ? "Peak tx/s" : "Success Rate",
      value: hasBlockMetrics
        ? snapshot.peakTxPerSec.toFixed(1)
        : snapshot.totalTransactions > 0 ? "100%" : "-",
      unit: hasBlockMetrics ? "tx/s" : "",
      color: hasBlockMetrics ? "text-purple-400" : "text-green-400",
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
      value: hasBlockMetrics ? formatPercent(snapshot.averageFillRate) : "N/A",
      unit: "",
      color: hasBlockMetrics ? "text-orange-400" : "text-muted-foreground",
    },
    {
      label: "Blocks",
      value: hasBlockMetrics ? snapshot.blocksProduced.toString() : "N/A",
      unit: "",
      color: "text-muted-foreground",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          {hasBlockMetrics ? "Live Metrics" : "Test Metrics"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
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
        <div className="mt-3 pt-3 border-t">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total Gas Used</span>
            <span className="font-mono">
              {hasBlockMetrics ? formatGas(snapshot.totalGasUsed) : "N/A"}
            </span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className="text-muted-foreground">Total Transactions</span>
            <span className="font-mono">{snapshot.totalTransactions.toLocaleString()}</span>
          </div>
          {hasBlockMetrics && snapshot.minBlockTimeMs > 0 && (
            <div className="flex justify-between text-sm mt-1">
              <span className="text-muted-foreground">Block Time (min/max)</span>
              <span className="font-mono">
                {formatBlockTime(snapshot.minBlockTimeMs)} / {formatBlockTime(snapshot.maxBlockTimeMs)}
                {snapshot.minBlockTimeMs < 1000 && <span className="text-xs text-muted-foreground ml-1">ms</span>}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
