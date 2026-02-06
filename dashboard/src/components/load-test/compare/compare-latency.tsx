"use client";

import { Clock, Zap } from "lucide-react";
import type { TestRun, LatencyStats } from "@/types/load-test";
import { CompareSection } from "./compare-section";
import { MetricRow, MetricHeader } from "./metric-row";

interface CompareLatencyProps {
  testA: TestRun;
  testB: TestRun;
  labelA?: string;
  labelB?: string;
}

function formatMs(value: number | string | undefined | null): string {
  if (value === undefined || value === null) return "-";
  if (typeof value === "string") return value;
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)}s`;
  }
  return `${value.toFixed(0)}ms`;
}

interface LatencyTableProps {
  title: string;
  icon: React.ReactNode;
  statsA: LatencyStats | undefined;
  statsB: LatencyStats | undefined;
  labelA: string;
  labelB: string;
}

function LatencyTable({ title, icon, statsA, statsB, labelA, labelB }: LatencyTableProps) {
  // Don't render if neither test has this latency data
  if ((!statsA || statsA.count === 0) && (!statsB || statsB.count === 0)) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-3 pt-2">
        {icon}
        <span className="text-sm font-medium">{title}</span>
      </div>
      <MetricHeader labelA={labelA} labelB={labelB} />
      <MetricRow
        label="Count"
        valueA={statsA?.count}
        valueB={statsB?.count}
        format="absolute"
        showDelta={false}
      />
      <MetricRow
        label="Min"
        valueA={statsA?.min}
        valueB={statsB?.min}
        format="percent"
        formatValue={formatMs}
        higherIsBetter={false}
      />
      <MetricRow
        label="Avg"
        valueA={statsA?.avg}
        valueB={statsB?.avg}
        format="percent"
        formatValue={formatMs}
        higherIsBetter={false}
      />
      <MetricRow
        label="p50"
        valueA={statsA?.p50}
        valueB={statsB?.p50}
        format="percent"
        formatValue={formatMs}
        higherIsBetter={false}
      />
      <MetricRow
        label="p75"
        valueA={statsA?.p75}
        valueB={statsB?.p75}
        format="percent"
        formatValue={formatMs}
        higherIsBetter={false}
      />
      <MetricRow
        label="p90"
        valueA={statsA?.p90}
        valueB={statsB?.p90}
        format="percent"
        formatValue={formatMs}
        higherIsBetter={false}
      />
      <MetricRow
        label="p95"
        valueA={statsA?.p95}
        valueB={statsB?.p95}
        format="percent"
        formatValue={formatMs}
        higherIsBetter={false}
      />
      <MetricRow
        label="p99"
        valueA={statsA?.p99}
        valueB={statsB?.p99}
        format="percent"
        formatValue={formatMs}
        higherIsBetter={false}
      />
      <MetricRow
        label="Max"
        valueA={statsA?.max}
        valueB={statsB?.max}
        format="percent"
        formatValue={formatMs}
        higherIsBetter={false}
      />
    </div>
  );
}

export function CompareLatency({
  testA,
  testB,
  labelA = "Test A",
  labelB = "Test B",
}: CompareLatencyProps) {
  const hasConfirmLatency =
    (testA.latencyStats && testA.latencyStats.count > 0) ||
    (testB.latencyStats && testB.latencyStats.count > 0);
  const hasPreconfLatency =
    (testA.preconfLatency && testA.preconfLatency.count > 0) ||
    (testB.preconfLatency && testB.preconfLatency.count > 0);
  const hasPendingLatency =
    (testA.pendingLatency && testA.pendingLatency.count > 0) ||
    (testB.pendingLatency && testB.pendingLatency.count > 0);

  if (!hasConfirmLatency && !hasPreconfLatency && !hasPendingLatency) {
    return null;
  }

  return (
    <CompareSection
      title="Latency Comparison"
      icon={<Clock className="h-4 w-4 text-blue-400" />}
    >
      <div className="p-4 space-y-6">
        <LatencyTable
          title="Confirmation Latency"
          icon={<Clock className="h-4 w-4 text-blue-400" />}
          statsA={testA.latencyStats}
          statsB={testB.latencyStats}
          labelA={labelA}
          labelB={labelB}
        />

        {hasPreconfLatency && (
          <>
            <div className="border-t" />
            <LatencyTable
              title="Preconfirmation Latency"
              icon={<Zap className="h-4 w-4 text-green-400" />}
              statsA={testA.preconfLatency}
              statsB={testB.preconfLatency}
              labelA={labelA}
              labelB={labelB}
            />
          </>
        )}

        {hasPendingLatency && (
          <>
            <div className="border-t" />
            <LatencyTable
              title="Pending Latency"
              icon={<Clock className="h-4 w-4 text-yellow-400" />}
              statsA={testA.pendingLatency}
              statsB={testB.pendingLatency}
              labelA={labelA}
              labelB={labelB}
            />
          </>
        )}
      </div>
    </CompareSection>
  );
}
