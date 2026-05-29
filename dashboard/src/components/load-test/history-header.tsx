"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Clock, Calendar, Zap, FileJson, FileSpreadsheet } from "lucide-react";
import type { TestRun } from "@/types/load-test";
import { useMetricsStore } from "@/stores/metrics-store";
import { useGoLoadTestStore } from "@/stores/go-load-test-store";

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
    adaptive: "Adaptive",
    realistic: "Realistic",
  };
  return labels[pattern] || pattern;
}

function getTxTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    "eth-transfer": "ETH Transfer",
    "erc20-transfer": "ERC20 Transfer",
    "erc20-approve": "ERC20 Approve",
    "erc721-transfer": "ERC721 Transfer",
    "uniswap-swap": "Uniswap Swap",
    "storage-write": "Storage Write",
    "heavy-compute": "Heavy Compute",
  };
  return labels[type] || type;
}

// Export helpers
function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function generateTestFilename(testRun: TestRun, extension: string): string {
  const date = new Date(testRun.startedAt);
  const dateStr = date.toISOString().split("T")[0];
  const timeStr = date.toISOString().split("T")[1].slice(0, 5).replace(":", "");
  return `load-test-${testRun.pattern}-${dateStr}-${timeStr}.${extension}`;
}

interface ExportData {
  testRun: TestRun;
  timeSeries: { timestamps: number[]; txPerSec: number[]; mgasPerSec: number[]; blockFillRate: number[] };
  latencyStats?: { min: number; max: number; avg: number; p50: number; p95: number; p99: number; count: number };
  preconfStats?: { min: number; max: number; avg: number; p50: number; p95: number; p99: number; count: number };
  snapshot: { peakMgasPerSec: number; peakTxPerSec: number; averageFillRate: number; totalTransactions: number; blocksProduced: number };
}

