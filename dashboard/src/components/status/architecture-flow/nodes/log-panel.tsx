"use client";

import { memo, useRef, useEffect, useState, useCallback, type MouseEvent } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Pause, Play } from "lucide-react";

export interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
}

const levelColors = {
  info: "text-blue-400",
  warn: "text-yellow-400",
  error: "text-red-400",
  debug: "text-muted-foreground/70",
};

const levelBg = {
  info: "bg-blue-500/10",
  warn: "bg-yellow-500/10",
  error: "bg-red-500/10",
  debug: "bg-transparent",
};

interface LogPanelProps {
  logs: LogEntry[];
  maxLines?: number;
  expanded?: boolean;
  onToggleExpand?: (e: MouseEvent) => void;
  className?: string;
}

export const LogPanel = memo(function LogPanel({
  logs,
  maxLines = 50,
  expanded = false,
  onToggleExpand,
  className,
}: LogPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current && expanded) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll, expanded]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 20;
    setAutoScroll(isAtBottom);
  }, []);

  const toggleAutoScroll = useCallback((e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setAutoScroll((prev) => !prev);
    if (!autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [autoScroll]);

  const displayLogs = logs.slice(-maxLines);

  if (!expanded) {
    return (
      <button
        onClick={onToggleExpand}
        className={cn(
          "nodrag nopan w-full flex items-center justify-center gap-1 py-1.5",
          "text-[9px] text-muted-foreground/60 hover:text-muted-foreground",
          "hover:bg-white/5 transition-colors border-t border-white/5 cursor-pointer",
          className
        )}
      >
        <ChevronDown className="h-3 w-3" />
        <span>Show Logs ({logs.length})</span>
      </button>
    );
  }

  return (
    <div className={cn("border-t border-white/5 nodrag nopan", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 bg-black/20">
        <button
          onClick={onToggleExpand}
          className="nodrag nopan flex items-center gap-1 text-[9px] text-muted-foreground/70 hover:text-muted-foreground cursor-pointer"
        >
          <ChevronUp className="h-3 w-3" />
          <span>Hide Logs</span>
        </button>
        <button
          onClick={toggleAutoScroll}
          className={cn(
            "nodrag nopan flex items-center gap-1 text-[9px] cursor-pointer",
            autoScroll
              ? "text-green-400/70 hover:text-green-400"
              : "text-muted-foreground/70 hover:text-muted-foreground"
          )}
          title={autoScroll ? "Pause auto-scroll" : "Resume auto-scroll"}
        >
          {autoScroll ? (
            <Pause className="h-2.5 w-2.5" />
          ) : (
            <Play className="h-2.5 w-2.5" />
          )}
        </button>
      </div>

      {/* Log content */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-20 overflow-y-auto overflow-x-hidden bg-black/30 font-mono text-[8px] leading-relaxed"
      >
        {displayLogs.length === 0 ? (
          <div className="px-2 py-2 text-muted-foreground/50 italic">
            No logs yet...
          </div>
        ) : (
          displayLogs.map((log, idx) => (
            <div
              key={idx}
              className={cn(
                "px-2 py-0.5 flex gap-1.5",
                levelBg[log.level],
                "hover:bg-white/5"
              )}
            >
              <span className="text-muted-foreground/50 shrink-0">
                {log.timestamp}
              </span>
              <span className={cn("shrink-0 uppercase", levelColors[log.level])}>
                [{log.level}]
              </span>
              <span className="text-foreground/80 truncate">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
});

export function generateDemoLogs(count: number): LogEntry[] {
  const messages = [
    { level: "info" as const, msg: "Block built successfully" },
    { level: "info" as const, msg: "TX pool drained" },
    { level: "debug" as const, msg: "FCU sent to op-reth" },
    { level: "debug" as const, msg: "GetPayload received" },
    { level: "warn" as const, msg: "High pending TX count" },
    { level: "info" as const, msg: "Preconf emitted" },
    { level: "error" as const, msg: "Engine API timeout" },
  ];

  return Array.from({ length: count }, (_, i) => {
    const m = messages[i % messages.length];
    const now = new Date();
    now.setSeconds(now.getSeconds() - (count - i));
    return {
      timestamp: now.toLocaleTimeString("en-US", { hour12: false }),
      level: m.level,
      message: `${m.msg} #${i + 1}`,
    };
  });
}
