"use client";

import { memo, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface MetricRowProps {
  label: string;
  value: ReactNode;
  sublabel?: string;
  highlight?: boolean;
  size?: "sm" | "md";
}

export const MetricRow = memo(function MetricRow({
  label,
  value,
  sublabel,
  highlight = false,
  size = "sm",
}: MetricRowProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-col">
        <span
          className={cn(
            "text-muted-foreground uppercase tracking-wider",
            size === "sm" ? "text-[9px]" : "text-[10px]"
          )}
        >
          {label}
        </span>
        {sublabel && (
          <span className="text-[8px] text-muted-foreground/60">{sublabel}</span>
        )}
      </div>
      <span
        className={cn(
          "font-mono font-semibold tabular-nums",
          size === "sm" ? "text-[11px]" : "text-xs",
          highlight ? "text-primary" : "text-foreground"
        )}
      >
        {value}
      </span>
    </div>
  );
});

interface MetricSectionProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

export const MetricSection = memo(function MetricSection({
  title,
  children,
  className,
}: MetricSectionProps) {
  return (
    <div className={cn("space-y-1", className)}>
      {title && (
        <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/80 border-b border-white/5 pb-1 mb-1.5">
          {title}
        </div>
      )}
      {children}
    </div>
  );
});
