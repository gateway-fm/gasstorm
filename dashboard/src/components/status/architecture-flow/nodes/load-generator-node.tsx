"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { BaseNode } from "./base-node";
import { MetricRow, MetricSection } from "./metric-row";
import type { LoadGeneratorNode as LoadGeneratorNodeType } from "../types";

export const LoadGeneratorNode = memo(function LoadGeneratorNode({
  data,
}: NodeProps<LoadGeneratorNodeType>) {
  const { label, status, tps, txSent, txPending, isRunning } = data;

  return (
    <BaseNode
      label={label}
      status={status}
      colorScheme="loadGenerator"
      subtitle={isRunning ? "Active" : "Idle"}
      width={160}
    >
      <MetricSection>
        <MetricRow
          label="TPS"
          value={tps.toFixed(0)}
          highlight={isRunning && tps > 0}
        />
        <MetricRow label="Sent" value={txSent.toLocaleString()} />
        <MetricRow label="Pending" value={txPending.toLocaleString()} />
      </MetricSection>

      {isRunning && (
        <div className="flex items-center gap-1.5 pt-1 border-t border-white/5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
          </span>
          <span className="text-[9px] font-medium text-green-400">Running</span>
        </div>
      )}

      {/* Default source handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className={cn(
          "!h-2 !w-2 !rounded-full",
          "!border !border-violet-400/50 !bg-violet-500/60"
        )}
      />
    </BaseNode>
  );
});
