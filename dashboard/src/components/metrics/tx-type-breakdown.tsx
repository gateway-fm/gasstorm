"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useGoLoadTestStore } from "@/stores/go-load-test-store";
import type { TransactionType } from "@/types/load-test";

const TX_TYPE_LABELS: Record<TransactionType, string> = {
  "eth-transfer": "ETH Transfer",
  "erc20-transfer": "ERC20 Transfer",
  "erc20-approve": "ERC20 Approve",
  "uniswap-swap": "Uniswap Swap",
  "storage-write": "Storage Write",
  "heavy-compute": "Heavy Compute",
};

// Order by typical gas cost (smallest to largest)
const TX_TYPE_GAS_ORDER: Record<TransactionType, number> = {
  "eth-transfer": 1,     // ~21,000 gas
  "erc20-approve": 2,    // ~46,000 gas
  "storage-write": 3,    // ~50,000 gas
  "erc20-transfer": 4,   // ~65,000 gas
  "heavy-compute": 5,    // ~100,000 gas
  "uniswap-swap": 6,     // ~150,000 gas
};

export function TxTypeBreakdown() {
  const { txTypeMetrics, accountsActive, accountsFunded, config, status } = useGoLoadTestStore();

  // Only show for realistic and adaptive-realistic modes
  if (config?.pattern !== "realistic" && config?.pattern !== "adaptive-realistic") {
    return null;
  }

  // Don't show if test hasn't run
  if (status === "idle") {
    return null;
  }

  const totalSent = txTypeMetrics.reduce((sum, m) => sum + m.sent, 0);
  const totalConfirmed = txTypeMetrics.reduce((sum, m) => sum + m.confirmed, 0);
  const totalFailed = txTypeMetrics.reduce((sum, m) => sum + m.failed, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-semibold">Transaction Type Breakdown</CardTitle>
        <div className="text-sm space-x-4">
          <span>
            <span className="text-muted-foreground">Accounts: </span>
            <span className="font-mono font-semibold">
              {accountsActive}/{accountsFunded}
            </span>
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {txTypeMetrics.length > 0 ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Confirmed</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">Avg Tip</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...txTypeMetrics]
                  .sort((a, b) => (TX_TYPE_GAS_ORDER[a.type] ?? 99) - (TX_TYPE_GAS_ORDER[b.type] ?? 99))
                  .map((metric) => (
                  <TableRow key={metric.type}>
                    <TableCell className="font-medium">
                      {TX_TYPE_LABELS[metric.type] ?? metric.type}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {metric.sent.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono text-green-500">
                      {metric.confirmed.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono text-red-500">
                      {metric.failed > 0 ? metric.failed.toLocaleString() : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {metric.avgTipGwei.toFixed(2)} gwei
                    </TableCell>
                  </TableRow>
                ))}
                {/* Total row */}
                <TableRow className="border-t-2 font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right font-mono">
                    {totalSent.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-mono text-green-500">
                    {totalConfirmed.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-mono text-red-500">
                    {totalFailed > 0 ? totalFailed.toLocaleString() : "-"}
                  </TableCell>
                  <TableCell className="text-right font-mono">-</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </>
        ) : (
          <div className="h-[150px] flex items-center justify-center text-muted-foreground text-sm">
            No transaction data yet - waiting for test to start...
          </div>
        )}
      </CardContent>
    </Card>
  );
}
