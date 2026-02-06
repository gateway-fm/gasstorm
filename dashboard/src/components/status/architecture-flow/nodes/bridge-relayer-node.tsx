"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { BaseNode } from "./base-node";
import { MetricRow, MetricSection } from "./metric-row";
import type { BridgeRelayerNode as BridgeRelayerNodeType } from "../types";

export const BridgeRelayerNode = memo(function BridgeRelayerNode({
  data,
}: NodeProps<BridgeRelayerNodeType>) {
  const { label, status, pendingMessages, messagesRelayed, lastRelayTime } = data;

  return (
    <BaseNode
      label={label}
      status={status}
      colorScheme="bridgeRelayer"
      subtitle=":19090"
      width={160}
    >
      <MetricSection title="Hyperlane">
        <MetricRow
          label="Pending"
          value={pendingMessages.toLocaleString()}
          highlight={pendingMessages > 0}
        />
        <MetricRow label="Relayed" value={messagesRelayed.toLocaleString()} />
        {lastRelayTime && (
          <MetricRow label="Last Relay" value={lastRelayTime} />
        )}
      </MetricSection>

      {/* Default source handle (to Bridge UI) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className={cn(
          "!h-2 !w-2 !rounded-full",
          "!border !border-orange-400/50 !bg-orange-500/60"
        )}
      />
    </BaseNode>
  );
});
