"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { BaseNode } from "./base-node";
import type { ExecutionNode as ExecutionNodeType } from "../types";

export const ExecutionNode = memo(function ExecutionNode({
  data,
}: NodeProps<ExecutionNodeType>) {
  const { label, status, blockNumber, chainId, type } = data;

  return (
    <BaseNode
      label={label}
      status={status}
      colorScheme="execution"
      showSourceHandle={true}
    >
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Block:</span>
        <span className="font-mono font-medium text-foreground">
          #{blockNumber.toLocaleString()}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Chain:</span>
        <span className="font-mono font-medium text-foreground">{chainId}</span>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground/70">
        {type}
      </div>
    </BaseNode>
  );
});
