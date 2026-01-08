"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface BlockBuilderCardProps {
  isOnline: boolean;
  blocksBuilt: number;
  pendingTxs?: number;
  blockTimeMs?: number;
  skipEmptyBlocks?: boolean;
}

function formatBlockTime(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s`;
  }
  return `${ms}ms`;
}

export function BlockBuilderCard({
  isOnline,
  blocksBuilt,
  pendingTxs = 0,
  blockTimeMs = 2000,
  skipEmptyBlocks = false,
}: BlockBuilderCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base font-semibold">Block Builder</CardTitle>
          <p className="text-xs text-muted-foreground">Engine API Sequencer (Go)</p>
        </div>
        <Badge variant={isOnline ? "default" : "destructive"} className={isOnline ? "bg-green-600 hover:bg-green-600" : ""}>
          {isOnline ? "Online" : "Offline"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">TX Submission</span>
          <a
            href="http://localhost:13000"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline font-mono"
          >
            localhost:13000
          </a>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Block Time</span>
          <span className="font-mono">{formatBlockTime(blockTimeMs)}{skipEmptyBlocks ? " (skip empty)" : ""}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Blocks Built</span>
          <span className="font-mono" suppressHydrationWarning>{blocksBuilt > 0 ? blocksBuilt.toLocaleString() : "-"}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Pending TXs</span>
          <span className="font-mono">{pendingTxs}</span>
        </div>
      </CardContent>
    </Card>
  );
}
