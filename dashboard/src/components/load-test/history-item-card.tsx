"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Pencil,
  Square,
  CheckSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { TestResult, TimeSeriesPoint, TestRun } from "@/types/load-test";

/**
 * Apply a simple moving average to smooth spiky time series data.
 * Uses a centered window to avoid shifting the data.
 */
function smoothTimeSeries(data: TimeSeriesPoint[], windowSize: number): TimeSeriesPoint[] {
  if (data.length < windowSize) return data;

  const half = Math.floor(windowSize / 2);
  return data.map((point, i) => {
    const start = Math.max(0, i - half);
    const end = Math.min(data.length, i + half + 1);
    const window = data.slice(start, end);

    const avgTps = window.reduce((sum, p) => sum + (p.currentTps || 0), 0) / window.length;
    const avgMgas = window.reduce((sum, p) => sum + (p.mgasPerSec || 0), 0) / window.length;

    return {
      ...point,
      currentTps: avgTps,
      mgasPerSec: avgMgas,
    };
  });
}

export interface HistoryItem extends TestResult {
  txLoggingEnabled?: boolean;
  customName?: string;
  isFavorite?: boolean;
  /** True when test just completed but is still being saved to storage */
  isSaving?: boolean;
}

interface HistoryItemCardProps {
  result: HistoryItem;
  expanded: boolean;
  onToggleExpand: () => void;
  timeSeries?: TimeSeriesPoint[];
  loadingDetail: boolean;
  editingName: boolean;
  editingNameValue: string;
  onEditingNameChange: (value: string) => void;
  onSaveName: () => void;
  onCancelEditName: () => void;
  onStartEditName: () => void;
  onToggleFavorite: () => void;
  onViewFullResults: () => void;
  onViewTxLogs: () => void;
  onDelete: () => void;
  // Compare mode props
  compareMode?: boolean;
  selectedForCompare?: boolean;
  onToggleCompareSelect?: () => void;
}

