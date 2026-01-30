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

      {/* Input port - from L1 */}
      <Handle
        id="l1-input"
        type="target"
        position={Position.Left}
        className={cn(
          "!h-3 !w-3 !rounded-full !border-2",
          "!border-orange-400 !bg-orange-500/80",
          "!-left-1.5"
        )}
      />

      {/* Output port - to Bridge UI */}
      <Handle
        id="ui-output"
        type="source"
        position={Position.Right}
        className={cn(
          "!h-3 !w-3 !rounded-full !border-2",
          "!border-amber-400 !bg-amber-500/80",
          "!-right-1.5"
        )}
      />

      {/* Output port - relay to Execution (L2) */}
      <Handle
        id="relay-output"
        type="source"
        position={Position.Bottom}
        className={cn(
          "!h-2.5 !w-2.5 !rounded-full !border-2",
          "!border-blue-400/50 !bg-blue-500/50",
          "!-bottom-1"
        )}
      />
    </BaseNode>
  );
});
