"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { BaseNode } from "./base-node";
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
      showSourceHandle={false}
      showTargetHandle={false}
    >
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Block:</span>
        <span className="font-mono font-medium text-foreground">
          #{blockNumber.toLocaleString()}
        </span>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground/70">
        Anvil (local)
      </div>

      {/* Custom handle at the top for the L2 → L1 edge */}
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !border-2 !border-background !bg-muted-foreground"
      />
    </BaseNode>
  );
});
