"use client";

import { useCallback } from "react";
import { Header } from "@/components/layout/header";
import { ChainStatusCard } from "@/components/status/chain-status-card";
import { BlockBuilderCard } from "@/components/status/block-builder-card";
import { AccountCard } from "@/components/status/account-card";
import { QuickActions } from "@/components/status/quick-actions";
import { ActivityLog } from "@/components/status/activity-log";
import { ArchitectureDiagram } from "@/components/status/architecture-diagram";
import { useChainStore } from "@/stores/chain-store";
import { useChainData } from "@/hooks/use-rpc";
import { useL1WebSocket, useL2WebSocket } from "@/hooks/use-websocket";

export default function DashboardPage() {
  const { refreshAll, fetchBalances } = useChainData();

  const {
    l1,
    l2,
    builder,
    accountL1Balance,
    accountL2Balance,
    addLog,
    setL1Status,
    setL2Status,
    lastL1Block,
    lastL2Block,
    setLastL1Block,
    setLastL2Block,
  } = useChainStore();

  // Handle L1 new block via WebSocket
  const handleL1NewHead = useCallback(
    (head: { number: string; hash: string }) => {
      const blockNum = parseInt(head.number, 16);
      if (blockNum > lastL1Block) {
        setL1Status({ blockNumber: blockNum, isOnline: true, latestBlockHash: head.hash });
        if (lastL1Block > 0) {
          addLog(`L1 Block ${blockNum} (${head.hash.slice(0, 10)}...)`, "block");
        }
        setLastL1Block(blockNum);
        fetchBalances();
      }
    },
    [lastL1Block, setL1Status, addLog, setLastL1Block, fetchBalances]
  );

  // Handle L2 new block via WebSocket
  const handleL2NewHead = useCallback(
    (head: { number: string; hash: string }) => {
      const blockNum = parseInt(head.number, 16);
      if (blockNum > lastL2Block) {
        setL2Status({ blockNumber: blockNum, isOnline: true, latestBlockHash: head.hash });
        if (lastL2Block > 0) {
          addLog(`Block ${blockNum} produced by sequencer`, "block");
        }
        setLastL2Block(blockNum);
        fetchBalances();
      }
    },
    [lastL2Block, setL2Status, addLog, setLastL2Block, fetchBalances]
  );

  const { isConnected: l1WsConnected } = useL1WebSocket(handleL1NewHead);
  const { isConnected: l2WsConnected } = useL2WebSocket(handleL2NewHead);

  return (
    <div className="min-h-screen bg-background">
      <Header l1WsConnected={l1WsConnected} l2WsConnected={l2WsConnected} />

      <main className="container mx-auto px-4 py-6">
        {/* Status Cards Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
          <ChainStatusCard
            title="L1 - Anvil"
            subtitle="Ethereum L1 (local)"
            endpoint="localhost:18545"
            isOnline={l1.isOnline}
            blockNumber={l1.blockNumber}
            chainId={l1.chainId}
            gasPrice={l1.gasPrice}
          />

          <ChainStatusCard
            title="L2 - op-reth"
            subtitle="OP Stack Execution Client"
            endpoint="localhost:18546"
            isOnline={l2.isOnline}
            blockNumber={l2.blockNumber}
            chainId={l2.chainId}
            additionalInfo={
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Engine API</span>
                <span className="font-mono">localhost:18551 (JWT)</span>
              </div>
            }
          />

          <BlockBuilderCard
            isOnline={builder.isOnline}
            blocksBuilt={l2.blockNumber}
            blockTimeMs={builder.blockTimeMs}
            skipEmptyBlocks={builder.skipEmptyBlocks}
            pendingTxs={builder.pendingTxCount}
          />

          <QuickActions onRefresh={refreshAll} />
        </div>

        {/* Architecture Diagram */}
        <div className="mb-6">
          <ArchitectureDiagram />
        </div>

        {/* Account and Activity Log */}
        <div className="grid gap-4 md:grid-cols-2">
          <AccountCard l1Balance={accountL1Balance} l2Balance={accountL2Balance} />
          <ActivityLog />
        </div>
      </main>
    </div>
  );
}
