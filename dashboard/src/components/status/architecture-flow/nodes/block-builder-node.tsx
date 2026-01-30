"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { BaseNode } from "./base-node";
import type { BlockBuilderNode as BlockBuilderNodeType } from "../types";

export const BlockBuilderNode = memo(function BlockBuilderNode({
  data,
}: NodeProps<BlockBuilderNodeType>) {
  const { label, status, pendingTxCount, blockTimeMs } = data;

  return (
    <BaseNode label={label} status={status} colorScheme="blockBuilder">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Pending:</span>
        <span className="font-mono font-medium text-foreground">
          {pendingTxCount.toLocaleString()}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Block Time:</span>
        <span className="font-mono font-medium text-foreground">
          {blockTimeMs}ms
        </span>
      </div>
    </BaseNode>
  );
});
