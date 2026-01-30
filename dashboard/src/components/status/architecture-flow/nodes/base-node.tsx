"use client";

import { memo, type ReactNode } from "react";
import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { NodeStatus } from "../types";
import { COLORS } from "../constants";

interface BaseNodeProps {
  label: string;
  status: NodeStatus;
  children: ReactNode;
  colorScheme: "loadGenerator" | "blockBuilder" | "execution" | "l1";
  showSourceHandle?: boolean;
  showTargetHandle?: boolean;
}

function StatusDot({ status }: { status: NodeStatus }) {
  const color = COLORS.status[status];
  return (
    <span
      className="absolute -top-1 -right-1 h-3 w-3 rounded-full border-2 border-background"
      style={{ backgroundColor: color }}
      title={status}
    />
  );
}

export const BaseNode = memo(function BaseNode({
  label,
  status,
  children,
  colorScheme,
  showSourceHandle = true,
  showTargetHandle = true,
}: BaseNodeProps) {
  const colors = COLORS[colorScheme];

  return (
    <div
      className={cn(
        "relative rounded-lg border-2 bg-card p-3 shadow-sm",
        "min-w-[140px] transition-shadow hover:shadow-md"
      )}
      style={{ borderColor: colors.border }}
    >
      <StatusDot status={status} />

      {/* Header */}
      <div
        className="mb-2 text-xs font-semibold uppercase tracking-wide"
        style={{ color: colors.border }}
      >
        {label}
      </div>

      {/* Content */}
      <div className="space-y-1 text-xs text-muted-foreground">{children}</div>

      {/* Handles */}
      {showTargetHandle && (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-2 !w-2 !border-2 !border-background !bg-muted-foreground"
        />
      )}
      {showSourceHandle && (
        <Handle
          type="source"
          position={Position.Right}
          className="!h-2 !w-2 !border-2 !border-background !bg-muted-foreground"
        />
      )}
    </div>
  );
});