export function formatDuration(ms: number | undefined | null): string {
  if (ms == null) return "0s";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function getSuccessRate(result: HistoryItem): string {
  const sent = result.txSent ?? 0;
  const confirmed = result.txConfirmed ?? 0;
  if (sent === 0) return "0.0";
  return ((confirmed / sent) * 100).toFixed(1);
}

export function HistoryItemCard({
  result,
  expanded,
  onToggleExpand,
  timeSeries,
  loadingDetail,
  editingName,
  editingNameValue,
  onEditingNameChange,
  onSaveName,
  onCancelEditName,
  onStartEditName,
  onToggleFavorite,
  onViewFullResults,
  onViewTxLogs,
  onDelete,
  compareMode = false,
  selectedForCompare = false,
  onToggleCompareSelect,
}: HistoryItemCardProps) {
  const isSaving = result.isSaving ?? false;

  return (
    <div
      className={cn(
        "border rounded-lg p-3 transition-colors",
        selectedForCompare && "border-info bg-info/5",
        isSaving ? "opacity-70 animate-pulse" : "hover:bg-accent/50"
      )}
    >
      <div className="flex items-center justify-between">
        {/* Compare checkbox (when in compare mode) */}
        {compareMode && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleCompareSelect?.();
            }}
            className="p-1 hover:bg-accent rounded -ml-1 mr-1"
          >
            {selectedForCompare ? (
              <CheckSquare className="h-4 w-4 text-info" />
            ) : (
              <Square className="h-4 w-4 text-muted-foreground hover:text-info" />
            )}
          </button>
        )}

        {/* Star button (hidden in compare mode) */}
        {!compareMode && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
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
        )}

        {/* Name with edit icon */}
        <div
          className="flex-1 min-w-0 mr-2 flex items-center gap-1 cursor-pointer"
          onClick={onToggleExpand}
        >
          {editingName ? (
            <Input
              value={editingNameValue}
              onChange={(e) => onEditingNameChange(e.target.value)}
              onBlur={onSaveName}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSaveName();
                if (e.key === "Escape") onCancelEditName();
              }}
              className="h-6 text-sm max-w-[200px]"
              placeholder="Enter test name..."
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <>
              <span className="text-sm font-medium truncate">
                {result.customName || `${result.pattern} test`}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onStartEditName();
                }}
                className="p-1 hover:bg-accent rounded opacity-50 hover:opacity-100 transition-opacity"
                title="Edit name"
              >
                <Pencil className="h-3 w-3" />
              </button>
            </>
          )}
        </div>

        {/* Row toggle and badges */}
        <div
          className="flex items-center gap-2 cursor-pointer"
          onClick={onToggleExpand}
        >
          {isSaving && (
            <Badge variant="secondary" className="font-mono text-xs bg-warning/20 text-warning animate-pulse">
              <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
              Saving...
            </Badge>
          )}
          <Badge variant="outline" className="font-mono text-xs">
            {result.pattern || "unknown"}
          </Badge>
          <Badge
            variant="secondary"
            className={`font-mono text-xs ${
              (result as TestRun).executionLayer === "cdk-erigon"
                ? "bg-primary/10 text-primary border-primary/20"
                : "bg-warning/10 text-warning border-warning/20"
            }`}
          >
            {(result as TestRun).executionLayer || "reth"}
          </Badge>
          {(result as TestRun).environment?.builderBlockAttestationEnabled === true && (
            <Badge
              variant="secondary"
              className="font-mono text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
            >
              HSM ON
            </Badge>
          )}
          <span className="text-sm text-muted-foreground hidden md:block">
            {formatDate(result.startedAt)}
          </span>
        </div>
        <div
          className="flex items-center gap-3 text-xs cursor-pointer"
          onClick={onToggleExpand}
        >
          <span className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatDuration(result.durationMs)}
          </span>
          <span className="flex items-center gap-1 font-mono">
            <Activity className="h-3 w-3 text-info" />
            {((result.averageTps ?? 0) > 0
              ? (result.averageTps ?? 0).toFixed(0)
              : ((result as TestRun).onChainTps ?? 0).toFixed(0)
            )} tx/s
          </span>
          {((result as TestRun).avgMgasPerSec ?? 0) > 0 && (
            <span className="flex items-center gap-1 font-mono text-warning hidden sm:flex">
              {((result as TestRun).avgMgasPerSec ?? 0).toFixed(0)} MGas/s
            </span>
          )}
          <span className="flex items-center gap-1">
            <CheckCircle className="h-3 w-3 text-success" />
            {getSuccessRate(result)}%
          </span>
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t space-y-3 text-xs">
          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-2">
            <div>
              <div className="text-muted-foreground">Sent</div>
              <div className="font-mono">{(result.txSent ?? 0).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Confirmed</div>
              <div className="font-mono text-success">
                {(result.txConfirmed ?? 0).toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Failed</div>
              <div className="font-mono text-destructive">
                {(result.txFailed ?? 0).toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">TX Type</div>
              <div className="font-mono">
                {result.pattern === "realistic" ? "Mixed" : result.transactionType}
              </div>
            </div>
          </div>

          {/* Time Series Chart */}
          {loadingDetail ? (
            <div className="flex items-center justify-center py-4">
              <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : timeSeries && timeSeries.length > 0 ? (
            <div className="mt-2">
              <div className="flex items-center gap-1 text-muted-foreground mb-2">
                <LineChart className="h-3 w-3" />
                <span>TPS & MGas/s Over Time</span>
              </div>
              <div className="h-32 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsLineChart
                    data={smoothTimeSeries(timeSeries, 5)}
                    margin={{ top: 5, right: 35, left: -20, bottom: 5 }}
                  >
                    <XAxis
                      dataKey="timestampMs"
                      tickFormatter={(ms) => `${(ms / 1000).toFixed(0)}s`}
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                    <Tooltip
                      labelFormatter={(ms) => `${(Number(ms) / 1000).toFixed(1)}s`}
                      formatter={(value, name) => [
                        name === "MGas/s" ? Number(value).toFixed(1) : Number(value).toFixed(0),
                        name,
                      ]}
                      contentStyle={{
                        backgroundColor: "hsl(var(--background))",
                        border: "1px solid hsl(var(--border))",
                        fontSize: "12px",
                      }}
                    />
                    <ReferenceLine
                      yAxisId="left"
                      y={timeSeries[0]?.targetTps || 0}
                      stroke="#666"
                      strokeDasharray="3 3"
                      label={{ value: "Target", fontSize: 10 }}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="currentTps"
                      stroke="#3b82f6"
                      strokeWidth={1.5}
                      dot={false}
                      name="TPS"
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="mgasPerSec"
                      stroke="#22c55e"
                      strokeWidth={1.5}
                      dot={false}
                      name="MGas/s"
                    />
                  </RechartsLineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : null}

          {/* Latency Stats - only show preconf for preconf-capable layers */}
          {(result as TestRun).executionLayer !== "cdk-erigon" &&
           (result as TestRun).executionLayer !== "gravity-reth" &&
           result.preconfLatency && result.preconfLatency.count > 0 && (
            <div className="flex items-center gap-2 p-2 bg-success/10 rounded">
              <Zap className="h-4 w-4 text-success" />
              <span className="text-success">Preconf:</span>
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
            <div className="flex items-center gap-2 p-2 bg-info/10 rounded">
              <Clock className="h-4 w-4 text-info" />
              <span className="text-info">Confirm:</span>
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
                onViewFullResults();
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
                onViewTxLogs();
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
                onDelete();
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
  );
}
