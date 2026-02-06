"use client";

import { cn } from "@/lib/utils";
import { DeltaBadge, ConfigChangeBadge, type DeltaFormat } from "./delta-badge";

interface MetricRowProps {
  label: string;
  valueA: number | string | undefined | null;
  valueB: number | string | undefined | null;
  format?: DeltaFormat;
  formatValue?: (value: number | string | undefined | null) => string;
  higherIsBetter?: boolean;
  showDelta?: boolean;
  className?: string;
  highlight?: boolean;
}

function defaultFormatValue(value: number | string | undefined | null): string {
  if (value === undefined || value === null) return "-";
  if (typeof value === "string") return value;
  if (Math.abs(value) >= 1000000) {
    return `${(value / 1000000).toFixed(2)}M`;
  }
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  if (Number.isInteger(value)) {
    return value.toLocaleString();
  }
  return value.toFixed(2);
}

export function MetricRow({
  label,
  valueA,
  valueB,
  format = "percent",
  formatValue = defaultFormatValue,
  higherIsBetter = true,
  showDelta = true,
  className,
  highlight = false,
}: MetricRowProps) {
  const numA = typeof valueA === "number" ? valueA : undefined;
  const numB = typeof valueB === "number" ? valueB : undefined;
  const canShowDelta = showDelta && numA !== undefined && numB !== undefined;

  return (
    <div
      className={cn(
        "grid grid-cols-4 gap-4 py-2 px-3 items-center",
        highlight && "bg-accent/50 rounded-md",
        className
      )}
    >
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-sm font-mono text-center">{formatValue(valueA)}</div>
      <div className="text-sm font-mono text-center">{formatValue(valueB)}</div>
      <div className="text-sm text-center">
        {canShowDelta ? (
          <DeltaBadge
            valueA={numA}
            valueB={numB}
            format={format}
            higherIsBetter={higherIsBetter}
          />
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </div>
    </div>
  );
}

// Config row variant - shows string values and changed/same status
interface ConfigRowProps {
  label: string;
  valueA: string | number | undefined | null;
  valueB: string | number | undefined | null;
  formatValue?: (value: string | number | undefined | null) => string;
  className?: string;
  hideIfSame?: boolean;
}

function defaultConfigFormat(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return "-";
  if (typeof value === "number") {
    if (Number.isInteger(value)) return value.toLocaleString();
    return value.toFixed(2);
  }
  return value;
}

export function ConfigRow({
  label,
  valueA,
  valueB,
  formatValue = defaultConfigFormat,
  className,
  hideIfSame = false,
}: ConfigRowProps) {
  const strA = formatValue(valueA);
  const strB = formatValue(valueB);
  const changed = strA !== strB;

  if (hideIfSame && !changed) {
    return null;
  }

  return (
    <div
      className={cn(
        "grid grid-cols-4 gap-4 py-2 px-3 items-center",
        changed && "bg-yellow-500/10 rounded-md",
        className
      )}
    >
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-sm font-mono text-center">{strA}</div>
      <div className="text-sm font-mono text-center">{strB}</div>
      <div className="text-sm text-center">
        <ConfigChangeBadge changed={changed} />
      </div>
    </div>
  );
}

// Header row for metric tables
interface MetricHeaderProps {
  labelA?: string;
  labelB?: string;
  className?: string;
}

export function MetricHeader({
  labelA = "Test A",
  labelB = "Test B",
  className,
}: MetricHeaderProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-4 gap-4 py-2 px-3 border-b text-xs font-medium text-muted-foreground uppercase tracking-wider",
        className
      )}
    >
      <div>Metric</div>
      <div className="text-center">{labelA}</div>
      <div className="text-center">{labelB}</div>
      <div className="text-center">Delta</div>
    </div>
  );
}
