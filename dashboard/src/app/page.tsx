"use client";

import { useCallback, useEffect, useRef } from "react";
import { ComponentStatus } from "@/components/status/component-status";
import { ActivityFeed } from "@/components/status/activity-feed";
import { useChainStore } from "@/stores/chain-store";
import { useActivityFeedStore } from "@/stores/activity-feed-store";
import { useChainData } from "@/hooks/use-rpc";
import { useActivityEmitter } from "@/hooks/use-activity-emitter";
import { useL1NewHead, useL2NewHead } from "@/contexts/websocket-context";

export default function DashboardPage() {
  useChainData();
  useActivityEmitter();

  const {
    setL1Status,
    setL2Status,
    lastL1Block,
    lastL2Block,
    setLastL1Block,
    setLastL2Block,
  } = useChainStore();

  const addEvent = useActivityFeedStore((s) => s.addEvent);

  // Use refs to track last block numbers to avoid stale closures
  const lastL1BlockRef = useRef(lastL1Block);
  const lastL2BlockRef = useRef(lastL2Block);

  useEffect(() => {
    lastL1BlockRef.current = lastL1Block;
  }, [lastL1Block]);

  useEffect(() => {
    lastL2BlockRef.current = lastL2Block;
  }, [lastL2Block]);

  // Handle L1 new block via WebSocket
  const handleL1NewHead = useCallback(
    (head: { number: string; hash: string }) => {
      const blockNum = parseInt(head.number, 16);
      if (blockNum > lastL1BlockRef.current) {
        setL1Status({ blockNumber: blockNum, isOnline: true, latestBlockHash: head.hash });
        if (lastL1BlockRef.current > 0) {
          addEvent("l1", "block", "info", `L1 Block ${blockNum}`, {
            hash: head.hash.slice(0, 10),
          });
        }
        setLastL1Block(blockNum);
      }
    },
    [setL1Status, addEvent, setLastL1Block],
  );

  // Handle L2 new block via WebSocket
  const handleL2NewHead = useCallback(
    (head: { number: string; hash: string }) => {
      const blockNum = parseInt(head.number, 16);
      if (blockNum > lastL2BlockRef.current) {
        setL2Status({ blockNumber: blockNum, isOnline: true, latestBlockHash: head.hash });
        if (lastL2BlockRef.current > 0) {
          addEvent("l2", "block", "info", `L2 Block ${blockNum} produced`, {
            hash: head.hash.slice(0, 10),
          });
        }
        setLastL2Block(blockNum);
      }
    },
    [setL2Status, addEvent, setLastL2Block],
  );

  useL1NewHead(handleL1NewHead);
  useL2NewHead(handleL2NewHead);

  return (
    <div className="h-full bg-background">
      <main className="container mx-auto px-4 py-6 h-full flex flex-col gap-4">
        <div className="shrink-0">
          <ComponentStatus />
        </div>
        <div className="min-h-0 flex-1">
          <ActivityFeed />
        </div>
      </main>
    </div>
  );
}
