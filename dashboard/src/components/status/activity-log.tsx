"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChainStore } from "@/stores/chain-store";
import { cn } from "@/lib/utils";
import type { LogEntryType } from "@/types/chain";

const logTypeColors: Record<LogEntryType, string> = {
  info: "text-blue-400",
  success: "text-green-400",
  error: "text-red-400",
  block: "text-purple-400",
  warning: "text-yellow-400",
};

export function ActivityLog() {
  const logs = useChainStore((state) => state.logs);

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
