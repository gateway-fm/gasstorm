"use client";

import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export type DeltaFormat = "percent" | "percentPoints" | "absolute" | "duration";

interface DeltaBadgeProps {
  valueA: number | undefined | null;
  valueB: number | undefined | null;
  format?: DeltaFormat;
  higherIsBetter?: boolean; // true for TPS/throughput, false for latency
  className?: string;
  showArrow?: boolean;
}

function formatDelta(
  delta: number,
  format: DeltaFormat,
  valueA: number,
  valueB: number
): string {
  switch (format) {
    case "percent": {
      if (valueA === 0) {
        if (valueB === 0) return "0%";
        return valueB > 0 ? "+∞%" : "-∞%";
      }
      const pct = ((valueB - valueA) / Math.abs(valueA)) * 100;
      const sign = pct >= 0 ? "+" : "";
      return `${sign}${pct.toFixed(1)}%`;
    }
    case "percentPoints": {
      const pp = valueB - valueA;
      const sign = pp >= 0 ? "+" : "";
      return `${sign}${pp.toFixed(1)}pp`;
    }
    case "absolute": {
      const sign = delta >= 0 ? "+" : "";
      if (Math.abs(delta) >= 1000000) {
        return `${sign}${(delta / 1000000).toFixed(2)}M`;
      }
      if (Math.abs(delta) >= 1000) {
        return `${sign}${(delta / 1000).toFixed(1)}K`;
      }
      return `${sign}${delta.toFixed(0)}`;
    }
    case "duration": {
      const sign = delta >= 0 ? "+" : "";
      if (Math.abs(delta) >= 1000) {
        return `${sign}${(delta / 1000).toFixed(2)}s`;
      }
      return `${sign}${delta.toFixed(0)}ms`;
    }
    default:
      return delta.toFixed(2);
  }
}

export function DeltaBadge({
  valueA,
  valueB,
  format = "percent",
  higherIsBetter = true,
  className,
  showArrow = true,
}: DeltaBadgeProps) {
  const a = valueA ?? 0;
  const b = valueB ?? 0;
  const delta = b - a;

  // Determine if this change is better, worse, or neutral
  const isBetter = higherIsBetter ? delta > 0 : delta < 0;
  const isWorse = higherIsBetter ? delta < 0 : delta > 0;
  const isUnchanged = Math.abs(delta) < 0.001;

  // Choose color based on better/worse
  let colorClass = "text-muted-foreground";
  if (!isUnchanged) {
    colorClass = isBetter ? "text-success" : isWorse ? "text-destructive" : "text-muted-foreground";
  }

  // Choose icon
  const Icon = isUnchanged ? Minus : delta > 0 ? ArrowUp : ArrowDown;

  const formattedDelta = formatDelta(delta, format, a, b);

  return (
    <span className={cn("inline-flex items-center gap-0.5 font-mono text-sm", colorClass, className)}>
      {showArrow && <Icon className="h-3 w-3" />}
      {formattedDelta}
    </span>
  );
}

// Status badge for config changes (neutral coloring)
interface ConfigChangeBadgeProps {
  changed: boolean;
  className?: string;
}

export function ConfigChangeBadge({ changed, className }: ConfigChangeBadgeProps) {
  if (!changed) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>
        Same
      </span>
    );
  }

  return (
    <span className={cn("text-xs text-warning font-medium", className)}>
      Changed
    </span>
  );
}
