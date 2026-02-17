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
    const targetBlockTimeMs = builder.blockTimeMs || 2000;

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
            targetBlockTimeMs={builder.blockTimeMs || 2000}
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
    avgTotalBuildMs: number;
    latestFilterMs: number;
    latestEngineApiMs: number;
    latestTotalBuildMs: number;
    blockCount: number;
  };
  targetBlockTimeMs: number;
  connected: boolean;
}

function BuildCycleTiming({ timing, targetBlockTimeMs, connected }: BuildCycleTimingProps) {
  // Only show when we have actual timing data
  if (timing.blockCount === 0) return null;

  const combinedMs = timing.avgFilterMs + timing.avgEngineApiMs;
  const budgetPct = targetBlockTimeMs > 0 ? (combinedMs / targetBlockTimeMs) * 100 : 0;
  const overheadMs = timing.avgTotalBuildMs - combinedMs;

  // Color coding based on how close to the block time budget we are
  const getBudgetColor = (pct: number): string => {
    if (pct >= 90) return "text-red-400";
    if (pct >= 70) return "text-yellow-400";
    return "text-green-400";
  };

  // Proportions for the stacked bar
  const filterPct = targetBlockTimeMs > 0
    ? (timing.avgFilterMs / targetBlockTimeMs) * 100
    : 0;
  const enginePct = targetBlockTimeMs > 0
    ? (timing.avgEngineApiMs / targetBlockTimeMs) * 100
    : 0;

  return (
    <div className="bg-background/50 rounded p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground uppercase tracking-wider">
          Block Production Timing
        </div>
        {connected && (
          <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">
            Live
          </span>
        )}
      </div>

      {/* Timing breakdown */}
      <div className="grid grid-cols-3 gap-2 text-sm font-mono">
        <div>
          <div className="text-[10px] text-muted-foreground">Filter</div>
          <div className="text-blue-400">{timing.avgFilterMs.toFixed(0)}ms</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">GetPayload</div>
          <div className="text-purple-400">{timing.avgEngineApiMs.toFixed(0)}ms</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">Total Cycle</div>
          <div className="text-foreground">{timing.avgTotalBuildMs.toFixed(0)}ms</div>
        </div>
      </div>

      {/* Budget bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            Budget: {combinedMs.toFixed(0)}ms / {targetBlockTimeMs}ms
            {overheadMs > 10 && (
              <span className="text-muted-foreground/60"> (+{overheadMs.toFixed(0)}ms overhead)</span>
            )}
          </span>
          <span className={getBudgetColor(budgetPct)}>
            {budgetPct.toFixed(0)}%
          </span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden flex">
          {/* Filter portion */}
          <div
            className="bg-blue-400 h-full transition-all duration-300"
            style={{ width: `${Math.min(filterPct, 100)}%` }}
          />
          {/* Engine API portion */}
          <div
            className="bg-purple-400 h-full transition-all duration-300"
            style={{ width: `${Math.min(enginePct, 100 - Math.min(filterPct, 100))}%` }}
          />
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-blue-400" /> Filter
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-purple-400" /> GetPayload (reth)
          </span>
        </div>
      </div>

      {/* Warning when near limit */}
      {budgetPct >= 90 && (
        <div className={`text-xs ${getBudgetColor(budgetPct)} border-l-2 border-current pl-2`}>
          Build cycle is consuming {budgetPct.toFixed(0)}% of block time. Blocks may slip.
        </div>
      )}
      {budgetPct >= 70 && budgetPct < 90 && (
        <div className={`text-xs ${getBudgetColor(budgetPct)} border-l-2 border-current pl-2`}>
          Build cycle approaching block time limit.
          {timing.avgEngineApiMs > timing.avgFilterMs
            ? " Reth execution is the dominant cost."
            : " TX filtering is the dominant cost."}
        </div>
      )}

      {/* Latest block timing (dimmed, for reference) */}
      <div className="text-[10px] text-muted-foreground/60 font-mono">
        Latest: filter {timing.latestFilterMs}ms | reth {timing.latestEngineApiMs}ms | total {timing.latestTotalBuildMs}ms
        {timing.blockCount > 1 && ` (avg of ${timing.blockCount} blocks)`}
      </div>
    </div>
  );
}
