"use client";

import type { ActivityEvent } from "@/types/activity";
import { SOURCE_LABELS, SOURCE_COLORS } from "@/types/activity";

const SEVERITY_GUTTER: Record<string, string> = {
  info: "bg-blue-500",
  success: "bg-green-500",
  warning: "bg-amber-500",
  error: "bg-red-500",
};

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function ActivityFeedEvent({ event }: { event: ActivityEvent }) {
  return (
    <div className="group flex items-start gap-2 px-3 py-1.5 hover:bg-muted/50 transition-colors">
      {/* Severity gutter */}
      <div className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${SEVERITY_GUTTER[event.severity]}`} />

      {/* Timestamp */}
      <span className="text-xs font-mono text-muted-foreground shrink-0 mt-0.5">
        {formatTime(event.timestamp)}
      </span>

      {/* Source badge */}
      <span
        className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${SOURCE_COLORS[event.source]}`}
      >
        {SOURCE_LABELS[event.source]}
      </span>

      {/* Message */}
      <span className="text-sm text-foreground truncate">{event.message}</span>

      {/* Metadata tooltip (shown on hover) */}
      {event.metadata && Object.keys(event.metadata).length > 0 && (
        <span className="hidden group-hover:inline-flex text-[10px] text-muted-foreground font-mono ml-auto shrink-0">
          {Object.entries(event.metadata)
            .map(([k, v]) => `${k}=${v}`)
            .join(" ")}
        </span>
      )}
    </div>
  );
}
