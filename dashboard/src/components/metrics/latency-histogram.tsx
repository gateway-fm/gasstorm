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

// Gateway chart colors
const CHART_COLORS = {
  grid: "#E2E8F0",
  axis: "#6B7280",
};

// Pending latency uses Gateway purple gradient
const PENDING_BUCKET_COLORS = [
  "#8950FA", // Gateway primary
  "#A478FC", // Lighter purple
  "#C4A8FD", // Even lighter
  "#EAB308", // Warning
  "#EF4444", // Error
];

// Preconf latency uses green gradient
const PRECONF_BUCKET_COLORS = [
  "#22C55E", // Success green
  "#4ADE80", // Lighter green
  "#86EFAC", // Even lighter
  "#EAB308", // Warning
  "#EF4444", // Error
];

// Confirmation latency uses purple gradient (different shades)
const CONFIRM_BUCKET_COLORS = [
  "#6B3DD4", // Darker purple
  "#8950FA", // Gateway primary
  "#A478FC", // Lighter purple
  "#EAB308", // Warning
  "#EF4444", // Error
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
  colors: string[];
  emptyMessage: string;
}

function LatencyCard({ title, stats, colors, emptyMessage }: LatencyCardProps) {
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
                    backgroundColor: "#FFFFFF",
                    border: "1px solid #E2E8F0",
                    borderRadius: "8px",
                  }}
                  labelStyle={{ color: CHART_COLORS.axis }}
                  formatter={(value) => [`${value} txs`, "Count"]}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {histogramData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
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

export function LatencyHistogram() {
  const { latencyStats, preconfLatencyStats, pendingLatencyStats, status } = useGoLoadTestStore();

  // Don't show if test hasn't run
  if (status === "idle") {
    return null;
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <LatencyCard
        title="Pending Latency"
        stats={pendingLatencyStats}
        colors={PENDING_BUCKET_COLORS}
        emptyMessage="Waiting for pending events..."
      />
      <LatencyCard
        title="Preconfirmation Latency"
        stats={preconfLatencyStats}
        colors={PRECONF_BUCKET_COLORS}
        emptyMessage="Waiting for preconfirmations..."
      />
      <LatencyCard
        title="Confirmation Latency"
        stats={latencyStats}
        colors={CONFIRM_BUCKET_COLORS}
        emptyMessage="Waiting for confirmations..."
      />
    </div>
  );
}
