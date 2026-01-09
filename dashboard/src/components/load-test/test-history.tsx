"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  RefreshCw,
  Clock,
  Activity,
  Zap,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  Trash2,
  LineChart,
  ExternalLink,
  Star,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import type {
  TestResult,
  TestRunDetail,
  TimeSeriesPoint,
  PaginatedTestRuns,
  TestRun,
  TestRunMetadataUpdate,
} from "@/types/load-test";
import { TxLogViewer } from "./tx-log-viewer";
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

const LOAD_GEN_API = "/api/loadgen";

// Transform Go API PascalCase to TypeScript camelCase for TestRun
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformTestRun(run: any): TestRun {
  return {
    id: run?.ID || run?.id || "",
    startedAt: run?.StartedAt || run?.startedAt || "",
    completedAt: run?.CompletedAt || run?.completedAt,
    pattern: run?.Pattern || run?.pattern || "constant",
    transactionType: run?.TransactionType || run?.transactionType || "eth-transfer",
    durationMs: run?.DurationMs || run?.durationMs || 0,
    txSent: run?.TxSent || run?.txSent || 0,
    txConfirmed: run?.TxConfirmed || run?.txConfirmed || 0,
    txFailed: run?.TxFailed || run?.txFailed || 0,
    averageTps: run?.AverageTPS || run?.averageTps || 0,
    peakTps: run?.PeakTPS || run?.peakTps || 0,
    latencyStats: run?.LatencyStats || run?.latencyStats,
    preconfLatency: run?.PreconfLatency || run?.preconfLatency,
    config: run?.Config || run?.config,
    status: run?.Status || run?.status || "completed",
    errorMessage: run?.ErrorMessage || run?.errorMessage,
    txLoggingEnabled: run?.TxLoggingEnabled ?? run?.txLoggingEnabled ?? false,
    executionLayer: run?.ExecutionLayer || run?.executionLayer || "reth",
    // Block metrics (aggregated)
    blockCount: run?.BlockCount || run?.blockCount,
    totalGasUsed: run?.TotalGasUsed || run?.totalGasUsed,
    avgFillRate: run?.AvgFillRate || run?.avgFillRate,
    peakMgasPerSec: run?.PeakMgasPerSec || run?.peakMgasPerSec,
    avgMgasPerSec: run?.AvgMgasPerSec || run?.avgMgasPerSec,
    // User metadata
    customName: run?.CustomName || run?.customName,
    isFavorite: run?.IsFavorite ?? run?.isFavorite ?? false,
  };
}

// Transform Go API PascalCase to TypeScript camelCase for TimeSeriesPoint
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformTimeSeriesPoint(p: any): TimeSeriesPoint {
  return {
    timestampMs: p?.TimestampMs || p?.timestampMs || 0,
    txSent: p?.TxSent || p?.txSent || 0,
    txConfirmed: p?.TxConfirmed || p?.txConfirmed || 0,
    txFailed: p?.TxFailed || p?.txFailed || 0,
    currentTps: p?.CurrentTPS || p?.currentTps || 0,
    targetTps: p?.TargetTPS || p?.targetTps || 0,
    pendingCount: p?.PendingCount || p?.pendingCount || 0,
    // Block metrics per sample period
    gasUsed: p?.GasUsed || p?.gasUsed,
    gasLimit: p?.GasLimit || p?.gasLimit,
    blockCount: p?.BlockCount || p?.blockCount,
    mgasPerSec: p?.MgasPerSec || p?.mgasPerSec,
    fillRate: p?.FillRate || p?.fillRate,
  };
}

interface HistoryItem extends TestResult {
  txLoggingEnabled?: boolean;
  customName?: string;
  isFavorite?: boolean;
}

interface TestHistoryProps {
  /** When true, uses full available height instead of fixed 400px scroll area */
  fullPage?: boolean;
}

