"use client";

import { useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChainStore } from "@/stores/chain-store";
import { cn } from "@/lib/utils";
import type { LogEntryType } from "@/types/chain";

const logTypeColors: Record<LogEntryType, string> = {
  info: "text-cyan-400",
  success: "text-green-400",
  error: "text-red-400",
  block: "text-purple-400",
  warning: "text-yellow-400",
};

interface ActivityLogProps {
  compact?: boolean;
  maxItems?: number;
}

export function ActivityLog({ compact = false, maxItems }: ActivityLogProps) {
  const logs = useChainStore((state) => state.logs);
  // Logs are stored newest-first, so take first N items
  const displayLogs = maxItems ? logs.slice(0, maxItems) : logs;
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to show new entries (scroll to top since newest is first)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [logs.length]);

  if (compact) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2 pt-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            Activity
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-3 pt-0">
          <div
            ref={scrollRef}
            className="h-[80px] overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent"
          >
            <div className="space-y-0.5 font-mono text-[11px]">
              {displayLogs.map((log, index) => (
                <div
                  key={log.id}
                  className={cn(
                    "leading-snug transition-opacity duration-300",
                    logTypeColors[log.type],
                    index === 0 && "animate-pulse"
                  )}
                >
                  <span className="text-muted-foreground/60" suppressHydrationWarning>
                    [{log.timestamp.toLocaleTimeString()}]
                  </span>{" "}
                  <span className="break-all">{log.message}</span>
                </div>
              ))}
              {logs.length === 0 && (
                <div className="text-muted-foreground/70">Waiting for events...</div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Activity Log</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[250px] rounded-md border bg-background p-3">
          <div className="space-y-1 font-mono text-xs">
            {logs.map((log) => (
              <div
                key={log.id}
                className={cn("leading-relaxed", logTypeColors[log.type])}
              >
                <span className="text-muted-foreground" suppressHydrationWarning>
                  [{log.timestamp.toLocaleTimeString()}.{log.timestamp.getMilliseconds().toString().padStart(3, '0')}]
                </span>{" "}
                {log.message}
              </div>
            ))}
            {logs.length === 0 && (
              <div className="text-muted-foreground">No activity yet</div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
