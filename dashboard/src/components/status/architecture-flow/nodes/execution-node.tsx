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

      <MetricSection title="Ports" className="pt-1">
        <div className="flex items-center justify-between text-[9px]">
          <span className="text-muted-foreground/70">HTTP</span>
          <code className="text-cyan-400/80">:18545</code>
        </div>
        <div className="flex items-center justify-between text-[9px]">
          <span className="text-muted-foreground/70">WS</span>
          <code className="text-cyan-400/80">:18546</code>
        </div>
        <div className="flex items-center justify-between text-[9px]">
          <span className="text-muted-foreground/70">Engine</span>
          <code className="text-pink-400/80">:8551</code>
        </div>
      </MetricSection>

      {/* Input port - Engine API (LEFT) */}
      <Handle
        id="engine-input"
        type="target"
        position={Position.Left}
        className={cn(
          "!h-3 !w-3 !rounded-full !border-2",
          "!border-blue-400 !bg-blue-500/80",
          "!-left-1.5"
        )}
      />

      {/* Output port - Settlement to L1 (TOP - goes UP to L1) */}
      <Handle
        id="settlement-output"
        type="source"
        position={Position.Top}
        style={{ left: "30%" }}
        className={cn(
          "!h-2.5 !w-2.5 !rounded-full !border-2",
          "!border-cyan-400/50 !bg-cyan-500/50",
          "!-top-1"
        )}
      />

      {/* Input port - Bridge messages from Relayer (TOP) */}
      <Handle
        id="bridge-input"
        type="target"
        position={Position.Top}
        style={{ left: "70%" }}
        className={cn(
          "!h-2.5 !w-2.5 !rounded-full !border-2",
          "!border-orange-400/50 !bg-orange-500/50",
          "!-top-1"
        )}
      />
    </BaseNode>
  );
});
