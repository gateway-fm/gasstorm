"use client";

import { Header } from "@/components/layout/header";
import { BridgePanel } from "@/components/bridge/bridge-panel";

export default function BridgePage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Hyperlane Bridge</h1>
          <p className="text-muted-foreground">
            Bridge ETH between L1 (Anvil) and L2 (op-reth) using Hyperlane warp routes
          </p>
        </div>
        <BridgePanel />
      </main>
    </div>
  );
}
