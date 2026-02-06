"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { BaseNode } from "./base-node";
import { MetricRow, MetricSection } from "./metric-row";
import type { L1Node as L1NodeType } from "../types";

export const L1Node = memo(function L1Node({
  data,
}: NodeProps<L1NodeType>) {
  const { label, status, blockNumber } = data;

  return (
    <BaseNode
      label={label}
      status={status}
      colorScheme="l1"
      subtitle="Anvil :8545"
      width={140}
    >
      <MetricSection title="L1">
        <MetricRow
          label="Block"
          value={`#${blockNumber.toLocaleString()}`}
          highlight
        />
      </MetricSection>

      {/* Default target handle (from L2) */}
      <Handle
        type="target"
        position={Position.Right}
        className={cn(
          "!h-2 !w-2 !rounded-full",
          "!border !border-emerald-400/50 !bg-emerald-500/60"
        )}
      />
    </BaseNode>
  );
});
