"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ArchitectureDiagram() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Architecture</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Mobile: Simplified view */}
        <div className="sm:hidden rounded-md border bg-background p-4 text-xs font-mono text-muted-foreground space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-orange-400 font-semibold">Block Builder</span>
            <span>:13000</span>
          </div>
          <div className="pl-4 border-l-2 border-muted space-y-1">
            <div className="text-[10px]">engine_forkchoiceUpdatedV3</div>
            <div className="text-[10px]">engine_getPayloadV3</div>
            <div className="text-[10px]">engine_newPayloadV3</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-blue-400 font-semibold">op-reth</span>
            <span>:18546 RPC, :18551 Engine</span>
          </div>
          <div className="pl-4 border-l-2 border-muted">
            <div className="flex items-center gap-2">
              <span className="text-green-400 font-semibold">L1 Anvil</span>
              <span>:18545</span>
            </div>
          </div>
        </div>

        {/* Desktop: Full ASCII diagram */}
        <pre className="hidden sm:block rounded-md border bg-background p-4 text-xs font-mono text-muted-foreground overflow-x-auto">
          <span className="text-orange-400">Block Builder</span> (:13000)         <span className="text-blue-400">op-reth</span> (:18546 RPC, :18551 Engine)
          {"\n"}        |                                    |
          {"\n"}        |  engine_forkchoiceUpdatedV3        |
          {"\n"}        |  {"{"} transactions: [...],            |
          {"\n"}        |    noTxPool: true {"}"}                |
          {"\n"}        |------------------------------------&gt;|
          {"\n"}        |                                    |
          {"\n"}        |  engine_getPayloadV3               |
          {"\n"}        |&lt;------------------------------------|
          {"\n"}        |                                    |
          {"\n"}        |  engine_newPayloadV3               |
          {"\n"}        |------------------------------------&gt;|
          {"\n"}        |                                    |
          {"\n"}        |  Block imported!                   |
          {"\n"}        |                                    v
          {"\n"}        |                            +---------------+
          {"\n"}        +---------------------------&gt;|   L1 Anvil    | (:18545)
          {"\n"}             (future: Hyperlane)     +---------------+
        </pre>
      </CardContent>
    </Card>
  );
}
