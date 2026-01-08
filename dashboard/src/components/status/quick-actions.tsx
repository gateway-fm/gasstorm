"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { sendL1Transaction, sendL2Transaction, buildBatchTransactions } from "@/lib/transaction-builder";
import { builder } from "@/lib/rpc-client";
import { useChainStore } from "@/stores/chain-store";
import { toast } from "sonner";

interface QuickActionsProps {
  onRefresh: () => void;
}

export function QuickActions({ onRefresh }: QuickActionsProps) {
  const [isSending, setIsSending] = useState(false);
  const addLog = useChainStore((state) => state.addLog);

  const handleSendL1Tx = async () => {
    setIsSending(true);
    addLog("Sending test transaction on L1...", "info");
    try {
      const { txHash } = await sendL1Transaction();
      addLog(`L1 TX sent: ${txHash.slice(0, 18)}...`, "success");
      toast.success("L1 transaction sent");
      setTimeout(onRefresh, 3000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      addLog(`L1 transaction failed: ${message}`, "error");
      toast.error("L1 transaction failed");
    } finally {
      setIsSending(false);
    }
  };

  const handleSendL2Tx = async () => {
    setIsSending(true);
    addLog("Sending test transaction on L2 (via Block Builder)...", "info");
    try {
      const { txHash } = await sendL2Transaction();
      addLog(`TX queued in Block Builder: ${txHash.slice(0, 18)}...`, "success");
      toast.success("L2 transaction queued");
      setTimeout(onRefresh, 3000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      addLog(`L2 transaction failed: ${message}`, "error");
      toast.error("L2 transaction failed");
    } finally {
      setIsSending(false);
    }
  };

  const handleSendMultipleTx = async (count: number) => {
    setIsSending(true);
    addLog(`Building ${count} L2 transactions with sequential nonces...`, "info");

    try {
      // Build all transactions with sequential nonces first
      const transactions = await buildBatchTransactions(count);
      addLog(`Sending ${count} transactions...`, "info");

      // Send all transactions
      let successCount = 0;
      for (let i = 0; i < transactions.length; i++) {
        try {
          const txHash = await builder.sendRawTransaction(transactions[i].signedTx);
          addLog(`TX ${i + 1}/${count} queued: ${txHash.slice(0, 12)}...`, "success");
          successCount++;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          addLog(`TX ${i + 1} failed: ${message}`, "error");
        }
      }

      toast.success(`${successCount}/${count} transactions sent`);
      setTimeout(onRefresh, 3000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      addLog(`Failed to build transactions: ${message}`, "error");
      toast.error("Failed to build transactions");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSendL1Tx}
            disabled={isSending}
          >
            Send L1 TX
          </Button>
          <Button
            size="sm"
            onClick={handleSendL2Tx}
            disabled={isSending}
          >
            Send L2 TX
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSendMultipleTx(5)}
            disabled={isSending}
          >
            Send 5 L2 TXs
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isSending}
          >
            Refresh
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          L2 TXs are sent to Block Builder (:13000), which batches them and submits via Engine API.
        </p>
      </CardContent>
    </Card>
  );
}
