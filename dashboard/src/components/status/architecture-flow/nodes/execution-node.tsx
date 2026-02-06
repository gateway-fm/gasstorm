"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { BaseNode } from "./base-node";
import { MetricRow, MetricSection } from "./metric-row";
import type { ExecutionNode as ExecutionNodeType } from "../types";

export const ExecutionNode = memo(function ExecutionNode({
  data,
}: NodeProps<ExecutionNodeType>) {
  const { label, status, blockNumber, chainId } = data;

  return (
    <BaseNode
      label={label}
      status={status}
      colorScheme="execution"
      subtitle={`:18545`}
      width={160}
    >
      <MetricSection title="Chain">
        <MetricRow
          label="Block"
          value={`#${blockNumber.toLocaleString()}`}
          highlight
        />
        <MetricRow label="Chain ID" value={chainId} />
      </MetricSection>

      {/* Default target handle (from Block Builder) */}
      <Handle
        type="target"
        position={Position.Top}
        className={cn(
          "!h-2 !w-2 !rounded-full",
          "!border !border-blue-400/50 !bg-blue-500/60"
        )}
      />

      {/* Source to L1 (left) */}
      <Handle
        type="source"
        position={Position.Left}
        className={cn(
          "!h-2 !w-2 !rounded-full",
          "!border !border-blue-400/50 !bg-blue-500/60"
        )}
      />
    </BaseNode>
  );
});
