"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import type { TransactionLogEntry, PaginatedTxLogs } from "@/types/load-test";

// Transform Go API PascalCase to TypeScript camelCase for TransactionLogEntry
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformTxLog(log: any): TransactionLogEntry {
  return {
    txHash: log?.TxHash || log?.txHash || "",
    sentAtMs: log?.SentAtMs || log?.sentAtMs || 0,
    confirmedAtMs: log?.ConfirmedAtMs || log?.confirmedAtMs,
    preconfAtMs: log?.PreconfAtMs || log?.preconfAtMs,
    confirmLatencyMs: log?.ConfirmLatencyMs || log?.confirmLatencyMs,
    preconfLatencyMs: log?.PreconfLatencyMs || log?.preconfLatencyMs,
    status: log?.Status || log?.status || "pending",
    errorReason: log?.ErrorReason || log?.errorReason,
    fromAccount: log?.FromAccount ?? log?.fromAccount ?? 0,
    nonce: log?.Nonce ?? log?.nonce ?? 0,
    gasTipGwei: log?.GasTipGwei || log?.gasTipGwei,
  };
}

interface TxLogViewerProps {
  testId: string;
  open: boolean;
  onClose: () => void;
  txLoggingEnabled: boolean;
}

export function TxLogViewer({ testId, open, onClose, txLoggingEnabled }: TxLogViewerProps) {
  const [logs, setLogs] = useState<TransactionLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const limit = 100;

  const fetchLogs = useCallback(async () => {
    if (!txLoggingEnabled) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/loadgen/history/${testId}/transactions?limit=${limit}&offset=${offset}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch: ${res.statusText}`);
      }
      const data = await res.json();
      // Handle both PascalCase (Go) and camelCase responses
      const rawTransactions = data?.Transactions || data?.transactions || [];
      const rawTotal = data?.Total ?? data?.total ?? 0;

      // Transform each transaction from PascalCase to camelCase
      const transformedLogs = Array.isArray(rawTransactions)
        ? rawTransactions.map(transformTxLog)
        : [];

      setLogs(transformedLogs);
      setTotal(typeof rawTotal === "number" ? rawTotal : 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch transactions");
    } finally {
      setLoading(false);
    }
  }, [testId, offset, txLoggingEnabled]);

  useEffect(() => {
    if (open && txLoggingEnabled) {
      fetchLogs();
    }
  }, [open, fetchLogs, txLoggingEnabled]);

  const formatTxHash = (hash: string | undefined | null) => {
    if (!hash) return "N/A";
    if (hash.length <= 18) return hash;
    return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
  };

  const formatTimestamp = (ms: number) => {
    return new Date(ms).toLocaleTimeString();
  };

  const getStatusVariant = (status: string): "default" | "secondary" | "destructive" => {
    switch (status) {
      case "confirmed":
        return "default";
      case "failed":
        return "destructive";
      default:
        return "secondary";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Transaction Logs ({total.toLocaleString()} total)</DialogTitle>
        </DialogHeader>

        {!txLoggingEnabled ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <p>TX logging was disabled for this test (memory threshold exceeded)</p>
          </div>
        ) : loading && logs.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-8 text-destructive">
            <p>{error}</p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">TX Hash</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Confirm (ms)</TableHead>
                    <TableHead className="text-right">Preconf (ms)</TableHead>
                    <TableHead className="text-right">Account</TableHead>
                    <TableHead className="text-right">Nonce</TableHead>
                    <TableHead className="text-right">Sent At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.txHash}>
                      <TableCell className="font-mono text-xs">
                        <a
                          href={`#${log.txHash}`}
                          className="hover:underline flex items-center gap-1"
                          title={log.txHash}
                        >
                          {formatTxHash(log.txHash)}
                          <ExternalLink className="h-3 w-3 opacity-50" />
                        </a>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(log.status)}>
                          {log.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {log.confirmLatencyMs ? log.confirmLatencyMs.toLocaleString() : "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {log.preconfLatencyMs ? log.preconfLatencyMs.toLocaleString() : "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono">{log.fromAccount}</TableCell>
                      <TableCell className="text-right font-mono">{log.nonce}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {formatTimestamp(log.sentAtMs)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0 || loading}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Showing {offset + 1} - {Math.min(offset + limit, total)} of {total.toLocaleString()}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOffset(offset + limit)}
                disabled={offset + limit >= total || loading}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
