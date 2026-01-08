"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Clock, Calendar, Zap } from "lucide-react";
import type { TestRun } from "@/types/load-test";

interface HistoryHeaderProps {
  testRun: TestRun;
  onBack: () => void;
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function getPatternLabel(pattern: string): string {
  const labels: Record<string, string> = {
    constant: "Constant Rate",
    ramp: "Ramp Up",
    spike: "Spike",
    max: "Max Throughput",
    stress: "Stress Test",
  };
  return labels[pattern] || pattern;
}

function getTxTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    "eth-transfer": "ETH Transfer",
    "erc20-transfer": "ERC20 Transfer",
    "erc20-approve": "ERC20 Approve",
    "uniswap-swap": "Uniswap Swap",
    "storage-write": "Storage Write",
    "heavy-compute": "Heavy Compute",
  };
  return labels[type] || type;
}

export function HistoryHeader({ testRun, onBack }: HistoryHeaderProps) {
  const config = testRun.config;

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      {/* Left side: Back button + title */}
      <div className="space-y-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2 -ml-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Load Test
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Test Results</h1>
          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {formatDateTime(testRun.startedAt)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {formatDuration(testRun.durationMs)}
            </span>
          </div>
        </div>
      </div>

      {/* Right side: Configuration card */}
      <Card className="w-full md:w-96">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Test Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {/* Pattern */}
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Pattern</span>
            <Badge variant="outline">{getPatternLabel(testRun.pattern)}</Badge>
          </div>

          {/* Transaction Type */}
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Transaction Type</span>
            <span className="font-mono text-xs">{getTxTypeLabel(testRun.transactionType)}</span>
          </div>

          {/* Pattern-specific config */}
          {testRun.pattern === "constant" && config?.constantRate && (
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Target Rate</span>
              <span className="font-mono">{config.constantRate} tx/s</span>
            </div>
          )}

          {testRun.pattern === "ramp" && (
            <>
              {config?.rampStart !== undefined && config?.rampEnd !== undefined && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Ramp Range</span>
                  <span className="font-mono">
                    {config.rampStart} → {config.rampEnd} tx/s
                  </span>
                </div>
              )}
              {config?.rampSteps !== undefined && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Steps</span>
                  <span className="font-mono">{config.rampSteps}</span>
                </div>
              )}
            </>
          )}

          {testRun.pattern === "spike" && (
            <>
              {config?.baselineRate !== undefined && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Baseline Rate</span>
                  <span className="font-mono">{config.baselineRate} tx/s</span>
                </div>
              )}
              {config?.spikeRate !== undefined && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Spike Rate</span>
                  <span className="font-mono">{config.spikeRate} tx/s</span>
                </div>
              )}
            </>
          )}

          {testRun.pattern === "max" && (
            <>
              {config?.maxInitialRate !== undefined && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Initial Rate</span>
                  <span className="font-mono">{config.maxInitialRate} tx/s</span>
                </div>
              )}
              {config?.maxTargetPending !== undefined && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Target Pending</span>
                  <span className="font-mono">{config.maxTargetPending}</span>
                </div>
              )}
            </>
          )}

          {testRun.pattern === "stress" && config?.stressConfig && (
            <>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Accounts</span>
                <span className="font-mono">{config.stressConfig.numAccounts}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Target TPS</span>
                <span className="font-mono">{config.stressConfig.targetTps} tx/s</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Tip Range</span>
                <span className="font-mono">
                  {config.stressConfig.minTipGwei} - {config.stressConfig.maxTipGwei} gwei
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
