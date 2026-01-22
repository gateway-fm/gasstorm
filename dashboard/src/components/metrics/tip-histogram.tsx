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

// Tip distribution colors - green to red gradient
const TIP_COLORS = [
  "#22C55E", // lowest tips - green (success)
  "#4ADE80", // lighter green
  "#86EFAC", // even lighter
  "#EAB308", // yellow (warning)
  "#F97316", // orange
  "#EF4444", // red (destructive)
  "#DC2626", // darker red
  "#B91C1C", // highest tips - dark red
];

export function TipHistogram() {
  const { tipHistogram, config, status } = useGoLoadTestStore();

  // Only show for realistic mode
  if (config?.pattern !== "realistic") {
    return null;
  }

  // Don't show if test hasn't run
  if (status === "idle") {
    return null;
  }

  // Format histogram data
  const histogramData = tipHistogram.map((bucket) => ({
    name: `${bucket.minGwei.toFixed(1)}-${bucket.maxGwei.toFixed(1)}`,
    count: bucket.count,
    label: `${bucket.minGwei.toFixed(1)} - ${bucket.maxGwei.toFixed(1)} gwei`,
  }));

  const totalCount = tipHistogram.reduce((sum, b) => sum + b.count, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-semibold">Tip Distribution</CardTitle>
        <div className="text-sm">
          <span className="text-muted-foreground">Distribution: </span>
          <span className="font-mono font-semibold">
            {config?.realisticConfig?.tipDistribution ?? "exponential"}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          {totalCount > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={histogramData}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
                <XAxis
                  dataKey="name"
                  stroke={CHART_COLORS.axis}
                  fontSize={10}
                  tickLine={false}
                  angle={-45}
                  textAnchor="end"
                  height={50}
                />
                <YAxis stroke={CHART_COLORS.axis} fontSize={10} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#FFFFFF",
                    border: "1px solid #E2E8F0",
                    borderRadius: "8px",
                  }}
                  labelStyle={{ color: CHART_COLORS.axis }}
                  formatter={(value, _name, props) => [
                    `${value} txs`,
                    props.payload.label,
                  ]}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {histogramData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={TIP_COLORS[index % TIP_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              No tip data yet - waiting for transactions...
            </div>
          )}
        </div>
        {totalCount > 0 && (
          <div className="mt-2 text-xs text-muted-foreground text-center">
            {totalCount.toLocaleString()} transactions by priority tip
          </div>
        )}
      </CardContent>
    </Card>
  );
}
