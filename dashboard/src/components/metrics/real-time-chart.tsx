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
import { useGoLoadTestStore } from "@/stores/go-load-test-store";
import { useMemo } from "react";
import { colors } from "@/lib/colors";

// Chart colors from theme
const COLORS = {
  primary: colors.primary,
  secondary: colors.primaryLight,
  tertiary: colors.primaryLighter,
  success: colors.success,
  warning: colors.warning,
  grid: colors.grid,
  axis: colors.axis,
};

export function RealTimeChart() {
  const { timeSeries: historicalTimeSeries, snapshot: historicalSnapshot, isHistoricalMode } = useMetricsStore();
  const {
    chartTimeSeries: liveTimeSeries,
    currentMgasPerSec,
    currentFillRate,
    peakMgasPerSec: livePeakMgasPerSec,
    avgFillRate: liveAvgFillRate,
    currentRate: liveTxPerSec,
    peakTps: livePeakTps,
    status: liveStatus,
  } = useGoLoadTestStore();

  // Select data source based on mode
  // Live mode: Use Go load generator data (sampled at 200ms)
  // Historical mode: Use hydrated metrics-store data
  const timeSeries = useMemo(() => {
    return isHistoricalMode ? {
      timestamps: historicalTimeSeries.timestamps,
      mgasPerSec: historicalTimeSeries.mgasPerSec,
      txPerSec: historicalTimeSeries.txPerSec,
      fillRate: historicalTimeSeries.blockFillRate,
    } : liveTimeSeries;
  }, [isHistoricalMode, historicalTimeSeries, liveTimeSeries]);

  // Snapshot values for header display
  const snapshot = isHistoricalMode ? historicalSnapshot : {
    currentMgasPerSec,
    currentTxPerSec: liveTxPerSec,
    peakMgasPerSec: livePeakMgasPerSec,
    peakTxPerSec: livePeakTps,
    averageFillRate: liveAvgFillRate,
    currentFillRate,
  };

  // Check if we have Mgas/s data with actual values (either per-sample or aggregates)
  const hasMgasData = timeSeries.mgasPerSec.some(v => v > 0) ||
    (isHistoricalMode && (snapshot.currentMgasPerSec > 0 || snapshot.peakMgasPerSec > 0));

  const chartData = useMemo(() => {
    // For historical mode, show all data points (they're already aggregated)
    // For live mode, show more points since we have 200ms samples
    const maxPoints = isHistoricalMode ? 300 : 300; // More points for smoother live chart
    const totalPoints = timeSeries.timestamps.length;

    // Sample interval: for live mode, show every Nth point to fit maxPoints
    const sampleInterval = Math.max(1, Math.floor(totalPoints / maxPoints));

    // Filter out initial zero-value points that create jumps
    let startIndex = 0;
    for (let i = 0; i < totalPoints; i++) {
      const hasMgas = (timeSeries.mgasPerSec[i] ?? 0) > 0;
      const hasTxs = (timeSeries.txPerSec[i] ?? 0) > 0;
      if (hasMgas || hasTxs) {
        startIndex = i;
        break;
      }
    }

    // Use the first non-zero point as base for relative time
    const baseTimestamp = totalPoints > startIndex
      ? timeSeries.timestamps[startIndex]
      : 0;

    // Sample every Nth point from recent data
    const sampledData: { time: string; mgasPerSec: number; txPerSec: number; fillRate: number }[] = [];

    for (let i = totalPoints - 1; i >= startIndex && sampledData.length < maxPoints; i -= sampleInterval) {
      // Show relative time for both live and historical (e.g., "0:05", "0:10")
      // Live mode now uses elapsed seconds from Go load generator
      const relativeSeconds = Math.round(timeSeries.timestamps[i] - baseTimestamp);
      const minutes = Math.floor(relativeSeconds / 60);
      const seconds = relativeSeconds % 60;
      const timeLabel = `${minutes}:${seconds.toString().padStart(2, '0')}`;

      sampledData.unshift({
        time: timeLabel,
        mgasPerSec: timeSeries.mgasPerSec[i] ?? 0,
        txPerSec: timeSeries.txPerSec[i] ?? 0,
        fillRate: timeSeries.fillRate[i] ?? 0,
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
                <span className="font-mono font-semibold" style={{ color: COLORS.primary }}>
                  {snapshot.currentMgasPerSec.toFixed(2)} Mgas/s
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Peak: </span>
                <span className="font-mono font-semibold" style={{ color: COLORS.success }}>
                  {snapshot.peakMgasPerSec.toFixed(2)} Mgas/s
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Fill: </span>
                <span className="font-mono font-semibold" style={{ color: COLORS.warning }}>
                  {snapshot.averageFillRate.toFixed(1)}%
                </span>
              </div>
            </>
          ) : (
            <>
              <div>
                <span className="text-muted-foreground">Avg: </span>
                <span className="font-mono font-semibold" style={{ color: COLORS.secondary }}>
                  {snapshot.currentTxPerSec.toFixed(1)} tx/s
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Peak: </span>
                <span className="font-mono font-semibold" style={{ color: COLORS.success }}>
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
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                <XAxis
                  dataKey="time"
                  stroke={COLORS.axis}
                  fontSize={10}
                  tickLine={false}
                />
                {hasMgasData ? (
                  <>
                    <YAxis
                      yAxisId="left"
                      stroke={COLORS.primary}
                      fontSize={10}
                      tickLine={false}
                      label={{
                        value: "Mgas/s",
                        angle: -90,
                        position: "insideLeft",
                        style: { fill: COLORS.primary, fontSize: 10 },
                      }}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      stroke={COLORS.secondary}
                      fontSize={10}
                      tickLine={false}
                      label={{
                        value: "tx/s",
                        angle: 90,
                        position: "insideRight",
                        style: { fill: COLORS.secondary, fontSize: 10 },
                      }}
                    />
                  </>
                ) : (
                  <YAxis
                    yAxisId="left"
                    stroke={COLORS.secondary}
                    fontSize={10}
                    tickLine={false}
                    label={{
                      value: "tx/s",
                      angle: -90,
                      position: "insideLeft",
                      style: { fill: COLORS.secondary, fontSize: 10 },
                    }}
                  />
                )}
                <Tooltip
                  contentStyle={{
                    backgroundColor: colors.background,
                    border: `1px solid ${colors.border}`,
                    borderRadius: "8px",
                  }}
                  labelStyle={{ color: COLORS.axis }}
                />
                <Legend />
                {hasMgasData && (
                  <>
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="mgasPerSec"
                      name="Mgas/s"
                      stroke={COLORS.primary}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="fillRate"
                      name="Fill %"
                      stroke={COLORS.warning}
                      strokeWidth={1.5}
                      strokeDasharray="4 2"
                      dot={false}
                      activeDot={{ r: 3 }}
                    />
                  </>
                )}
                <Line
                  yAxisId={hasMgasData ? "right" : "left"}
                  type="monotone"
                  dataKey="txPerSec"
                  name="tx/s"
                  stroke={COLORS.secondary}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
              {liveStatus === "completed" || liveStatus === "error" ? (
                <>
                  <p>Chart data not available for this session.</p>
                  <p className="text-sm">View detailed results in <a href="/load-test/history" className="text-primary hover:underline">History</a>.</p>
                </>
              ) : liveStatus === "initializing" || liveStatus === "running" || liveStatus === "verifying" ? (
                <p>Collecting metrics...</p>
              ) : (
                <p>No data yet. Start a load test to see real-time metrics.</p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
