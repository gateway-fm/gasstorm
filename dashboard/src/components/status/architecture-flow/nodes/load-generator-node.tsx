"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { BaseNode } from "./base-node";
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
      showTargetHandle={false}
    >
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">TPS:</span>
        <span className="font-mono font-medium text-foreground">
          {tps.toFixed(0)}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Sent:</span>
        <span className="font-mono font-medium text-foreground">
          {txSent.toLocaleString()}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Pending:</span>
        <span className="font-mono font-medium text-foreground">
          {txPending.toLocaleString()}
        </span>
      </div>
      {isRunning && (
        <div className="mt-1 flex items-center gap-1 text-[10px] text-green-500">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
          Running
        </div>
      )}
    </BaseNode>
  );
});
