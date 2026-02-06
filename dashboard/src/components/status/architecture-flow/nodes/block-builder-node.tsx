"use client";

import { memo, useState, useCallback } from "react";
import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { BaseNode } from "./base-node";
import { MetricRow, MetricSection } from "./metric-row";
import { LogPanel, type LogEntry } from "./log-panel";
import type { BlockBuilderNode as BlockBuilderNodeType } from "../types";

// Demo logs - in real implementation, these would come from WebSocket
const demoLogs: LogEntry[] = [
  { timestamp: "12:34:56", level: "info", message: "Block #1234 built (487 txs)" },
  { timestamp: "12:34:57", level: "debug", message: "FCU sent to op-reth" },
  { timestamp: "12:34:57", level: "info", message: "TX pool drained" },
  { timestamp: "12:34:58", level: "debug", message: "GetPayload received" },
  { timestamp: "12:34:59", level: "info", message: "Preconf events emitted" },
];

export const BlockBuilderNode = memo(function BlockBuilderNode({
  data,
}: NodeProps<BlockBuilderNodeType>) {
  const { label, status, pendingTxCount, blockTimeMs } = data;
  const [logsExpanded, setLogsExpanded] = useState(false);

  const toggleLogs = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setLogsExpanded((prev) => !prev);
  }, []);

  return (
    <BaseNode
      label={label}
      status={status}
      colorScheme="blockBuilder"
      subtitle=":13000"
      width={180}
      footer={
        <div className="nodrag nopan">
          {/* Log toggle - nodrag/nopan classes prevent React Flow from capturing */}
          {!logsExpanded ? (
            <button
              onClick={toggleLogs}
              className="nodrag nopan w-full flex items-center justify-center gap-1 py-1.5 text-[9px] text-muted-foreground/60 hover:text-muted-foreground hover:bg-white/5 border-t border-white/5 transition-colors cursor-pointer"
            >
              <ChevronDown className="h-3 w-3" />
              Show Logs
            </button>
          ) : (
            <div className="nodrag nopan">
              <LogPanel
                logs={demoLogs}
                expanded={logsExpanded}
                onToggleExpand={toggleLogs}
              />
            </div>
          )}
        </div>
      }
    >
      {/* TX Queue metrics */}
      <MetricSection title="TX Pool">
        <MetricRow
          label="Pending"
          value={pendingTxCount.toLocaleString()}
          highlight={pendingTxCount > 100}
        />
        <MetricRow label="Block Time" value={`${blockTimeMs}ms`} />
      </MetricSection>

      {/* Default target handle */}
      <Handle
        type="target"
        position={Position.Top}
        className={cn(
          "!h-2 !w-2 !rounded-full",
          "!border !border-purple-400/50 !bg-purple-500/60"
        )}
      />

      {/* Default source handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className={cn(
          "!h-2 !w-2 !rounded-full",
          "!border !border-purple-400/50 !bg-purple-500/60"
        )}
      />
    </BaseNode>
  );
});
