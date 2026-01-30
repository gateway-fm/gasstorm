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

      {/* Input port - Settlement from L2 (BOTTOM - receives from execution) */}
      <Handle
        id="settlement-input"
        type="target"
        position={Position.Bottom}
        className={cn(
          "!h-2.5 !w-2.5 !rounded-full !border-2",
          "!border-cyan-400/50 !bg-cyan-500/50",
          "!-bottom-1"
        )}
      />

      {/* Output port - Bridge to Relayer (RIGHT) */}
      <Handle
        id="bridge-output"
        type="source"
        position={Position.Right}
        className={cn(
          "!h-3 !w-3 !rounded-full !border-2",
          "!border-orange-400 !bg-orange-500/80",
          "!-right-1.5"
        )}
      />
    </BaseNode>
  );
});
