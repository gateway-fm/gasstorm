"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useMetricsStore } from "@/stores/metrics-store";
import { useMemo } from "react";

export function RealTimeChart() {
  const { timeSeries, snapshot, isHistoricalMode } = useMetricsStore();

  // Check if we have Mgas/s data with actual values
  const hasMgasData = timeSeries.mgasPerSec.some(v => v > 0);

  const chartData = useMemo(() => {
    // For historical mode, show all data points (they're already aggregated)
    // For live mode, downsample to ~1 point per second for smoother chart
    const maxPoints = isHistoricalMode ? 300 : 120; // Show more points for historical data
    const totalPoints = timeSeries.timestamps.length;

    // For historical data, use simpler sampling
    const sampleInterval = isHistoricalMode
      ? Math.max(1, Math.floor(totalPoints / maxPoints))
      : Math.max(1, Math.round(1000 / 2000)); // Default ~2s block time for live

    // Sample every Nth point from recent data
    const sampledData: { time: string; mgasPerSec: number; txPerSec: number }[] = [];

    for (let i = totalPoints - 1; i >= 0 && sampledData.length < maxPoints; i -= sampleInterval) {
      sampledData.unshift({
        time: new Date(timeSeries.timestamps[i] * 1000).toLocaleTimeString(),
        mgasPerSec: timeSeries.mgasPerSec[i] ?? 0,
        txPerSec: timeSeries.txPerSec[i] ?? 0,
      });
    }

    return sampledData;
  }, [timeSeries, isHistoricalMode]);

  return (
    <Card className="col-span-2">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-semibold">
          {isHistoricalMode
            ? (hasMgasData ? "Historical Throughput" : "Historical TPS")
            : (hasMgasData ? "Throughput Over Time" : "TPS Over Time")}
        </CardTitle>
        <div className="flex gap-4 text-sm">
          {hasMgasData ? (
            <>
              <div>
                <span className="text-muted-foreground">{isHistoricalMode ? "Avg: " : "Current: "}</span>
                <span className="font-mono font-semibold text-blue-400">
                  {snapshot.currentMgasPerSec.toFixed(2)} Mgas/s
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Peak: </span>
                <span className="font-mono font-semibold text-green-400">
                  {snapshot.peakMgasPerSec.toFixed(2)} Mgas/s
                </span>
              </div>
            </>
          ) : (
            <>
              <div>
                <span className="text-muted-foreground">Avg: </span>
                <span className="font-mono font-semibold text-purple-400">
                  {snapshot.currentTxPerSec.toFixed(1)} tx/s
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Peak: </span>
                <span className="font-mono font-semibold text-green-400">
                  {snapshot.peakTxPerSec.toFixed(1)} tx/s
                </span>
              </div>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] min-w-0 w-full">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%" debounce={1}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis
                  dataKey="time"
                  stroke="#666"
                  fontSize={10}
                  tickLine={false}
                />
                {hasMgasData ? (
                  <>
                    <YAxis
                      yAxisId="left"
                      stroke="#60a5fa"
                      fontSize={10}
                      tickLine={false}
                      label={{
                        value: "Mgas/s",
                        angle: -90,
                        position: "insideLeft",
                        style: { fill: "#60a5fa", fontSize: 10 },
                      }}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      stroke="#a855f7"
                      fontSize={10}
                      tickLine={false}
                      label={{
                        value: "tx/s",
                        angle: 90,
                        position: "insideRight",
                        style: { fill: "#a855f7", fontSize: 10 },
                      }}
                    />
                  </>
                ) : (
                  <YAxis
                    yAxisId="left"
                    stroke="#a855f7"
                    fontSize={10}
                    tickLine={false}
                    label={{
                      value: "tx/s",
                      angle: -90,
                      position: "insideLeft",
                      style: { fill: "#a855f7", fontSize: 10 },
                    }}
                  />
                )}
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1a1a1a",
                    border: "1px solid #333",
                    borderRadius: "8px",
                  }}
                  labelStyle={{ color: "#999" }}
                />
                <Legend />
                {hasMgasData && (
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="mgasPerSec"
                    name="Mgas/s"
                    stroke="#60a5fa"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                )}
                <Line
                  yAxisId={hasMgasData ? "right" : "left"}
                  type="monotone"
                  dataKey="txPerSec"
                  name="tx/s"
                  stroke="#a855f7"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              No data yet. Start a load test to see real-time metrics.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