export function HistoryHeader({ testRun, onBack }: HistoryHeaderProps) {
  const config = testRun?.config;
  const pattern = testRun?.pattern || "unknown";
  const transactionType = testRun?.transactionType || "unknown";

  const timeSeries = useMetricsStore((s) => s.timeSeries);
  const snapshot = useMetricsStore((s) => s.snapshot);
  const latencyStats = useGoLoadTestStore((s) => s.latencyStats);
  const preconfStats = useGoLoadTestStore((s) => s.preconfLatencyStats);

  const handleExportJSON = () => {
    const exportData: ExportData = {
      testRun,
      timeSeries,
      latencyStats: latencyStats ? {
        min: latencyStats.min,
        max: latencyStats.max,
        avg: latencyStats.avg,
        p50: latencyStats.p50,
        p95: latencyStats.p95,
        p99: latencyStats.p99,
        count: latencyStats.count,
      } : undefined,
      preconfStats: preconfStats ? {
        min: preconfStats.min,
        max: preconfStats.max,
        avg: preconfStats.avg,
        p50: preconfStats.p50,
        p95: preconfStats.p95,
        p99: preconfStats.p99,
        count: preconfStats.count,
      } : undefined,
      snapshot: {
        peakMgasPerSec: snapshot.peakMgasPerSec,
        peakTxPerSec: snapshot.peakTxPerSec,
        averageFillRate: snapshot.averageFillRate,
        totalTransactions: snapshot.totalTransactions,
        blocksProduced: snapshot.blocksProduced,
      },
    };
    const json = JSON.stringify(exportData, null, 2);
    downloadFile(json, generateTestFilename(testRun, "json"), "application/json");
  };

  const handleExportCSV = () => {
    const lines: string[] = [];
    const env = testRun.environment;

    // Summary section
    lines.push("# Load Test Results");
    lines.push(`# Test ID: ${testRun.id}`);
    lines.push(`# Started: ${testRun.startedAt}`);
    lines.push(`# Pattern: ${testRun.pattern}`);
    lines.push(`# Transaction Type: ${testRun.transactionType}`);
    lines.push(`# Duration: ${testRun.durationMs}ms`);
    lines.push(`# Execution Layer: ${testRun.executionLayer || "reth"}`);
    lines.push("#");

    // Node information (if available)
    if (env) {
      lines.push("# Node Information");
      lines.push(`# Node Name: ${env.nodeName || "N/A"}`);
      lines.push(`# Node Version: ${env.nodeVersion || "N/A"}`);
      lines.push(`# Chain ID: ${env.chainId || "N/A"}`);
      lines.push(`# Block Builder Mode: ${env.useBlockBuilder ? "External" : "Internal Sequencer"}`);
      lines.push("#");
    }

    // Transaction summary
    lines.push("# Transaction Summary");
    lines.push(`# TX Sent: ${testRun.txSent}`);
    lines.push(`# TX Confirmed: ${testRun.txConfirmed}`);
    lines.push(`# TX Failed: ${testRun.txFailed}`);
    lines.push(`# Success Rate: ${testRun.txSent > 0 ? ((testRun.txConfirmed / testRun.txSent) * 100).toFixed(1) : 0}%`);
    lines.push("#");

    // Performance summary
    lines.push("# Performance Summary");
    lines.push(`# Average TPS: ${testRun.averageTps?.toFixed(1) || "N/A"}`);
    lines.push(`# Peak TPS: ${testRun.peakTps || "N/A"}`);
    lines.push(`# Peak MGas/s: ${snapshot.peakMgasPerSec?.toFixed(2) || "N/A"}`);
    lines.push(`# Avg Fill Rate: ${snapshot.averageFillRate?.toFixed(1) || "N/A"}%`);
    lines.push(`# Blocks Produced: ${snapshot.blocksProduced || "N/A"}`);
    lines.push("#");

    // Latency stats
    if (latencyStats && latencyStats.count > 0) {
      lines.push("# Confirmation Latency (ms)");
      lines.push(`# Min: ${latencyStats.min}, Max: ${latencyStats.max}, Avg: ${latencyStats.avg?.toFixed(0)}`);
      lines.push(`# P50: ${latencyStats.p50}, P95: ${latencyStats.p95}, P99: ${latencyStats.p99}`);
      lines.push("#");
    }

    if (preconfStats && preconfStats.count > 0) {
      lines.push("# Preconfirmation Latency (ms)");
      lines.push(`# Min: ${preconfStats.min}, Max: ${preconfStats.max}, Avg: ${preconfStats.avg?.toFixed(0)}`);
      lines.push(`# P50: ${preconfStats.p50}, P95: ${preconfStats.p95}, P99: ${preconfStats.p99}`);
      lines.push("#");
    }

    // Time series data header
    lines.push("");
    const headers = ["timestamp_sec", "tx_per_sec", "mgas_per_sec", "fill_rate_pct"];
    lines.push(headers.join(","));

    // Time series data rows
    const rows = timeSeries.timestamps.map((ts, i) => [
      ts.toFixed(1),
      (timeSeries.txPerSec[i] ?? 0).toFixed(2),
      (timeSeries.mgasPerSec[i] ?? 0).toFixed(3),
      (timeSeries.blockFillRate[i] ?? 0).toFixed(1),
    ].join(","));

    lines.push(...rows);

    const csv = lines.join("\n");
    downloadFile(csv, generateTestFilename(testRun, "csv"), "text/csv");
  };

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      {/* Left side: Back button + title + export */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-2 -ml-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Load Test
          </Button>
          <div className="flex items-center gap-1 ml-auto md:ml-4">
            <Button variant="outline" size="sm" onClick={handleExportJSON} className="gap-1.5 h-8">
              <FileJson className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">JSON</span>
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-1.5 h-8">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">CSV</span>
            </Button>
          </div>
        </div>
        <div>
          <h1 className="text-2xl font-bold">
            {testRun?.customName || "Test Results"}
          </h1>
          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {testRun?.startedAt ? formatDateTime(testRun.startedAt) : "Unknown"}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {testRun?.durationMs ? formatDuration(testRun.durationMs) : "Unknown"}
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
          {/* Node Name */}
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Node</span>
            <Badge
              variant="secondary"
              className={`font-mono text-xs ${
                (testRun?.environment?.nodeName || testRun?.executionLayer) === "cdk-erigon"
                  ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                  : (testRun?.environment?.nodeName || testRun?.executionLayer) === "gravity-reth"
                  ? "bg-green-500/10 text-green-400 border-green-500/20"
                  : "bg-orange-500/10 text-orange-400 border-orange-500/20"
              }`}
            >
              {testRun?.environment?.nodeName || testRun?.executionLayer || "op-reth"}
            </Badge>
          </div>

          {/* Node Version (if available) */}
          {testRun?.environment?.nodeVersion && (
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Version</span>
              <span className="font-mono text-xs truncate max-w-[200px]" title={testRun.environment.nodeVersion}>
                {testRun.environment.nodeVersion.length > 30
                  ? testRun.environment.nodeVersion.slice(0, 30) + "..."
                  : testRun.environment.nodeVersion}
              </span>
            </div>
          )}

          {/* Block Builder Mode */}
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Mode</span>
            <Badge
              variant="outline"
              className={`text-xs ${
                testRun?.environment?.useBlockBuilder !== false
                  ? "border-blue-500/30 text-blue-400"
                  : "border-gray-500/30 text-gray-400"
              }`}
            >
              {testRun?.environment?.useBlockBuilder !== false ? "External Builder" : "Internal Sequencer"}
            </Badge>
          </div>

          {/* Privacy Mode */}
          {config?.privacyMode && (
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Privacy</span>
              <Badge
                variant="secondary"
                className="text-xs bg-violet-500/10 text-violet-400 border-violet-500/30"
              >
                Through Privacy Proxy
              </Badge>
            </div>
          )}

          {/* Pattern */}
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Pattern</span>
            <Badge variant="outline">{getPatternLabel(pattern)}</Badge>
          </div>

          {/* Transaction Type */}
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Transaction Type</span>
            <span className="font-mono text-xs">
              {pattern === "realistic" ? "Mixed" : getTxTypeLabel(transactionType)}
            </span>
          </div>

          {/* Pattern-specific config */}
          {pattern === "constant" && config?.constantRate && (
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Target Rate</span>
              <span className="font-mono">{config.constantRate} tx/s</span>
            </div>
          )}

          {pattern === "ramp" && (
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

          {pattern === "spike" && (
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

          {pattern === "adaptive" && (
            <>
              {config?.adaptiveInitialRate !== undefined && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Initial Rate</span>
                  <span className="font-mono">{config.adaptiveInitialRate} tx/s</span>
                </div>
              )}
              {config?.adaptiveTargetPending !== undefined && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Target Pending</span>
                  <span className="font-mono">{config.adaptiveTargetPending}</span>
                </div>
              )}
            </>
          )}

          {pattern === "realistic" && config?.realisticConfig && (
            <>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Accounts</span>
                <span className="font-mono">{config.realisticConfig.numAccounts}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Target TPS</span>
                <span className="font-mono">{config.realisticConfig.targetTps} tx/s</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Tip Range</span>
                <span className="font-mono">
                  {config.realisticConfig.minTipGwei} - {config.realisticConfig.maxTipGwei} gwei
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
