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
      {/* Load Generator */}
      <div className="flex items-center justify-between rounded-md border bg-card p-3">
        <div className="flex items-center gap-2">
          <StatusDot isOnline={isTestRunning} />
          <span className="text-sm font-medium text-foreground">
            Load Generator
          </span>
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          {currentRate.toFixed(0)} TPS
        </span>
      </div>

      {/* Arrow */}
      <div className="flex justify-center">
        <svg
          className="h-4 w-4 text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 14l-7 7m0 0l-7-7m7 7V3"
          />
        </svg>
      </div>

      {/* Block Builder (only in reth mode) */}
      {config.hasBlockBuilder && (
        <>
          <div className="flex items-center justify-between rounded-md border bg-card p-3">
            <div className="flex items-center gap-2">
              <StatusDot isOnline={builder.isOnline} />
              <span className="text-sm font-medium text-foreground">
                Block Builder
              </span>
            </div>
            <span className="font-mono text-xs text-muted-foreground">
              {builder.pendingTxCount} pending
            </span>
          </div>

          {/* Arrow */}
          <div className="flex justify-center">
            <svg
              className="h-4 w-4 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 14l-7 7m0 0l-7-7m7 7V3"
              />
            </svg>
          </div>
        </>
      )}

      {/* Execution Layer */}
      <div className="flex items-center justify-between rounded-md border bg-card p-3">
        <div className="flex items-center gap-2">
          <StatusDot isOnline={l2.isOnline} />
          <span className="text-sm font-medium text-foreground">
            {config.name}
          </span>
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          #{l2.blockNumber.toLocaleString()}
        </span>
      </div>

      {/* Arrow */}
      <div className="flex justify-center">
        <svg
          className="h-4 w-4 text-muted-foreground/50"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 14l-7 7m0 0l-7-7m7 7V3"
          />
        </svg>
      </div>

      {/* L1 */}
      <div className="flex items-center justify-between rounded-md border bg-card p-3 opacity-70">
        <div className="flex items-center gap-2">
          <StatusDot isOnline={l1.isOnline} />
          <span className="text-sm font-medium text-foreground">L1 Anvil</span>
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          #{l1.blockNumber.toLocaleString()}
        </span>
      </div>

      {/* Legend */}
      <div className="pt-2 text-center text-[10px] text-muted-foreground/70">
        Settlement to L1 (future)
      </div>
    </div>
  );
});
