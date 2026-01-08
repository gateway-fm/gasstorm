"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useGoLoadTestStore } from "@/stores/go-load-test-store";
import { formatDuration } from "@/lib/statistics";
import { cn } from "@/lib/utils";

const statusColors: Record<string, string> = {
  idle: "bg-muted",
  running: "bg-green-600",
  paused: "bg-yellow-600",
  completed: "bg-blue-600",
  error: "bg-red-600",
};

export function LoadTestRunner() {
  const {
    status,
    config,
    elapsedTime,
    currentRate,
    averageTps,
    targetTps,
    peakTps,
    durationSec,
    txSentCount,
    txConfirmedCount,
    txFailedCount,
    error,
    start,
    stop,
    reset,
  } = useGoLoadTestStore();

  const isMaxMode = config?.pattern === "max";

  // Use durationSec from Go load generator when running, fallback to config
  const duration = durationSec > 0 ? durationSec : (config?.duration ?? 60);
  const progress = duration > 0 ? (elapsedTime / duration) * 100 : 0;
  const remainingTime = Math.max(0, duration - elapsedTime);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-semibold">Load Test Runner</CardTitle>
        <Badge className={cn(statusColors[status], "capitalize")}>
          {status}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-mono">
              {formatDuration(elapsedTime * 1000)} / {formatDuration(duration * 1000)}
            </span>
          </div>
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Remaining: {formatDuration(remainingTime * 1000)}</span>
            <span>{progress.toFixed(1)}%</span>
          </div>
        </div>

        {/* Current Rate */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">
              Current TPS
            </p>
            <p className="text-2xl font-bold font-mono">
              {currentRate.toFixed(1)} <span className="text-sm font-normal">tx/s</span>
            </p>
            {targetTps > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Target: <span className="text-blue-400 font-mono">{targetTps.toLocaleString()}</span> tx/s
              </p>
            )}
            {isMaxMode && peakTps > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Peak: <span className="text-purple-400 font-mono">{peakTps.toLocaleString()}</span> tx/s
              </p>
            )}
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">TX Sent</p>
            <p className="text-2xl font-bold font-mono">{txSentCount.toLocaleString()}</p>
            {averageTps > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Avg: <span className="text-green-400 font-mono">{averageTps.toFixed(0)}</span> tx/s
              </p>
            )}
          </div>
        </div>

        {/* TX Stats */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-muted p-2">
            <p className="text-xs text-muted-foreground">Pending</p>
            <p className="font-mono font-semibold">
              {Math.max(0, txSentCount - txConfirmedCount - txFailedCount)}
            </p>
          </div>
          <div className="rounded-lg bg-green-500/10 p-2">
            <p className="text-xs text-muted-foreground">Confirmed</p>
            <p className="font-mono font-semibold text-green-500">{txConfirmedCount.toLocaleString()}</p>
          </div>
          <div className="rounded-lg bg-red-500/10 p-2">
            <p className="text-xs text-muted-foreground">Failed</p>
            <p className="font-mono font-semibold text-red-500">{txFailedCount.toLocaleString()}</p>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}

        {/* Controls */}
        <div className="flex gap-2 pt-2">
          {status === "idle" && (
            <Button className="flex-1" onClick={start}>
              Start Test
            </Button>
          )}
          {status === "running" && (
            <Button variant="destructive" className="flex-1" onClick={stop}>
              Stop
            </Button>
          )}
          {(status === "completed" || status === "error") && (
            <Button variant="outline" className="flex-1" onClick={reset}>
              Reset
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
