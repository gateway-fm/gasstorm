"use client";

import Link from "next/link";
import { useChainStore } from "@/stores/chain-store";
import { useGoLoadTestStore } from "@/stores/go-load-test-store";

function StatusDot({ online }: { online: boolean }) {
  if (online) {
    return (
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
      </span>
    );
  }
  return <span className="inline-flex rounded-full h-2.5 w-2.5 bg-zinc-600" />;
}

interface ComponentRow {
  name: string;
  online: boolean;
  metrics?: string;
  href?: string;
}

function Row({ row }: { row: ComponentRow }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 border-b border-border/50 last:border-b-0">
      <StatusDot online={row.online} />
      <span className="text-sm">{row.name}</span>
      {row.href && (
        <Link href={row.href} className="text-xs text-blue-400 hover:underline">
          Open
        </Link>
      )}
      <div className="flex-1" />
      {row.metrics && (
        <span className="text-xs font-mono text-muted-foreground">{row.metrics}</span>
      )}
    </div>
  );
}

export function ComponentStatus() {
  const { l1, l2, builder, explorer, explorerL1, privacyProxy, bridge, blobDA, loadgen } = useChainStore();
  const loadTest = useGoLoadTestStore();

  const l1Name = l1.clientName ? `L1 (${l1.clientName})` : "L1";

  const rows: ComponentRow[] = [
    {
      name: l1Name,
      online: l1.isOnline,
      metrics: l1.isOnline
        ? `Block: ${l1.blockNumber.toLocaleString()} | Chain ID: ${l1.chainId}`
        : undefined,
    },
    {
      name: "L2 (Execution Layer)",
      online: l2.isOnline,
      metrics: l2.isOnline
        ? `Block: ${l2.blockNumber.toLocaleString()} | Chain ID: ${l2.chainId}`
        : undefined,
    },
    {
      name: "Block Builder",
      online: builder.isOnline,
      metrics: builder.isOnline
        ? `Block time: ${builder.blockTimeMs}ms | Pending: ${builder.pendingTxCount}`
        : undefined,
    },
    {
      name: "Load Generator",
      online: loadgen.isOnline,
      metrics: loadTest.status !== "idle" && loadTest.status !== "error"
        ? `Status: ${loadTest.status} | TPS: ${Math.round(loadTest.currentRate)}`
        : undefined,
    },
    {
      name: "L2 Block Explorer",
      online: explorer.isOnline,
      href: "/explorer-l2",
    },
    {
      name: "L1 Block Explorer",
      online: explorerL1.isOnline,
      href: "/explorer-l1",
    },
    {
      name: "Privacy Proxy",
      online: privacyProxy.isOnline,
      href: "/privacy",
    },
    {
      name: "Bridge Relayer",
      online: bridge.relayerOnline,
      metrics: bridge.relayerOnline
        ? `Pending: ${bridge.pendingMessages} | Relayed: ${bridge.messagesRelayed}`
        : undefined,
    },
    {
      name: "Bridge UI",
      online: bridge.uiOnline,
      metrics: bridge.uiOnline
        ? `Active transfers: ${bridge.activeTransfers}`
        : undefined,
      href: "/bridge-ui",
    },
    {
      name: "Blob DA",
      online: blobDA.isOnline,
      metrics: blobDA.isOnline
        ? `Batch: ${blobDA.latestBatch} | Compression: ${blobDA.compression}`
        : undefined,
    },
  ];

  const active = rows.filter((r) => r.online);
  const available = rows.filter((r) => !r.online);

  return (
    <div className="rounded-lg border bg-card text-card-foreground">
      <div className="p-4 pb-2">
        <h3 className="text-sm font-medium text-muted-foreground">Component Status</h3>
      </div>

      {active.length > 0 && (
        <div>
          <div className="px-4 py-1">
            <span className="text-xs font-medium uppercase tracking-wider text-green-500">Active</span>
          </div>
          {active.map((row) => (
            <Row key={row.name} row={row} />
          ))}
        </div>
      )}

      {available.length > 0 && (
        <div>
          <div className="px-4 py-1 mt-1">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Available</span>
          </div>
          {available.map((row) => (
            <Row key={row.name} row={row} />
          ))}
        </div>
      )}

      {active.length === 0 && available.length === 0 && (
        <div className="px-4 py-3 text-sm text-muted-foreground">No components detected</div>
      )}

      <div className="h-2" />
    </div>
  );
}
