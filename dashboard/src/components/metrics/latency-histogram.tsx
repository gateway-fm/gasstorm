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

// Preconf latency uses tighter buckets (0-200ms range typically)
const PRECONF_BUCKET_COLORS = [
  "#22c55e", // green
  "#84cc16", // lime
  "#eab308", // yellow
  "#f97316", // orange
  "#ef4444", // red
];

// Confirmation latency uses wider buckets (0-2s+ range)
const CONFIRM_BUCKET_COLORS = [
  "#3b82f6", // blue-500
  "#60a5fa", // blue-400
  "#93c5fd", // blue-300
  "#f97316", // orange
  "#ef4444", // red
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
                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                <XAxis dataKey="name" stroke="#666" fontSize={9} tickLine={false} />
                <YAxis stroke="#666" fontSize={9} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1a1a1a",
                    border: "1px solid #333",
                    borderRadius: "8px",
                  }}
                  labelStyle={{ color: "#999" }}
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
  const { latencyStats, preconfLatencyStats, status } = useGoLoadTestStore();

  // Don't show if test hasn't run
  if (status === "idle") {
    return null;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
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
