"use client";

import { Activity } from "lucide-react";
import type { TestRun } from "@/types/load-test";
import { CompareSection } from "./compare-section";
import { MetricRow, MetricHeader } from "./metric-row";

interface ComparePerformanceProps {
  testA: TestRun;
  testB: TestRun;
  labelA?: string;
  labelB?: string;
}

function formatTps(value: number | string | undefined | null): string {
  if (value === undefined || value === null) return "-";
  if (typeof value === "string") return value;
  return `${value.toFixed(1)} tx/s`;
}

function formatMgas(value: number | string | undefined | null): string {
  if (value === undefined || value === null) return "-";
  if (typeof value === "string") return value;
  return `${value.toFixed(2)} MGas/s`;
}

function formatPercent(value: number | string | undefined | null): string {
  if (value === undefined || value === null) return "-";
  if (typeof value === "string") return value;
  return `${value.toFixed(1)}%`;
}

function formatGas(value: number | string | undefined | null): string {
  if (value === undefined || value === null) return "-";
  if (typeof value === "string") return value;
  if (value >= 1_000_000_000_000) {
    return `${(value / 1_000_000_000_000).toFixed(2)} TGas`;
  }
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)} GGas`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)} MGas`;
  }
  return value.toLocaleString();
}

export function ComparePerformance({
  testA,
  testB,
  labelA = "Test A",
  labelB = "Test B",
}: ComparePerformanceProps) {
  return (
    <CompareSection
      title="Performance Differences"
      icon={<Activity className="h-4 w-4 text-blue-400" />}
    >
      <div className="p-4">
        <MetricHeader labelA={labelA} labelB={labelB} />

        {/* TPS metrics */}
        <MetricRow
          label="Average TPS"
          valueA={testA.averageTps}
          valueB={testB.averageTps}
          format="percent"
          formatValue={formatTps}
          higherIsBetter={true}
        />
        <MetricRow
          label="Peak TPS"
          valueA={testA.peakTps}
          valueB={testB.peakTps}
          format="percent"
          formatValue={formatTps}
          higherIsBetter={true}
        />

        {/* MGas/s metrics */}
        <MetricRow
          label="Avg MGas/s"
          valueA={testA.avgMgasPerSec}
          valueB={testB.avgMgasPerSec}
          format="percent"
          formatValue={formatMgas}
          higherIsBetter={true}
        />
        <MetricRow
          label="Peak MGas/s"
          valueA={testA.peakMgasPerSec}
          valueB={testB.peakMgasPerSec}
          format="percent"
          formatValue={formatMgas}
          higherIsBetter={true}
        />

        {/* Fill rate */}
        <MetricRow
          label="Avg Fill Rate"
          valueA={testA.avgFillRate}
          valueB={testB.avgFillRate}
          format="percentPoints"
          formatValue={formatPercent}
          higherIsBetter={true}
        />

        {/* Block and gas totals */}
        <MetricRow
          label="Block Count"
          valueA={testA.blockCount}
          valueB={testB.blockCount}
          format="percent"
          higherIsBetter={true}
        />
        <MetricRow
          label="Total Gas Used"
          valueA={testA.totalGasUsed}
          valueB={testB.totalGasUsed}
          format="percent"
          formatValue={formatGas}
          higherIsBetter={true}
        />

        {/* On-chain verified metrics (if available) */}
        {(testA.onChainTps !== undefined || testB.onChainTps !== undefined) && (
          <>
            <div className="border-t my-3" />
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 py-1">
              On-Chain Verified
            </div>
            <MetricRow
              label="On-Chain TPS"
              valueA={testA.onChainTps}
              valueB={testB.onChainTps}
              format="percent"
              formatValue={formatTps}
              higherIsBetter={true}
            />
            <MetricRow
              label="On-Chain MGas/s"
              valueA={testA.onChainMgasPerSec}
              valueB={testB.onChainMgasPerSec}
              format="percent"
              formatValue={formatMgas}
              higherIsBetter={true}
            />
          </>
        )}
      </div>
    </CompareSection>
  );
}
