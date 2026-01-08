"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMetricsStore } from "@/stores/metrics-store";
import { formatGas, formatPercent } from "@/lib/statistics";

export function MetricsSnapshot() {
  const { snapshot, blockMetrics } = useMetricsStore();

  // Check if we have block metrics (not available in historical mode)
  const hasBlockMetrics = blockMetrics.length > 0;

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
        </div>
      </CardContent>
    </Card>
  );
}
