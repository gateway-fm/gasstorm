"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { ExternalLink } from "lucide-react";
import { BaseNode } from "./base-node";
import { MetricRow, MetricSection } from "./metric-row";
import type { BridgeUINode as BridgeUINodeType } from "../types";

export const BridgeUINode = memo(function BridgeUINode({
  data,
}: NodeProps<BridgeUINodeType>) {
  const { label, status, activeTransfers, port } = data;

  return (
    <BaseNode
      label={label}
      status={status}
      colorScheme="bridgeUI"
      subtitle={`:${port}/bridge`}
      width={140}
    >
      <MetricSection title="Status">
        <MetricRow
          label="Active"
          value={activeTransfers.toLocaleString()}
          highlight={activeTransfers > 0}
        />
      </MetricSection>

      <div className="pt-1 border-t border-white/5">
        <a
          href={`http://localhost:${port}/bridge`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[9px] text-amber-400/80 hover:text-amber-300 transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          Open Bridge UI
        </a>
      </div>

      {/* Default target handle (from Relayer) */}
      <Handle
        type="target"
        position={Position.Top}
        className={cn(
          "!h-2 !w-2 !rounded-full",
          "!border !border-amber-400/50 !bg-amber-500/60"
        )}
      />
    </BaseNode>
  );
});
