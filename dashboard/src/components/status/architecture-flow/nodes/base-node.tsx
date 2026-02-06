"use client";

import { memo, type ReactNode, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { NodeStatus } from "../types";

// Node color schemes matching the dashboard theme - Bleu AI inspired
export const colorSchemes = {
  loadGenerator: {
    gradient: "from-violet-500/15 via-purple-500/10 to-violet-500/5",
    border: "border-violet-500/40",
    borderHover: "hover:border-violet-400/60",
    glow: "shadow-violet-500/10",
    glowHover: "hover:shadow-violet-500/20",
    header: "text-violet-300",
    headerBg: "bg-violet-500/10",
    icon: "bg-violet-500",
    accent: "violet",
  },
  blockBuilder: {
    gradient: "from-purple-500/15 via-pink-500/10 to-purple-500/5",
    border: "border-purple-500/40",
    borderHover: "hover:border-purple-400/60",
    glow: "shadow-purple-500/10",
    glowHover: "hover:shadow-purple-500/20",
    header: "text-purple-300",
    headerBg: "bg-purple-500/10",
    icon: "bg-purple-500",
    accent: "purple",
  },
  execution: {
    gradient: "from-blue-500/15 via-cyan-500/10 to-blue-500/5",
    border: "border-blue-500/40",
    borderHover: "hover:border-blue-400/60",
    glow: "shadow-blue-500/10",
    glowHover: "hover:shadow-blue-500/20",
    header: "text-blue-300",
    headerBg: "bg-blue-500/10",
    icon: "bg-blue-500",
    accent: "blue",
  },
  l1: {
    gradient: "from-emerald-500/15 via-teal-500/10 to-emerald-500/5",
    border: "border-emerald-500/40",
    borderHover: "hover:border-emerald-400/60",
    glow: "shadow-emerald-500/10",
    glowHover: "hover:shadow-emerald-500/20",
    header: "text-emerald-300",
    headerBg: "bg-emerald-500/10",
    icon: "bg-emerald-500",
    accent: "emerald",
  },
  bridgeRelayer: {
    gradient: "from-orange-500/15 via-amber-500/10 to-orange-500/5",
    border: "border-orange-500/40",
    borderHover: "hover:border-orange-400/60",
    glow: "shadow-orange-500/10",
    glowHover: "hover:shadow-orange-500/20",
    header: "text-orange-300",
    headerBg: "bg-orange-500/10",
    icon: "bg-orange-500",
    accent: "orange",
  },
  bridgeUI: {
    gradient: "from-amber-500/15 via-yellow-500/10 to-amber-500/5",
    border: "border-amber-500/40",
    borderHover: "hover:border-amber-400/60",
    glow: "shadow-amber-500/10",
    glowHover: "hover:shadow-amber-500/20",
    header: "text-amber-300",
    headerBg: "bg-amber-500/10",
    icon: "bg-amber-500",
    accent: "amber",
  },
} as const;

export type ColorSchemeKey = keyof typeof colorSchemes;

const statusColors = {
  online: {
    dot: "bg-emerald-400",
    ring: "ring-emerald-400/30",
    pulse: "animate-pulse",
    label: "text-emerald-400",
  },
  offline: {
    dot: "bg-red-400",
    ring: "ring-red-400/30",
    pulse: "",
    label: "text-red-400",
  },
  unknown: {
    dot: "bg-gray-400",
    ring: "ring-gray-400/30",
    pulse: "",
    label: "text-gray-400",
  },
} as const;

interface BaseNodeProps {
  label: string;
  status: NodeStatus;
  children: ReactNode;
  colorScheme: ColorSchemeKey;
  subtitle?: string;
  footer?: ReactNode;
  width?: number;
  showLogToggle?: boolean;
  logsExpanded?: boolean;
  onToggleLogs?: () => void;
}

function StatusIndicator({ status }: { status: NodeStatus }) {
  const colors = statusColors[status];
  return (
    <div className={cn("relative flex items-center justify-center", colors.pulse)}>
      <span className={cn("absolute h-3.5 w-3.5 rounded-full ring-4", colors.ring, "opacity-40")} />
      <span className={cn("relative h-2 w-2 rounded-full", colors.dot)} />
    </div>
  );
}

export const BaseNode = memo(function BaseNode({
  label,
  status,
  children,
  colorScheme,
  subtitle,
  footer,
  width = 180,
}: BaseNodeProps) {
  const colors = colorSchemes[colorScheme];

  return (
    <div
      className={cn(
        "relative rounded-lg border backdrop-blur-sm",
        "bg-gradient-to-br bg-card/80",
        colors.gradient,
        colors.border,
        colors.borderHover,
        "shadow-lg",
        colors.glow,
        colors.glowHover,
        "transition-all duration-200"
      )}
      style={{ width }}
    >
      {/* Header */}
      <div
        className={cn(
          "flex items-center justify-between gap-2 px-3 py-2",
          "border-b border-white/5",
          colors.headerBg
        )}
      >
        <div className="flex items-center gap-2">
          {/* Type indicator dot */}
          <span className={cn("h-2 w-2 rounded-full shrink-0", colors.icon)} />
          <div className="flex flex-col">
            <span className={cn("text-[11px] font-semibold tracking-wide", colors.header)}>
              {label}
            </span>
            {subtitle && (
              <span className="text-[9px] text-muted-foreground/60">{subtitle}</span>
            )}
          </div>
        </div>
        <StatusIndicator status={status} />
      </div>

      {/* Content */}
      <div className="px-3 py-2 space-y-2">{children}</div>

      {/* Footer (optional) */}
      {footer}
    </div>
  );
});

// Extended base node with expandable log panel support
interface BaseNodeWithLogsProps extends Omit<BaseNodeProps, "footer"> {
  logPanel?: ReactNode;
}

export const BaseNodeWithLogs = memo(function BaseNodeWithLogs({
  children,
  logPanel,
  ...props
}: BaseNodeWithLogsProps) {
  const [logsExpanded, setLogsExpanded] = useState(false);

  const toggleLogs = useCallback(() => {
    setLogsExpanded((prev) => !prev);
  }, []);

  return (
    <BaseNode
      {...props}
      footer={
        logPanel ? (
          <div className="relative">
            {/* Log panel placeholder - actual panel cloned with expanded state */}
            {typeof logPanel === "function"
              ? (logPanel as (expanded: boolean, toggle: () => void) => ReactNode)(logsExpanded, toggleLogs)
              : logPanel}
          </div>
        ) : undefined
      }
    >
      {children}
    </BaseNode>
  );
});