export function TestHistory({ fullPage = false }: TestHistoryProps) {
  const router = useRouter();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [timeSeries, setTimeSeries] = useState<Record<string, TimeSeriesPoint[]>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);
  const [txLogViewerId, setTxLogViewerId] = useState<string | null>(null);
  const [txLoggingEnabled, setTxLoggingEnabled] = useState<boolean>(true);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState("");

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      // Try paginated API first
      const response = await fetch(`${LOAD_GEN_API}/history?limit=50&offset=0`);
      if (response.ok) {
        const data = await response.json();
        // Check if it's paginated response (supports both PascalCase and camelCase)
        const runs = data.Runs || data.runs;
        if (runs) {
          // Transform each run from PascalCase to camelCase and map to HistoryItem
          setHistory(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            runs.map((rawRun: any) => {
              const run = transformTestRun(rawRun);
              return {
                id: run.id,
                startedAt: run.startedAt,
                completedAt: run.completedAt || "",
                pattern: run.pattern,
                transactionType: run.transactionType,
                durationMs: run.durationMs,
                txSent: run.txSent,
                txConfirmed: run.txConfirmed,
                txFailed: run.txFailed,
                averageTps: run.averageTps,
                peakTps: run.peakTps,
                latency: run.latencyStats,
                preconfLatency: run.preconfLatency,
                config: run.config || {
                  pattern: run.pattern,
                  durationSec: Math.round(run.durationMs / 1000),
                },
                txLoggingEnabled: run.txLoggingEnabled,
                customName: run.customName,
                isFavorite: run.isFavorite,
              };
            })
          );
        } else {
          // Old format - array of TestResult
          setHistory((data as TestResult[]).reverse());
        }
      }
    } catch {
      // Silently fail - service might not be ready
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTestDetail = useCallback(async (testId: string) => {
    if (timeSeries[testId]) return; // Already loaded

    setLoadingDetail(testId);
    try {
      const response = await fetch(`${LOAD_GEN_API}/history/${testId}`);
      if (response.ok) {
        const rawData = await response.json();
        // Transform from PascalCase to camelCase
        const rawRun = rawData.Run || rawData.run;
        const rawTimeSeries = rawData.TimeSeries || rawData.timeSeries || [];

        const transformedTimeSeries = rawTimeSeries.map(transformTimeSeriesPoint);

        if (transformedTimeSeries.length > 0) {
          setTimeSeries((prev) => ({ ...prev, [testId]: transformedTimeSeries }));
        }
        if (rawRun) {
          const run = transformTestRun(rawRun);
          setTxLoggingEnabled(run.txLoggingEnabled);
        }
      }
    } catch {
      // Silently fail
    } finally {
      setLoadingDetail(null);
    }
  }, [timeSeries]);

  const deleteTest = useCallback(async (testId: string) => {
    if (!confirm("Are you sure you want to delete this test run?")) return;

    try {
      const response = await fetch(`${LOAD_GEN_API}/history/${testId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setHistory((prev) => prev.filter((h) => h.id !== testId));
        if (expanded === testId) setExpanded(null);
      }
    } catch {
      // Silently fail
    }
  }, [expanded]);

  const updateMetadata = useCallback(async (testId: string, update: TestRunMetadataUpdate) => {
    try {
      const response = await fetch(`${LOAD_GEN_API}/history/${testId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      if (response.ok) {
        const updatedRun = transformTestRun(await response.json());
        setHistory((prev) =>
          prev.map((h) =>
            h.id === testId
              ? { ...h, customName: updatedRun.customName, isFavorite: updatedRun.isFavorite }
              : h
          )
        );
      } else {
        console.error(`Failed to update test metadata: ${response.status} ${response.statusText}`);
      }
    } catch (err) {
      console.error("Failed to update test metadata:", err);
    }
  }, []);

  const toggleFavorite = useCallback(async (testId: string, currentFavorite: boolean) => {
    await updateMetadata(testId, { isFavorite: !currentFavorite });
  }, [updateMetadata]);

  const saveName = useCallback(async (testId: string, name: string) => {
    // Send empty string to clear name (not undefined which is omitted from JSON)
    await updateMetadata(testId, { customName: name.trim() || "" });
    setEditingNameId(null);
  }, [updateMetadata]);

  const startEditingName = useCallback((testId: string, currentName: string | undefined) => {
    setEditingNameId(testId);
    setEditingNameValue(currentName || "");
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleExpand = (testId: string) => {
    if (expanded === testId) {
      setExpanded(null);
    } else {
      setExpanded(testId);
      fetchTestDetail(testId);
    }
  };

  const formatDuration = (ms: number | undefined | null) => {
    if (ms == null) return "0s";
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const getSuccessRate = (result: HistoryItem) => {
    const sent = result.txSent ?? 0;
    const confirmed = result.txConfirmed ?? 0;
    if (sent === 0) return "0.0";
    return ((confirmed / sent) * 100).toFixed(1);
  };

  // Filter and sort: favorites first (already sorted by API), then filter if needed
  const filteredHistory = showFavoritesOnly
    ? history.filter((h) => h.isFavorite)
    : history;

  const favoriteCount = history.filter((h) => h.isFavorite).length;

  if (history.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base font-semibold">Test History</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchHistory}
            disabled={loading}
            className="h-8 w-8"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground text-center py-8">
            No tests completed yet. Run a load test to see history.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base font-semibold">
            Test History ({filteredHistory.length}{showFavoritesOnly ? ` of ${history.length}` : ""})
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant={showFavoritesOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              className="h-8 gap-1"
            >
              <Star className={`h-3.5 w-3.5 ${showFavoritesOnly ? "fill-current" : ""}`} />
              <span className="hidden sm:inline">Favorites</span>
              {favoriteCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {favoriteCount}
                </Badge>
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchHistory}
              disabled={loading}
              className="h-8 w-8"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {fullPage ? (
            <div className="space-y-2">
              {filteredHistory.map((result, index) => (
                <div
                  key={result.id || `history-${index}`}
                  className="border rounded-lg p-3 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    {/* Star button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(result.id, result.isFavorite ?? false);
                      }}
                      className="p-1 hover:bg-accent rounded -ml-1 mr-1"
                    >
                      <Star
                        className={`h-4 w-4 ${
                          result.isFavorite
                            ? "fill-yellow-400 text-yellow-400"
                            : "text-muted-foreground hover:text-yellow-400"
                        }`}
                      />
                    </button>

                    {/* Name (editable) or placeholder */}
                    <div className="flex-1 min-w-0 mr-2">
                      {editingNameId === result.id ? (
                        <Input
                          value={editingNameValue}
                          onChange={(e) => setEditingNameValue(e.target.value)}
                          onBlur={() => saveName(result.id, editingNameValue)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveName(result.id, editingNameValue);
                            if (e.key === "Escape") setEditingNameId(null);
                          }}
                          className="h-6 text-sm"
                          placeholder="Enter test name..."
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span
                          className={`text-sm cursor-pointer truncate block ${
                            result.customName
                              ? "font-medium"
                              : "text-muted-foreground italic"
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditingName(result.id, result.customName);
                          }}
                        >
                          {result.customName || "Click to add name"}
                        </span>
                      )}
                    </div>

                    {/* Row toggle and badges */}
                    <div
                      className="flex items-center gap-2 cursor-pointer"
                      onClick={() => handleExpand(result.id)}
                    >
                      <Badge variant="outline" className="font-mono text-xs">
                        {result.pattern || "unknown"}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className={`font-mono text-xs ${
                          (result as TestRun).executionLayer === "cdk-erigon"
                            ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                            : "bg-orange-500/10 text-orange-400 border-orange-500/20"
                        }`}
                      >
                        {(result as TestRun).executionLayer || "reth"}
                      </Badge>
                      <span className="text-sm text-muted-foreground hidden md:block">
                        {formatDate(result.startedAt)}
                      </span>
                    </div>
                    <div
                      className="flex items-center gap-3 text-xs cursor-pointer"
                      onClick={() => handleExpand(result.id)}
                    >
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatDuration(result.durationMs)}
                      </span>
                      <span className="flex items-center gap-1 font-mono">
                        <Activity className="h-3 w-3 text-blue-400" />
                        {(result.averageTps ?? 0).toFixed(1)} tx/s
                      </span>
                      <span className="flex items-center gap-1">
                        <CheckCircle className="h-3 w-3 text-green-400" />
                        {getSuccessRate(result)}%
                      </span>
                      {expanded === result.id ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  </div>

                  {expanded === result.id && (
                    <div className="mt-3 pt-3 border-t space-y-3 text-xs">
                      {/* Stats Grid */}
                      <div className="grid grid-cols-4 gap-2">
                        <div>
                          <div className="text-muted-foreground">Sent</div>
                          <div className="font-mono">{(result.txSent ?? 0).toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Confirmed</div>
                          <div className="font-mono text-green-400">
                            {(result.txConfirmed ?? 0).toLocaleString()}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Failed</div>
                          <div className="font-mono text-red-400">
                            {(result.txFailed ?? 0).toLocaleString()}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">TX Type</div>
                          <div className="font-mono">{result.transactionType}</div>
                        </div>
                      </div>

                      {/* Time Series Chart */}
                      {loadingDetail === result.id ? (
                        <div className="flex items-center justify-center py-4">
                          <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      ) : timeSeries[result.id] && timeSeries[result.id].length > 0 ? (
                        <div className="mt-2">
                          <div className="flex items-center gap-1 text-muted-foreground mb-2">
                            <LineChart className="h-3 w-3" />
                            <span>TPS Over Time</span>
                          </div>
                          <div className="h-32 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <RechartsLineChart
                                data={timeSeries[result.id]}
                                margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
                              >
                                <XAxis
                                  dataKey="timestampMs"
                                  tickFormatter={(ms) => `${(ms / 1000).toFixed(0)}s`}
                                  tick={{ fontSize: 10 }}
                                />
                                <YAxis tick={{ fontSize: 10 }} />
                                <Tooltip
                                  labelFormatter={(ms) => `${(Number(ms) / 1000).toFixed(1)}s`}
                                  contentStyle={{
                                    backgroundColor: "hsl(var(--background))",
                                    border: "1px solid hsl(var(--border))",
                                    fontSize: "12px",
                                  }}
                                />
                                <ReferenceLine
                                  y={timeSeries[result.id][0]?.targetTps || 0}
                                  stroke="#666"
                                  strokeDasharray="3 3"
                                  label={{ value: "Target", fontSize: 10 }}
                                />
                                <Line
                                  type="monotone"
                                  dataKey="currentTps"
                                  stroke="#3b82f6"
                                  strokeWidth={1.5}
                                  dot={false}
                                  name="Current TPS"
                                />
                              </RechartsLineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      ) : null}

                      {/* Latency Stats */}
                      {result.preconfLatency && result.preconfLatency.count > 0 && (
                        <div className="flex items-center gap-2 p-2 bg-green-500/10 rounded">
                          <Zap className="h-4 w-4 text-green-400" />
                          <span className="text-green-400">Preconf:</span>
                          <span className="font-mono">
                            p50 {(result.preconfLatency.p50 ?? 0).toFixed(0)}ms
                          </span>
                          <span className="text-muted-foreground">|</span>
                          <span className="font-mono">
                            p95 {(result.preconfLatency.p95 ?? 0).toFixed(0)}ms
                          </span>
                        </div>
                      )}

                      {result.latency && result.latency.count > 0 && (
                        <div className="flex items-center gap-2 p-2 bg-blue-500/10 rounded">
                          <Clock className="h-4 w-4 text-blue-400" />
                          <span className="text-blue-400">Confirm:</span>
                          <span className="font-mono">
                            p50 {(result.latency.p50 ?? 0).toFixed(0)}ms
                          </span>
                          <span className="text-muted-foreground">|</span>
                          <span className="font-mono">
                            p95 {(result.latency.p95 ?? 0).toFixed(0)}ms
                          </span>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 pt-2">
                        <Button
                          variant="default"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/load-test/history?id=${result.id}`);
                          }}
                          className="text-xs"
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          View Full Results
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setTxLogViewerId(result.id);
                          }}
                          className="text-xs"
                        >
                          <FileText className="h-3 w-3 mr-1" />
                          View TX Logs
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteTest(result.id);
                          }}
                          className="text-xs text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-2">
                {filteredHistory.map((result, index) => (
                  <div
                    key={result.id || `history-${index}`}
                    className="border rounded-lg p-3 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      {/* Star button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(result.id, result.isFavorite ?? false);
                        }}
                        className="p-1 hover:bg-accent rounded -ml-1 mr-1"
                      >
                        <Star
                          className={`h-4 w-4 ${
                            result.isFavorite
                              ? "fill-yellow-400 text-yellow-400"
                              : "text-muted-foreground hover:text-yellow-400"
                          }`}
                        />
                      </button>

                      {/* Name (editable) or placeholder */}
                      <div className="flex-1 min-w-0 mr-2">
                        {editingNameId === result.id ? (
                          <Input
                            value={editingNameValue}
                            onChange={(e) => setEditingNameValue(e.target.value)}
                            onBlur={() => saveName(result.id, editingNameValue)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveName(result.id, editingNameValue);
                              if (e.key === "Escape") setEditingNameId(null);
                            }}
                            className="h-6 text-sm"
                            placeholder="Enter test name..."
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span
                            className={`text-sm cursor-pointer truncate block ${
                              result.customName
                                ? "font-medium"
                                : "text-muted-foreground italic"
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditingName(result.id, result.customName);
                            }}
                          >
                            {result.customName || "Click to add name"}
                          </span>
                        )}
                      </div>

                      {/* Row toggle and badges */}
                      <div
                        className="flex items-center gap-2 cursor-pointer"
                        onClick={() => handleExpand(result.id)}
                      >
                        <Badge variant="outline" className="font-mono text-xs">
                          {result.pattern}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className={`font-mono text-xs ${
                            (result as TestRun).executionLayer === "cdk-erigon"
                              ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                              : "bg-orange-500/10 text-orange-400 border-orange-500/20"
                          }`}
                        >
                          {(result as TestRun).executionLayer || "reth"}
                        </Badge>
                        <span className="text-sm text-muted-foreground hidden md:block">
                          {formatDate(result.startedAt)}
                        </span>
                      </div>
                      <div
                        className="flex items-center gap-3 text-xs cursor-pointer"
                        onClick={() => handleExpand(result.id)}
                      >
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatDuration(result.durationMs)}
                        </span>
                        <span className="flex items-center gap-1 font-mono">
                          <Activity className="h-3 w-3 text-blue-400" />
                          {(result.averageTps ?? 0).toFixed(1)} tx/s
                        </span>
                        <span className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3 text-green-400" />
                          {getSuccessRate(result)}%
                        </span>
                        {expanded === result.id ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </div>
                    </div>

                    {expanded === result.id && (
                      <div className="mt-3 pt-3 border-t space-y-3 text-xs">
                        {/* Stats Grid */}
                        <div className="grid grid-cols-4 gap-2">
                          <div>
                            <div className="text-muted-foreground">Sent</div>
                            <div className="font-mono">{(result.txSent ?? 0).toLocaleString()}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Confirmed</div>
                            <div className="font-mono text-green-400">
                              {(result.txConfirmed ?? 0).toLocaleString()}
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Failed</div>
                            <div className="font-mono text-red-400">
                              {(result.txFailed ?? 0).toLocaleString()}
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">TX Type</div>
                            <div className="font-mono">{result.transactionType}</div>
                          </div>
                        </div>

                        {/* Time Series Chart */}
                        {loadingDetail === result.id ? (
                          <div className="flex items-center justify-center py-4">
                            <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        ) : timeSeries[result.id] && timeSeries[result.id].length > 0 ? (
                          <div className="mt-2">
                            <div className="flex items-center gap-1 text-muted-foreground mb-2">
                              <LineChart className="h-3 w-3" />
                              <span>TPS Over Time</span>
                            </div>
                            <div className="h-32 w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <RechartsLineChart
                                  data={timeSeries[result.id]}
                                  margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
                                >
                                  <XAxis
                                    dataKey="timestampMs"
                                    tickFormatter={(ms) => `${(ms / 1000).toFixed(0)}s`}
                                    tick={{ fontSize: 10 }}
                                  />
                                  <YAxis tick={{ fontSize: 10 }} />
                                  <Tooltip
                                    labelFormatter={(ms) => `${(Number(ms) / 1000).toFixed(1)}s`}
                                    contentStyle={{
                                      backgroundColor: "hsl(var(--background))",
                                      border: "1px solid hsl(var(--border))",
                                      fontSize: "12px",
                                    }}
                                  />
                                  <ReferenceLine
                                    y={timeSeries[result.id][0]?.targetTps || 0}
                                    stroke="#666"
                                    strokeDasharray="3 3"
                                    label={{ value: "Target", fontSize: 10 }}
                                  />
                                  <Line
                                    type="monotone"
                                    dataKey="currentTps"
                                    stroke="#3b82f6"
                                    strokeWidth={1.5}
                                    dot={false}
                                    name="Current TPS"
                                  />
                                </RechartsLineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        ) : null}

                        {/* Latency Stats */}
                        {result.preconfLatency && result.preconfLatency.count > 0 && (
                          <div className="flex items-center gap-2 p-2 bg-green-500/10 rounded">
                            <Zap className="h-4 w-4 text-green-400" />
                            <span className="text-green-400">Preconf:</span>
                            <span className="font-mono">
                              p50 {(result.preconfLatency.p50 ?? 0).toFixed(0)}ms
                            </span>
                            <span className="text-muted-foreground">|</span>
                            <span className="font-mono">
                              p95 {(result.preconfLatency.p95 ?? 0).toFixed(0)}ms
                            </span>
                          </div>
                        )}

                        {result.latency && result.latency.count > 0 && (
                          <div className="flex items-center gap-2 p-2 bg-blue-500/10 rounded">
                            <Clock className="h-4 w-4 text-blue-400" />
                            <span className="text-blue-400">Confirm:</span>
                            <span className="font-mono">
                              p50 {(result.latency.p50 ?? 0).toFixed(0)}ms
                            </span>
                            <span className="text-muted-foreground">|</span>
                            <span className="font-mono">
                              p95 {(result.latency.p95 ?? 0).toFixed(0)}ms
                            </span>
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 pt-2">
                          <Button
                            variant="default"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/load-test/history?id=${result.id}`);
                            }}
                            className="text-xs"
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            View Full Results
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setTxLogViewerId(result.id);
                            }}
                            className="text-xs"
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            View TX Logs
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteTest(result.id);
                            }}
                            className="text-xs text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* TX Log Viewer Dialog */}
      <TxLogViewer
        testId={txLogViewerId || ""}
        open={!!txLogViewerId}
        onClose={() => setTxLogViewerId(null)}
        txLoggingEnabled={txLoggingEnabled}
      />
    </>
  );
}
