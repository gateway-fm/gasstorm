"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TestRun } from "@/types/load-test";
import { formatGas } from "@/lib/statistics";

interface OnChainMetricsProps {
  testRun: TestRun;
}

export function OnChainMetrics({ testRun }: OnChainMetricsProps) {
  const hasOnChainData = testRun.onChainFirstBlock && testRun.onChainLastBlock;

  if (!hasOnChainData) {
    return null;
  }

  const blockCount = (testRun.onChainLastBlock ?? 0) - (testRun.onChainFirstBlock ?? 0) + 1;

  const metrics = [
    {
      label: "Block Range",
      value: `${testRun.onChainFirstBlock?.toLocaleString()} - ${testRun.onChainLastBlock?.toLocaleString()}`,
      unit: "",
      color: "text-muted-foreground",
    },
    {
      label: "Blocks",
      value: blockCount.toLocaleString(),
      unit: "",
      color: "text-blue-400",
    },
    {
      label: "Duration",
      value: testRun.onChainDurationSecs?.toFixed(1) ?? "N/A",
      unit: testRun.onChainDurationSecs ? "s" : "",
      color: "text-muted-foreground",
    },
    {
      label: "On-Chain TPS",
      value: testRun.onChainTps?.toFixed(1) ?? "N/A",
      unit: testRun.onChainTps ? "tx/s" : "",
      color: "text-purple-400",
    },
    {
      label: "On-Chain MGas/s",
      value: testRun.onChainMgasPerSec?.toFixed(2) ?? "N/A",
      unit: testRun.onChainMgasPerSec ? "Mgas/s" : "",
      color: "text-blue-400",
    },
    {
      label: "On-Chain TXs",
      value: testRun.onChainTxCount?.toLocaleString() ?? "N/A",
      unit: "",
      color: "text-green-400",
    },
    {
      label: "On-Chain Gas",
      value: testRun.onChainGasUsed ? formatGas(BigInt(testRun.onChainGasUsed)) : "N/A",
      unit: "",
      color: "text-cyan-400",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <span className="text-green-400">●</span>
          On-Chain Verification
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-3">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">{metric.label}</p>
              <p className={`text-lg font-bold font-mono ${metric.color}`}>
                {metric.value}
                {metric.unit && (
                  <span className="text-xs font-normal text-muted-foreground ml-1">
                    {metric.unit}
                  </span>
                )}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
          Verified by querying blocks {testRun.onChainFirstBlock?.toLocaleString()} to {testRun.onChainLastBlock?.toLocaleString()} from the chain.
        </div>
      </CardContent>
    </Card>
  );
}
