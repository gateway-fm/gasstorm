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
  mgas: colors.info,           // Blue for MGas/s (matches text-info in metrics)
  tps: colors.primary,         // Purple for tx/s (matches text-primary)
  tertiary: colors.primaryLighter,
  success: colors.success,
  warning: colors.warning,
  grid: colors.grid,
  axis: colors.axis,
};

interface ChartPoint {
  time: string;
  mgasPerSec: number;
  txPerSec: number;
  fillRate: number;
}

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
  const timeSeries = useMemo(() => {
    return isHistoricalMode ? {
      timestamps: historicalTimeSeries.timestamps,
      mgasPerSec: historicalTimeSeries.mgasPerSec,
      txPerSec: historicalTimeSeries.txPerSec,
      fillRate: historicalTimeSeries.blockFillRate,
    } : liveTimeSeries;
  }, [isHistoricalMode, historicalTimeSeries, liveTimeSeries]);

  // Header snapshot — the WS manager's frozen flag already prevents store updates
  // to these fields after the test duration is reached, so no component-level
  // freeze is needed.
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
    const maxDisplayPoints = 300;
    const totalPoints = timeSeries.timestamps.length;

    if (totalPoints === 0) return [];

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

    const baseTimestamp = timeSeries.timestamps[startIndex] ?? 0;

    const availablePoints = totalPoints - startIndex;
    const windowStart = availablePoints <= maxDisplayPoints
      ? startIndex
      : totalPoints - maxDisplayPoints;

    // Trailing moving average (causal) — ~3 seconds at 200ms sample interval,
    // matching the history view's smoothing for visual consistency.
    const smoothingWindow = 15;
    const smooth = (arr: number[], idx: number): number => {
      const start = Math.max(0, idx - smoothingWindow + 1);
      let sum = 0;
      let count = 0;
      for (let j = start; j <= idx; j++) {
        sum += arr[j] ?? 0;
        count++;
      }
      return count > 0 ? sum / count : 0;
    };

    const chartPoints: ChartPoint[] = [];

    for (let i = windowStart; i < totalPoints; i++) {
      const relativeSeconds = Math.round(timeSeries.timestamps[i] - baseTimestamp);
      const minutes = Math.floor(relativeSeconds / 60);
      const seconds = relativeSeconds % 60;
      const timeLabel = `${minutes}:${seconds.toString().padStart(2, '0')}`;

      chartPoints.push({
        time: timeLabel,
        mgasPerSec: smooth(timeSeries.mgasPerSec, i),
        txPerSec: smooth(timeSeries.txPerSec, i),
        fillRate: smooth(timeSeries.fillRate, i),
      });
    }

    return chartPoints;
  }, [timeSeries]);

  // Memoize the entire Recharts tree so it doesn't re-render when unrelated
  // store fields change (e.g. txConfirmedCount during verification).
  // The WS manager's frozen flag stops updating chartTimeSeries after the test
  // duration, so chartData is naturally stable after freeze.
  const chartElement = useMemo(() => {
    if (chartData.length === 0) return null;
    return (
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
                stroke={COLORS.mgas}
                fontSize={10}
                tickLine={false}
                label={{
                  value: "Mgas/s",
                  angle: -90,
                  position: "insideLeft",
                  style: { fill: COLORS.mgas, fontSize: 10 },
                }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke={COLORS.tps}
                fontSize={10}
                tickLine={false}
                label={{
                  value: "tx/s",
                  angle: 90,
                  position: "insideRight",
                  style: { fill: COLORS.tps, fontSize: 10 },
                }}
              />
            </>
          ) : (
            <YAxis
              yAxisId="left"
              stroke={COLORS.tps}
              fontSize={10}
              tickLine={false}
              label={{
                value: "tx/s",
                angle: -90,
                position: "insideLeft",
                style: { fill: COLORS.tps, fontSize: 10 },
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
                stroke={COLORS.mgas}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
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
                isAnimationActive={false}
              />
            </>
          )}
          <Line
            yAxisId={hasMgasData ? "right" : "left"}
            type="monotone"
            dataKey="txPerSec"
            name="tx/s"
            stroke={COLORS.tps}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    );
  }, [chartData, hasMgasData]);

  return (
    <Card className="col-span-2 flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
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
                <span className="font-mono font-semibold" style={{ color: COLORS.mgas }}>
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
                <span className="text-muted-foreground">TPS: </span>
                <span className="font-mono font-semibold" style={{ color: COLORS.tps }}>
                  {snapshot.currentTxPerSec.toFixed(0)}
                </span>
                <span className="text-muted-foreground"> / </span>
                <span className="font-mono font-semibold" style={{ color: COLORS.tps }}>
                  {snapshot.peakTxPerSec.toFixed(0)} peak
                </span>
              </div>
            </>
          ) : (
            <>
              <div>
                <span className="text-muted-foreground">Avg: </span>
                <span className="font-mono font-semibold" style={{ color: COLORS.tps }}>
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
      <CardContent className="flex-1 flex flex-col">
        <div className="min-h-[300px] flex-1 min-w-0 w-full">
          {chartElement ?? (
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
