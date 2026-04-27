"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useChainStore } from "@/stores/chain-store";

interface ExplorerStats {
  totalBlocks: number;
  totalTransactions: number;
  totalAddresses: number;
  avgBlockTime: number;
}

interface GasTier {
  price: number;
  priceWei: string;
  baseFee: number;
  priorityFee: number;
}

interface GasStats {
  slow: GasTier | null;
  normal: GasTier | null;
  fast: GasTier | null;
}

function formatGas(gwei: number | string | null): string {
  if (gwei === null || gwei === undefined) return "-";
  const n = typeof gwei === "string" ? parseFloat(gwei) : gwei;
  if (isNaN(n)) return "-";
  if (n < 1) return "<1";
  return n.toFixed(0);
}

export function ChainInfo() {
  const { l1, l2, builder } = useChainStore();
  const [l1Stats, setL1Stats] = useState<ExplorerStats | null>(null);
  const [l2Stats, setL2Stats] = useState<ExplorerStats | null>(null);
  const [l1Gas, setL1Gas] = useState<GasStats | null>(null);
  const [l2Gas, setL2Gas] = useState<GasStats | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [l2StatsRes, l1StatsRes, l2GasRes, l1GasRes] = await Promise.allSettled([
          fetch("/api/explorer/stats").then(r => r.json()),
          fetch("/api/explorer-l1/stats").then(r => r.json()),
          fetch("/api/explorer/gas").then(r => r.json()),
          fetch("/api/explorer-l1/gas").then(r => r.json()),
        ]);
        if (l2StatsRes.status === "fulfilled") setL2Stats(l2StatsRes.value);
        if (l1StatsRes.status === "fulfilled") setL1Stats(l1StatsRes.value);
        if (l2GasRes.status === "fulfilled") setL2Gas(l2GasRes.value);
        if (l1GasRes.status === "fulfilled") setL1Gas(l1GasRes.value);
      } catch { /* ignore */ }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card className="py-0">
      <CardContent className="py-3.5 px-4 space-y-2.5">
        {/* L1 */}
        <ChainRow
          label="L1"
          name={l1.clientName ?? "Anvil"}
          online={l1.isOnline}
          block={l1.blockNumber}
          chainId={l1.chainId}
          stats={l1Stats}
          gas={l1Gas}
        />
        {/* Divider */}
        <div className="border-t border-border/50" />
        {/* L2 */}
        <ChainRow
          label="L2"
          name={l2.clientName ?? "op-reth"}
          online={l2.isOnline}
          block={l2.blockNumber}
          chainId={l2.chainId}
          blockTimeMs={builder.isOnline ? builder.blockTimeMs : undefined}
          stats={l2Stats}
          gas={l2Gas}
        />
      </CardContent>
    </Card>
  );
}

function ChainRow({
  label,
  name,
  online,
  block,
  chainId,
  blockTimeMs,
  stats,
  gas,
}: {
  label: string;
  name: string;
  online: boolean;
  block: number;
  chainId: number;
  blockTimeMs?: number;
  stats: ExplorerStats | null;
  gas: GasStats | null;
}) {
  return (
    <div className="flex items-center gap-4">
      {/* Status + Name */}
      <div className="flex items-center gap-2 min-w-[100px]">
        <span className={`h-2 w-2 rounded-full shrink-0 ${online ? "bg-green-500" : "bg-muted-foreground/40"}`} />
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-muted-foreground uppercase">{label}</span>
            <span className="text-sm font-semibold font-mono">{name}</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 flex-1 justify-end text-xs font-mono text-muted-foreground">
        <span>Block {block.toLocaleString()}</span>
        <span className="text-border">|</span>
        <span>Chain {chainId}</span>
        <span className="text-border">|</span>
        <span>
          {blockTimeMs
            ? `${blockTimeMs}ms`
            : stats?.avgBlockTime
              ? `${stats.avgBlockTime}s`
              : "-"}
        </span>
        <span className="text-border">|</span>
        <span>{stats ? stats.totalTransactions.toLocaleString() : "0"} txs</span>
        <span className="text-border">|</span>
        <span>Gas: {gas?.normal ? formatGas(gas.normal.price) : "0"} gwei</span>
      </div>
    </div>
  );
}
