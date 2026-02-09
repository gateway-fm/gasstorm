"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useGoLoadTestStore } from "@/stores/go-load-test-store";
import { colors, chartColors } from "@/lib/colors";

// Chart colors from theme
const CHART_COLORS = {
  grid: colors.grid,
  axis: colors.axis,
};

// Pending latency uses Gateway purple gradient
const PENDING_BUCKET_COLORS = [
  ...chartColors.primary,
  colors.warning,
  colors.destructive,
];

// Preconf latency uses green gradient
const PRECONF_BUCKET_COLORS = [
  ...chartColors.success,
  colors.warning,
  colors.destructive,
];

// Confirmation latency uses purple gradient (different shades)
const CONFIRM_BUCKET_COLORS = [
  ...chartColors.confirmation,
  colors.warning,
  colors.destructive,
];

interface LatencyCardProps {
  title: string;
  stats: {
    count: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
    buckets?: { label: string; count: number }[];
  } | null;
  barColors: string[];
  emptyMessage: string;
}

function LatencyCard({ title, stats, barColors, emptyMessage }: LatencyCardProps) {
  const histogramData = stats?.buckets?.map((bucket) => ({
    name: bucket.label,
    count: bucket.count,
  })) ?? [];

  const totalCount = stats?.count ?? 0;
  const avgLatency = stats?.avg ?? 0;
  const p50 = stats?.p50 ?? 0;
  const p95 = stats?.p95 ?? 0;
  const p99 = stats?.p99 ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        <div className="text-xs space-x-2">
          <span>
            <span className="text-muted-foreground">Avg: </span>
            <span className="font-mono font-semibold">
              {avgLatency > 0 ? `${avgLatency.toFixed(0)}ms` : "-"}
            </span>
          </span>
          <span>
            <span className="text-muted-foreground">P50: </span>
            <span className="font-mono font-semibold">
              {p50 > 0 ? `${p50.toFixed(0)}ms` : "-"}
            </span>
          </span>
          <span>
            <span className="text-muted-foreground">P95: </span>
            <span className="font-mono font-semibold">
              {p95 > 0 ? `${p95.toFixed(0)}ms` : "-"}
            </span>
          </span>
          <span>
            <span className="text-muted-foreground">P99: </span>
            <span className="font-mono font-semibold">
              {p99 > 0 ? `${p99.toFixed(0)}ms` : "-"}
            </span>
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[150px]">
          {totalCount > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={histogramData}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
                <XAxis dataKey="name" stroke={CHART_COLORS.axis} fontSize={9} tickLine={false} />
                <YAxis stroke={CHART_COLORS.axis} fontSize={9} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: colors.background,
                    border: `1px solid ${colors.border}`,
                    borderRadius: "8px",
                  }}
                  labelStyle={{ color: CHART_COLORS.axis }}
                  formatter={(value) => [`${value} txs`, "Count"]}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {histogramData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={barColors[index % barColors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
              {emptyMessage}
            </div>
          )}
        </div>
        {totalCount > 0 && (
          <div className="mt-1 text-xs text-muted-foreground text-center">
            {totalCount.toLocaleString()} transactions
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Execution layers that support preconfirmations */
const PRECONF_LAYERS = new Set(["reth", "op-reth"]);

interface LatencyHistogramProps {
  /** Execution layer name - hides preconf/pending cards when not supported */
  executionLayer?: string;
}

export function LatencyHistogram({ executionLayer }: LatencyHistogramProps = {}) {
  const { latencyStats, preconfLatencyStats, pendingLatencyStats, status } = useGoLoadTestStore();

  // Don't show if test hasn't run
  if (status === "idle") {
    return null;
  }

  const showPreconf = !executionLayer || PRECONF_LAYERS.has(executionLayer);

  if (!showPreconf) {
    // Only show confirmation latency for non-preconf layers
    return (
      <div className="grid gap-4 md:grid-cols-1 max-w-md">
        <LatencyCard
          title="Confirmation Latency"
          stats={latencyStats}
          barColors={CONFIRM_BUCKET_COLORS}
          emptyMessage="No confirmation latency data (on-chain verification only)"
        />
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <LatencyCard
        title="Pending Latency"
        stats={pendingLatencyStats}
        barColors={PENDING_BUCKET_COLORS}
        emptyMessage="Waiting for pending events..."
      />
      <LatencyCard
        title="Preconfirmation Latency"
        stats={preconfLatencyStats}
        barColors={PRECONF_BUCKET_COLORS}
        emptyMessage="Waiting for preconfirmations..."
      />
      <LatencyCard
        title="Confirmation Latency"
        stats={latencyStats}
        barColors={CONFIRM_BUCKET_COLORS}
        emptyMessage="Waiting for confirmations..."
      />
    </div>
  );
}
