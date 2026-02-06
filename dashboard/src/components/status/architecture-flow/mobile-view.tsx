"use client";

import { memo } from "react";
import { useChainStore } from "@/stores/chain-store";
import { useGoLoadTestStore } from "@/stores/go-load-test-store";
import type { ExecutionLayerConfig } from "./types";
import { COLORS } from "./constants";

interface MobileArchitectureViewProps {
  config: ExecutionLayerConfig;
}

function StatusDot({ isOnline }: { isOnline: boolean }) {
  const color = isOnline ? COLORS.status.online : COLORS.status.offline;
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

export const MobileArchitectureView = memo(function MobileArchitectureView({
  config,
}: MobileArchitectureViewProps) {
  const l1 = useChainStore((state) => state.l1);
  const l2 = useChainStore((state) => state.l2);
  const builder = useChainStore((state) => state.builder);
  const loadTestStatus = useGoLoadTestStore((state) => state.status);
  const currentRate = useGoLoadTestStore((state) => state.currentRate);

  const isTestRunning =
    loadTestStatus === "running" || loadTestStatus === "initializing";

  return (
    <div className="space-y-3 p-4">
      {/* Header - System Overview */}
      <div className="text-center mb-4">
        <h3 className="text-sm font-semibold text-foreground">System Architecture</h3>
        <p className="text-xs text-muted-foreground">{config.name} Mode</p>
      </div>

      {/* LEFT COLUMN: L1 */}
      <div className="flex items-center justify-between rounded-md border bg-card p-3 border-l-4" style={{ borderLeftColor: COLORS.l1.border }}>
        <div className="flex items-center gap-2">
          <StatusDot isOnline={l1.isOnline} />
          <span className="text-sm font-medium text-foreground">L1 Anvil</span>
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          #{l1.blockNumber.toLocaleString()}
        </span>
      </div>

      {/* Settlement Arrow (L1 ↔ L2) */}
      <div className="flex justify-center">
        <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      </div>

      {/* CENTER: L2 Pipeline */}
      {/* Load Generator */}
      <div className="flex items-center justify-between rounded-md border bg-card p-3 border-l-4" style={{ borderLeftColor: COLORS.loadGenerator.border }}>
        <div className="flex items-center gap-2">
          <StatusDot isOnline={isTestRunning} />
          <span className="text-sm font-medium text-foreground">Load Generator</span>
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          {isTestRunning ? `${currentRate.toFixed(0)} TPS` : 'Idle'}
        </span>
      </div>

      {/* Down Arrow */}
      <div className="flex justify-center">
        <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </div>

      {/* Block Builder (only in reth mode) */}
      {config.hasBlockBuilder && (
        <>
          <div className="flex items-center justify-between rounded-md border bg-card p-3 border-l-4" style={{ borderLeftColor: COLORS.blockBuilder.border }}>
            <div className="flex items-center gap-2">
              <StatusDot isOnline={builder.isOnline} />
              <span className="text-sm font-medium text-foreground">Block Builder</span>
            </div>
            <span className="font-mono text-xs text-muted-foreground">
              {builder.pendingTxCount} pending
            </span>
          </div>

          {/* Down Arrow */}
          <div className="flex justify-center">
            <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </div>
        </>
      )}

      {/* Execution Layer */}
      <div className="flex items-center justify-between rounded-md border bg-card p-3 border-l-4" style={{ borderLeftColor: COLORS.execution.border }}>
        <div className="flex items-center gap-2">
          <StatusDot isOnline={l2.isOnline} />
          <span className="text-sm font-medium text-foreground">{config.name}</span>
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          #{l2.blockNumber.toLocaleString()}
        </span>
      </div>

      {/* RIGHT COLUMN: Bridge (horizontal indicator) */}
      <div className="pt-2 border-t border-dashed border-muted-foreground/20 mt-4">
        <div className="flex justify-between text-[10px] text-muted-foreground/70 px-2">
          <span>← Settlement</span>
          <span>Bridge →</span>
        </div>
      </div>

      {/* Bridge Services */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <div className="flex items-center justify-between rounded-md border bg-card p-2 border-l-4" style={{ borderLeftColor: COLORS.execution.border }}>
          <span className="text-xs font-medium">Bridge Relayer</span>
          <StatusDot isOnline={false} />
        </div>
        <div className="flex items-center justify-between rounded-md border bg-card p-2 border-l-4" style={{ borderLeftColor: COLORS.execution.border }}>
          <span className="text-xs font-medium">Bridge UI</span>
          <StatusDot isOnline={false} />
        </div>
      </div>

      {/* Legend */}
      <div className="pt-3 text-center text-[10px] text-muted-foreground/60">
        <div className="flex justify-center gap-4">
          <span>L1 ↔ L2: Settlement</span>
          <span>Bridge: Hyperlane</span>
        </div>
      </div>
    </div>
  );
});
