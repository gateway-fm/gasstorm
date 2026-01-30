"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useGoLoadTestStore } from "@/stores/go-load-test-store";
import { formatDuration } from "@/lib/statistics";
import { cn } from "@/lib/utils";

const statusColors: Record<string, string> = {
  idle: "bg-muted text-muted-foreground",
  initializing: "bg-warning text-warning-foreground",
  running: "bg-success text-success-foreground",
  paused: "bg-warning text-warning-foreground",
  verifying: "bg-primary text-primary-foreground",
  completed: "bg-info text-info-foreground",
  error: "bg-destructive text-destructive-foreground",
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
    isStarting,
    start,
    stop,
    reset,
    // Initialization progress
    initPhase,
    initProgress,
    accountsTotal,
    accountsGenerated,
    fundingTxsSent,
    fundingTxsTotal,
    contractsDeployed,
    contractsTotal,
  } = useGoLoadTestStore();

  const isAdaptiveMode = config?.pattern === "adaptive";

  // Use durationSec from Go load generator when running, fallback to config
  const duration = durationSec > 0 ? durationSec : (config?.duration ?? 60);
  // Clamp progress to 100% max to handle tests that run longer than configured
  const progress = duration > 0 ? Math.min((elapsedTime / duration) * 100, 100) : 0;
  const remainingTime = Math.max(0, duration - elapsedTime);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-semibold font-mono">Load Test Runner</CardTitle>
        <Badge className={cn(statusColors[status], "capitalize border-0")}>
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
            <p className="text-xs text-muted-foreground font-mono">
              Current TPS
            </p>
            <p className="text-2xl font-bold font-mono">
              {currentRate.toFixed(1)} <span className="text-sm font-normal">tx/s</span>
            </p>
            {targetTps > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Target: <span className="text-info font-mono">{targetTps.toLocaleString()}</span> tx/s
              </p>
            )}
            {isAdaptiveMode && peakTps > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Peak: <span className="text-primary font-mono">{peakTps.toLocaleString()}</span> tx/s
              </p>
            )}
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground font-mono">TX Sent</p>
            <p className="text-2xl font-bold font-mono">{txSentCount.toLocaleString()}</p>
            {averageTps > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Avg: <span className="text-success font-mono">{averageTps.toFixed(0)}</span> tx/s
              </p>
            )}
          </div>
        </div>

        {/* TX Stats */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-muted p-2">
            <p className="text-xs text-muted-foreground font-mono">Pending</p>
            <p className="font-mono font-semibold">
              {Math.max(0, txSentCount - txConfirmedCount - txFailedCount)}
            </p>
          </div>
          <div className="rounded-lg bg-success/10 p-2">
            <p className="text-xs text-muted-foreground font-mono">Confirmed</p>
            <p className="font-mono font-semibold text-success">{txConfirmedCount.toLocaleString()}</p>
          </div>
          <div className="rounded-lg bg-destructive/10 p-2">
            <p className="text-xs text-muted-foreground font-mono">Failed</p>
            <p className="font-mono font-semibold text-destructive">{txFailedCount.toLocaleString()}</p>
          </div>
        </div>

        {/* Initialization Progress */}
        {status === "initializing" && (
          <div className="rounded-lg bg-warning/10 border border-warning/20 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-warning" />
              <p className="text-sm font-medium text-warning">Initializing Test</p>
            </div>
            <p className="text-sm text-muted-foreground">{initProgress || "Starting..."}</p>

            {/* Progress details based on phase */}
            {initPhase === "generating_accounts" && accountsTotal > 0 && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Generating accounts...</span>
                <span className="font-mono">{accountsGenerated} / {accountsTotal}</span>
              </div>
            )}
            {initPhase === "funding_accounts" && fundingTxsTotal > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Funding transactions sent</span>
                  <span className="font-mono">{fundingTxsSent} / {fundingTxsTotal}</span>
                </div>
                <Progress value={fundingTxsTotal > 0 ? (fundingTxsSent / fundingTxsTotal) * 100 : 0} className="h-1" />
                {accountsTotal > fundingTxsTotal && (
                  <p className="text-xs text-muted-foreground/70">
                    ({accountsTotal - fundingTxsTotal} built-in accounts already funded)
                  </p>
                )}
              </div>
            )}
            {initPhase === "waiting_for_funding" && fundingTxsSent > 0 && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Waiting for confirmations...</span>
                <span className="font-mono">{fundingTxsSent} TXs</span>
              </div>
            )}
            {initPhase === "deploying_contracts" && contractsTotal > 0 && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Deploying contracts...</span>
                <span className="font-mono">{contractsDeployed} / {contractsTotal}</span>
              </div>
            )}
          </div>
        )}

        {/* Verification Progress */}
        {status === "verifying" && (
          <div className="rounded-lg bg-primary/10 border border-primary/20 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <p className="text-sm font-medium text-primary">Verifying Results</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Test finished. Verifying on-chain results...
            </p>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Controls */}
        <div className="flex gap-2 pt-2">
          {status === "idle" && (
            <Button className="flex-1" onClick={start} disabled={isStarting}>
              {isStarting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starting...
                </>
              ) : (
                "Start Test"
              )}
            </Button>
          )}
          {status === "initializing" && (
            <Button variant="destructive" className="flex-1" onClick={stop}>
              Cancel
            </Button>
          )}
          {status === "running" && (
            <Button variant="destructive" className="flex-1" onClick={stop}>
              Stop
            </Button>
          )}
          {status === "verifying" && (
            <Button variant="outline" className="flex-1" disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Verifying...
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
