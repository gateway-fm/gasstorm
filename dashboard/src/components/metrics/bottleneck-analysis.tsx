"use client";

import { useMemo, useRef, useEffect, useState, startTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGoLoadTestStore } from "@/stores/go-load-test-store";
import { useMetricsStore } from "@/stores/metrics-store";
import { useChainStore } from "@/stores/chain-store";
import { useBuilderMetricsStore } from "@/stores/builder-metrics-store";

type BottleneckType = "sender" | "block-builder" | "node" | "balanced";

interface BottleneckInfo {
  type: BottleneckType;
  title: string;
  description: string;
  evidence: string[];
  recommendation: string;
}

interface DetectionResult {
  detectedType: BottleneckType;
  evidence: string[];
  recentFillRate: number;
}

const HYSTERESIS_THRESHOLD = 3; // Need 3 consecutive detections to switch
const RECENT_BLOCKS_WINDOW = 10; // Use last 10 blocks for analysis

export function BottleneckAnalysis() {
  const { status } = useGoLoadTestStore();
  const { blockMetrics, timeSeries } = useMetricsStore();
  const { builder } = useChainStore();
  const { timing: builderTiming, connected: builderMetricsConnected } = useBuilderMetricsStore();

  // Don't show in historical mode (no block metrics available)
  const hasBlockMetrics = blockMetrics.length > 0;

  // Stable type with hysteresis - this is what we display
  const [stableType, setStableType] = useState<BottleneckType>("balanced");

  // Track candidate type and consecutive detections for hysteresis
  const candidateRef = useRef<{ type: BottleneckType | null; count: number }>({
    type: null,
    count: 0,
  });

  // Reset stable type when test is reset (status goes to idle)
  useEffect(() => {
    if (status === "idle") {
      startTransition(() => {
        setStableType("balanced");
      });
      candidateRef.current = { type: null, count: 0 };
    }
  }, [status]);

  // Compute detected type and evidence (raw detection without hysteresis)
  const detection = useMemo((): DetectionResult | null => {
    if (status === "idle") return null;

    // Need some data to analyze
    if (blockMetrics.length < 5) {
      return {
        detectedType: "balanced",
        evidence: [`${blockMetrics.length} blocks collected so far`],
        recentFillRate: 0,
      };
    }

    // Use RECENT blocks only (last 10) instead of entire test
    const recentBlocks = blockMetrics.slice(-RECENT_BLOCKS_WINDOW);

    // Use ACTUAL mempool size from builder, not cumulative lag
    const actualPending = builder.pendingTxCount;

    // Calculate recent averages (not lifetime)
    const recentFillRate = recentBlocks.reduce((sum, b) => sum + b.fillRate, 0) / recentBlocks.length;

    const recentTxPerSec = timeSeries.txPerSec.length > 0
      ? timeSeries.txPerSec.slice(-RECENT_BLOCKS_WINDOW).reduce((a, b) => a + b, 0) /
        Math.min(timeSeries.txPerSec.length, RECENT_BLOCKS_WINDOW)
      : 0;

    // Calculate recent block times
    const recentBlockTimes = recentBlocks.slice(1).map((block, i) =>
      block.arrivedAt - recentBlocks[i].arrivedAt
    );
    const recentAvgBlockTimeMs = recentBlockTimes.length > 0
      ? recentBlockTimes.reduce((a, b) => a + b, 0) / recentBlockTimes.length
      : 0;

    // Calculate average transactions per block (recent)
    const recentAvgTxPerBlock = recentBlocks.reduce((sum, b) => sum + b.transactionCount, 0) / recentBlocks.length;

    // Target block time from builder config
    const targetBlockTimeMs = builder.blockTimeMs || 1000;

    // Block time ratio (how close to target)
    const blockTimeRatio = targetBlockTimeMs > 0 ? recentAvgBlockTimeMs / targetBlockTimeMs : 0;
    const blocksOnSchedule = blockTimeRatio >= 0.8 && blockTimeRatio <= 1.3;

    // Detect bottleneck type
    let detectedType: BottleneckType;
    const evidence: string[] = [];

    // Priority 1: Node-limited (TXs waiting but not being included, blocks on schedule)
    const nodeLimited = actualPending > 10 && recentFillRate < 50 && blocksOnSchedule;

    // Priority 2: Block Builder-limited (blocks taking too long)
    const blockBuilderLimited = blockTimeRatio > 1.3;

    // Priority 3: Sender-limited (nothing waiting, blocks not full)
    const senderLimited = actualPending < 5 && recentFillRate < 70;

    if (nodeLimited) {
      detectedType = "node";
      evidence.push(`Mempool: ${actualPending} TXs waiting`);
      evidence.push(`Block fill rate: ${recentFillRate.toFixed(1)}% (recent ${RECENT_BLOCKS_WINDOW} blocks)`);
      evidence.push(`Block time: ${recentAvgBlockTimeMs.toFixed(0)}ms (on schedule)`);
      evidence.push(`Throughput: ${recentTxPerSec.toFixed(1)} tx/s`);
    } else if (blockBuilderLimited) {
      detectedType = "block-builder";
      evidence.push(`Target block time: ${targetBlockTimeMs}ms`);
      evidence.push(`Actual block time: ${recentAvgBlockTimeMs.toFixed(0)}ms (${blockTimeRatio.toFixed(1)}x target)`);
      evidence.push(`Avg tx/block: ${recentAvgTxPerBlock.toFixed(1)}`);
      evidence.push(`Block fill rate: ${recentFillRate.toFixed(1)}%`);
    } else if (senderLimited) {
      detectedType = "sender";
      evidence.push(`Mempool: ${actualPending} TXs waiting`);
      evidence.push(`Block fill rate: ${recentFillRate.toFixed(1)}%`);
      evidence.push(`Throughput: ${recentTxPerSec.toFixed(1)} tx/s`);
    } else {
      detectedType = "balanced";
      evidence.push(`Mempool: ${actualPending} TXs`);
      evidence.push(`Block fill rate: ${recentFillRate.toFixed(1)}%`);
      evidence.push(`Throughput: ${recentTxPerSec.toFixed(1)} tx/s`);
      evidence.push(`Block time: ${recentAvgBlockTimeMs.toFixed(0)}ms`);
    }

    return { detectedType, evidence, recentFillRate };
  }, [status, blockMetrics, timeSeries, builder.blockTimeMs, builder.pendingTxCount]);

  // Apply hysteresis in useEffect (not during render)
  useEffect(() => {
    if (!detection) return;

    const { detectedType } = detection;
    const candidate = candidateRef.current;

    if (detectedType === stableType) {
      // Same as current stable type - reset candidate tracking
      candidate.type = null;
      candidate.count = 0;
    } else if (detectedType === candidate.type) {
      // Same as candidate - increment
      candidate.count++;
      if (candidate.count >= HYSTERESIS_THRESHOLD) {
        // Use startTransition to defer non-urgent state update
        startTransition(() => {
          setStableType(detectedType);
        });
        candidate.type = null;
        candidate.count = 0;
      }
    } else {
      // New candidate
      candidate.type = detectedType;
      candidate.count = 1;
    }
  }, [detection, stableType]);

  // Build the final analysis using stable type
  const analysis = useMemo((): BottleneckInfo | null => {
    if (!detection) return null;

    const { evidence, recentFillRate } = detection;

    // Return appropriate info based on stable type
    switch (stableType) {
      case "node":
        return {
          type: "node",
          title: "Node (op-reth)",
          description: "The node has pending transactions but isn't including them in blocks fast enough.",
          evidence,
          recommendation: "Node execution is the bottleneck. Check CPU/memory resources or node configuration.",
        };
      case "block-builder":
        return {
          type: "block-builder",
          title: "Block Builder / Engine API",
          description: "Blocks are taking longer than the target interval to produce.",
          evidence,
          recommendation: "Engine API calls are slow. Consider optimizing op-reth or reducing block complexity.",
        };
      case "sender":
        return {
          type: "sender",
          title: "Transaction Sender",
          description: "The sender is not generating transactions fast enough to fill blocks.",
          evidence,
          recommendation: "Increase send rate or use Max mode to find the system limit.",
        };
      case "balanced":
      default:
        return {
          type: "balanced",
          title: "System Saturated",
          description: recentFillRate >= 80
            ? "System is running at capacity with blocks well-filled."
            : "System appears balanced. Increase load to find the bottleneck.",
          evidence,
          recommendation: recentFillRate >= 80
            ? "This is optimal. The system is processing at its maximum rate."
            : "Run Max mode or increase transaction rate to identify limits.",
        };
    }
  }, [detection, stableType]);

  // Don't render if no analysis or no block metrics (historical mode)
  if (!analysis || !hasBlockMetrics) return null;

  const getBottleneckColor = (type: BottleneckType) => {
    switch (type) {
      case "sender": return "text-blue-400";
      case "block-builder": return "text-yellow-400";
      case "node": return "text-red-400";
      case "balanced": return "text-green-400";
    }
  };

  const getBottleneckIcon = (type: BottleneckType) => {
    switch (type) {
      case "sender": return "📤";
      case "block-builder": return "🔨";
      case "node": return "⚙️";
      case "balanced": return "✓";
    }
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <span>Bottleneck Analysis</span>
          {status === "running" && (
            <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded">
              Live
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Bottleneck indicator */}
          <div className={`flex items-center gap-2 ${getBottleneckColor(analysis.type)}`}>
            <span className="text-2xl">{getBottleneckIcon(analysis.type)}</span>
            <div>
              <div className="font-semibold text-lg">{analysis.title}</div>
              <div className="text-sm text-muted-foreground">{analysis.description}</div>
            </div>
          </div>

          {/* Evidence */}
          <div className="bg-background/50 rounded p-3 space-y-1">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Evidence</div>
            {analysis.evidence.map((item, i) => (
              <div key={i} className="text-sm font-mono">
                • {item}
              </div>
            ))}
          </div>

          {/* Block Production Timing (from builder WS) */}
          <BuildCycleTiming
            timing={builderTiming}
            targetBlockTimeMs={builder.blockTimeMs || 1000}
            stressThresholdPct={builder.stressThresholdPct ?? 70}
            connected={builderMetricsConnected}
          />

          {/* Recommendation */}
          <div className="text-sm text-muted-foreground border-l-2 border-primary/50 pl-3">
            {analysis.recommendation}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Build Cycle Timing sub-component ----------

interface BuildCycleTimingProps {
  timing: {
    avgFilterMs: number;
    avgEngineApiMs: number;
    avgFcuMs: number;
    avgGetPayloadMs: number;
    avgTotalBuildMs: number;
    latestFilterMs: number;
    latestEngineApiMs: number;
    latestFcuMs: number;
    latestGetPayloadMs: number;
    latestTotalBuildMs: number;
    blockCount: number;
  };
  targetBlockTimeMs: number;
  stressThresholdPct: number;
  connected: boolean;
}

function BuildCycleTiming({ timing, targetBlockTimeMs, stressThresholdPct, connected }: BuildCycleTimingProps) {
  // Only show when we have actual timing data
  if (timing.blockCount === 0) return null;

  // Determine whether the builder exposes the new FCU/GetPayload split.
  // If both are 0, fall back to displaying the legacy engineApiDurationMs as a single segment.
  const hasDetailedEngineApi = timing.avgFcuMs > 0 || timing.avgGetPayloadMs > 0;

  // Budget = blockTime * stressThresholdPct / 100
  const budgetMs = targetBlockTimeMs * stressThresholdPct / 100;

  // Segment durations (averages)
  const filterMs = timing.avgFilterMs;
  const fcuMs = hasDetailedEngineApi ? timing.avgFcuMs : 0;
  const getPayloadMs = hasDetailedEngineApi ? timing.avgGetPayloadMs : 0;
  const engineApiMs = hasDetailedEngineApi ? 0 : timing.avgEngineApiMs;
  const knownMs = filterMs + fcuMs + getPayloadMs + engineApiMs;
  const overheadMs = Math.max(0, timing.avgTotalBuildMs - knownMs);

  // Total active build time
  const totalActiveMs = knownMs + overheadMs;

  // Budget fill percentage (how much of the budget is used)
  const budgetFillPct = budgetMs > 0 ? (totalActiveMs / budgetMs) * 100 : 0;

  // Color coding based on how close to the budget we are
  const getBudgetColor = (pct: number): string => {
    if (pct >= 90) return "text-red-400";
    if (pct >= 70) return "text-yellow-400";
    return "text-green-400";
  };

  const getBudgetBg = (pct: number): string => {
    if (pct >= 90) return "bg-red-400/10";
    if (pct >= 70) return "bg-yellow-400/10";
    return "bg-green-400/10";
  };

  // Segment percentages relative to the budget (for the stacked bar)
  const segmentPct = (ms: number) => budgetMs > 0 ? (ms / budgetMs) * 100 : 0;
  const filterPct = segmentPct(filterMs);
  const fcuPct = segmentPct(fcuMs);
  const getPayloadPct = segmentPct(getPayloadMs);
  const engineApiPct = segmentPct(engineApiMs);
  const overheadPct = segmentPct(overheadMs);

  // Stress threshold marker position (always at 100% of the bar since bar = budget)
  const stressMarkerPct = 100;

  // Segments for the bar and legend
  const segments = hasDetailedEngineApi
    ? [
        { label: "Filter", desc: "TX selection and nonce validation", color: "bg-blue-500", textColor: "text-blue-400", pct: filterPct, ms: filterMs },
        { label: "FCU", desc: "forkchoiceUpdated -- tell reth to start building", color: "bg-cyan-500", textColor: "text-cyan-400", pct: fcuPct, ms: fcuMs },
        { label: "GetPayload", desc: "Reth execution (the expensive part)", color: "bg-purple-500", textColor: "text-purple-400", pct: getPayloadPct, ms: getPayloadMs },
        { label: "Overhead", desc: "Nonce commits, requeue, etc.", color: "bg-gray-500", textColor: "text-gray-400", pct: overheadPct, ms: overheadMs },
      ]
    : [
        { label: "Filter", desc: "TX selection and nonce validation", color: "bg-blue-500", textColor: "text-blue-400", pct: filterPct, ms: filterMs },
        { label: "Engine API", desc: "FCU + GetPayload (legacy, not split)", color: "bg-purple-500", textColor: "text-purple-400", pct: engineApiPct, ms: engineApiMs },
        { label: "Overhead", desc: "Nonce commits, requeue, etc.", color: "bg-gray-500", textColor: "text-gray-400", pct: overheadPct, ms: overheadMs },
      ];

  return (
    <div className={`rounded p-3 space-y-2 ${getBudgetBg(budgetFillPct)}`}>
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground uppercase tracking-wider">
          Block Build Cycle Timing
        </div>
        {connected && (
          <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">
            Live
          </span>
        )}
      </div>

      {/* Budget summary */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          Build budget: {totalActiveMs.toFixed(0)}ms / {budgetMs.toFixed(0)}ms
          <span className="text-muted-foreground/60"> ({stressThresholdPct}% of {targetBlockTimeMs}ms block time)</span>
        </span>
        <span className={`font-semibold ${getBudgetColor(budgetFillPct)}`}>
          {budgetFillPct.toFixed(0)}%
        </span>
      </div>

      {/* Timing breakdown grid */}
      <div className={`grid ${hasDetailedEngineApi ? "grid-cols-5" : "grid-cols-4"} gap-2 text-sm font-mono`}>
        <div>
          <div className="text-[10px] text-muted-foreground">Filter</div>
          <div className="text-blue-400">{filterMs.toFixed(0)}ms</div>
        </div>
        {hasDetailedEngineApi ? (
          <>
            <div>
              <div className="text-[10px] text-muted-foreground">FCU</div>
              <div className="text-cyan-400">{fcuMs.toFixed(0)}ms</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground">GetPayload</div>
              <div className="text-purple-400">{getPayloadMs.toFixed(0)}ms</div>
            </div>
          </>
        ) : (
          <div>
            <div className="text-[10px] text-muted-foreground">Engine API</div>
            <div className="text-purple-400">{engineApiMs.toFixed(0)}ms</div>
          </div>
        )}
        <div>
          <div className="text-[10px] text-muted-foreground">Overhead</div>
          <div className="text-gray-400">{overheadMs.toFixed(0)}ms</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">Total</div>
          <div className="text-foreground">{timing.avgTotalBuildMs.toFixed(0)}ms</div>
        </div>
      </div>

      {/* Stacked bar with stress threshold marker */}
      <div className="space-y-1">
        <div className="relative">
          <div className="h-3 bg-muted rounded-full overflow-hidden flex">
            {segments.map((seg) => (
              <div
                key={seg.label}
                className={`${seg.color} h-full transition-all duration-300`}
                style={{ width: `${Math.min(Math.max(seg.pct, 0), 100)}%` }}
              />
            ))}
          </div>
          {/* Stress threshold marker - dashed vertical line at the budget boundary */}
          <div
            className="absolute top-0 h-full border-r-2 border-dashed border-yellow-400/70"
            style={{ left: `${Math.min(stressMarkerPct, 100)}%` }}
            title={`Stress threshold: ${budgetMs.toFixed(0)}ms (${stressThresholdPct}%)`}
          />
        </div>

        {/* Legend with descriptions */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] text-muted-foreground mt-1">
          {segments.filter(seg => seg.ms > 0).map((seg) => (
            <span key={seg.label} className="flex items-center gap-1">
              <span className={`inline-block w-2 h-2 rounded-sm ${seg.color} flex-shrink-0`} />
              <span className={seg.textColor}>{seg.label}</span>
              <span className="truncate">- {seg.desc}</span>
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-0.5 border-t-2 border-dashed border-yellow-400/70 flex-shrink-0" />
            <span className="text-yellow-400">Stress</span>
            <span className="truncate">- throttle kicks in at {stressThresholdPct}%</span>
          </span>
        </div>
      </div>

      {/* Warning when near limit */}
      {budgetFillPct >= 90 && (
        <div className={`text-xs ${getBudgetColor(budgetFillPct)} border-l-2 border-current pl-2`}>
          Build cycle is consuming {budgetFillPct.toFixed(0)}% of budget ({budgetMs.toFixed(0)}ms). Blocks may slip.
        </div>
      )}
      {budgetFillPct >= 70 && budgetFillPct < 90 && (
        <div className={`text-xs ${getBudgetColor(budgetFillPct)} border-l-2 border-current pl-2`}>
          Build cycle approaching stress threshold.
          {hasDetailedEngineApi
            ? (getPayloadMs > filterMs && getPayloadMs > fcuMs
                ? " Reth GetPayload is the dominant cost."
                : filterMs > getPayloadMs
                  ? " TX filtering is the dominant cost."
                  : " FCU latency is elevated.")
            : (engineApiMs > filterMs
                ? " Engine API is the dominant cost."
                : " TX filtering is the dominant cost.")}
        </div>
      )}

      {/* Latest block timing (dimmed, for reference) */}
      <div className="text-[10px] text-muted-foreground/60 font-mono">
        {hasDetailedEngineApi ? (
          <>Latest: filter {timing.latestFilterMs}ms | fcu {timing.latestFcuMs}ms | getPayload {timing.latestGetPayloadMs}ms | total {timing.latestTotalBuildMs}ms</>
        ) : (
          <>Latest: filter {timing.latestFilterMs}ms | engine {timing.latestEngineApiMs}ms | total {timing.latestTotalBuildMs}ms</>
        )}
        {timing.blockCount > 1 && ` (avg of ${timing.blockCount} blocks)`}
      </div>
    </div>
  );
}
