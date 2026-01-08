"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Statistics } from "@/types/metrics";
import { formatNumber, formatDuration } from "@/lib/statistics";

interface PercentileTableProps {
  latencyStats: Statistics;
  preconfLatencyStats?: Statistics;
  mgasStats: Statistics;
  txsStats: Statistics;
  fillStats: Statistics;
}

export function PercentileTable({
  latencyStats,
  preconfLatencyStats,
  mgasStats,
  txsStats,
  fillStats,
}: PercentileTableProps) {
  const rows = [
    ...(preconfLatencyStats && preconfLatencyStats.count > 0 ? [{
      metric: "Preconf Latency",
      stats: preconfLatencyStats,
      format: (v: number) => formatDuration(v),
      unit: "",
      highlight: true,
    }] : []),
    {
      metric: "TX Latency",
      stats: latencyStats,
      format: (v: number) => formatDuration(v),
      unit: "",
      highlight: false,
    },
    {
      metric: "Gas Throughput",
      stats: mgasStats,
      format: (v: number) => formatNumber(v, 2),
      unit: "Mgas/s",
      highlight: false,
    },
    {
      metric: "TX Throughput",
      stats: txsStats,
      format: (v: number) => formatNumber(v, 1),
      unit: "tx/s",
      highlight: false,
    },
    {
      metric: "Block Fill",
      stats: fillStats,
      format: (v: number) => formatNumber(v, 1),
      unit: "%",
      highlight: false,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Statistics Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Metric</TableHead>
              <TableHead className="text-right">Min</TableHead>
              <TableHead className="text-right">Mean</TableHead>
              <TableHead className="text-right">p50</TableHead>
              <TableHead className="text-right">p75</TableHead>
              <TableHead className="text-right">p90</TableHead>
              <TableHead className="text-right">p95</TableHead>
              <TableHead className="text-right">p99</TableHead>
              <TableHead className="text-right">Max</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.metric} className={row.highlight ? "bg-green-500/10" : ""}>
                <TableCell className={`font-medium ${row.highlight ? "text-green-400" : ""}`}>
                  {row.metric}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {row.format(row.stats.min)}
                  {row.unit}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {row.format(row.stats.mean)}
                  {row.unit}
                </TableCell>
                <TableCell className="text-right font-mono text-xs text-green-400">
                  {row.format(row.stats.median)}
                  {row.unit}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {row.format(row.stats.p75)}
                  {row.unit}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {row.format(row.stats.p90)}
                  {row.unit}
                </TableCell>
                <TableCell className="text-right font-mono text-xs text-yellow-400">
                  {row.format(row.stats.p95)}
                  {row.unit}
                </TableCell>
                <TableCell className="text-right font-mono text-xs text-red-400">
                  {row.format(row.stats.p99)}
                  {row.unit}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {row.format(row.stats.max)}
                  {row.unit}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
