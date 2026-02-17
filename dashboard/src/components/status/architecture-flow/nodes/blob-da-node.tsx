"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { BaseNode } from "./base-node";
import { MetricRow, MetricSection } from "./metric-row";
import type { BlobDANode as BlobDANodeType } from "../types";

export const BlobDANode = memo(function BlobDANode({
  data,
}: NodeProps<BlobDANodeType>) {
  const { label, status, latestBatch, compression } = data;

  return (
    <BaseNode
      label={label}
      status={status}
      colorScheme="blobDA"
      subtitle="DA :8125"
      width={140}
    >
      <MetricSection title="Blob DA">
        <MetricRow
          label="Batch"
          value={latestBatch > 0 ? `#${latestBatch}` : "-"}
          highlight
        />
        <MetricRow label="Codec" value={compression} />
      </MetricSection>

      {/* Target handle (from execution) */}
      <Handle
        type="target"
        position={Position.Right}
        className={cn(
          "!h-2 !w-2 !rounded-full",
          "!border !border-rose-400/50 !bg-rose-500/60"
        )}
      />
      {/* Source handle (to L1) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className={cn(
          "!h-2 !w-2 !rounded-full",
          "!border !border-rose-400/50 !bg-rose-500/60"
        )}
      />
    </BaseNode>
  );
});
