"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, XCircle, AlertTriangle, Clock, ArrowRight, ShieldAlert } from "lucide-react";
import { useGoLoadTestStore } from "@/stores/go-load-test-store";

/** Execution layers that support preconfirmations */
const PRECONF_LAYERS = new Set(["reth", "op-reth"]);

interface VerificationSummaryProps {
  /** Execution layer name - hides preconf sections when not supported */
  executionLayer?: string;
}

export function VerificationSummary({ executionLayer }: VerificationSummaryProps = {}) {
  const {
    status,
    txSentCount,
    txConfirmedCount,
    txFailedCount,
    txDiscardedCount,
    averageTps,
    // Preconfirmation stage counters (Flashblocks-compliant)
    txPendingCount,
    txPreconfirmedCount,
    txRevokedCount,
    txDroppedCount,
  } = useGoLoadTestStore();

  const showPreconf = !executionLayer || PRECONF_LAYERS.has(executionLayer);

  // Don't show if test hasn't run
  if (status === "idle") {
    return null;
  }

  // Pending = sent - confirmed - failed - discarded
  const pendingCount = Math.max(0, txSentCount - txConfirmedCount - txFailedCount - txDiscardedCount);
  // All transactions accounted for (no pending), even if some were discarded
  const allAccountedFor = txSentCount > 0 && pendingCount === 0 && txFailedCount === 0;
  const hasFailures = txFailedCount > 0;
  const hasPending = pendingCount > 0;
  const hasDiscarded = txDiscardedCount > 0;
  const hasRevoked = txRevokedCount > 0;

  const confirmRate = txSentCount > 0 ? (txConfirmedCount / txSentCount) * 100 : 0;
  const preconfRate = txSentCount > 0 ? (txPreconfirmedCount / txSentCount) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          Transaction Verification
          {status === "running" && (
            <Clock className="h-4 w-4 animate-pulse text-blue-400" />
          )}
          {status === "completed" && allAccountedFor && !hasDiscarded && (
            <CheckCircle className="h-4 w-4 text-green-500" />
          )}
          {status === "completed" && allAccountedFor && hasDiscarded && (
            <CheckCircle className="h-4 w-4 text-orange-500" />
          )}
          {status === "completed" && hasFailures && (
            <XCircle className="h-4 w-4 text-red-500" />
          )}
          {status === "completed" && !hasFailures && hasPending && (
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Summary Grid */}
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="bg-muted/50 rounded p-2">
              <div className="text-lg font-mono font-bold">{txSentCount.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Sent</div>
            </div>
            <div className="bg-green-500/10 rounded p-2">
              <div className="text-lg font-mono font-bold text-green-400">
                {txConfirmedCount.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">Confirmed</div>
            </div>
            <div className="bg-red-500/10 rounded p-2">
              <div className="text-lg font-mono font-bold text-red-400">
                {txFailedCount.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">Failed</div>
            </div>
            {/* Show Discarded if we have discarded txs, otherwise show Pending */}
            {txDiscardedCount > 0 ? (
              <div className="bg-orange-500/10 rounded p-2">
                <div className="text-lg font-mono font-bold text-orange-400">
                  {txDiscardedCount.toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground">Discarded</div>
              </div>
            ) : (
              <div className="bg-yellow-500/10 rounded p-2">
                <div className="text-lg font-mono font-bold text-yellow-400">
                  {pendingCount.toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground">Pending</div>
              </div>
            )}
          </div>

          {/* Preconfirmation Pipeline (Flashblocks-compliant) - only for preconf-capable layers */}
          {showPreconf && (txPendingCount > 0 || txPreconfirmedCount > 0) && (
            <div className="mt-4 pt-3 border-t border-border/50">
              <div className="text-xs text-muted-foreground mb-2">Preconfirmation Pipeline</div>
              <div className="flex items-center justify-between text-xs gap-1">
                <div className="flex flex-col items-center flex-1 bg-blue-500/10 rounded p-1.5">
                  <div className="font-mono font-bold text-blue-400">{txPendingCount.toLocaleString()}</div>
                  <div className="text-muted-foreground">Queued</div>
                </div>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <div className="flex flex-col items-center flex-1 bg-purple-500/10 rounded p-1.5">
                  <div className="font-mono font-bold text-purple-400">{txPreconfirmedCount.toLocaleString()}</div>
                  <div className="text-muted-foreground">Preconf&apos;d</div>
                </div>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <div className="flex flex-col items-center flex-1 bg-green-500/10 rounded p-1.5">
                  <div className="font-mono font-bold text-green-400">{txConfirmedCount.toLocaleString()}</div>
                  <div className="text-muted-foreground">Confirmed</div>
                </div>
                {(txRevokedCount > 0 || txDroppedCount > 0) && (
                  <>
                    <div className="text-muted-foreground mx-1">|</div>
                    <div className="flex flex-col items-center bg-red-500/10 rounded p-1.5">
                      <div className="font-mono font-bold text-red-400">{(txRevokedCount + txDroppedCount).toLocaleString()}</div>
                      <div className="text-muted-foreground">Revoked</div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Revoked Warning - only for preconf-capable layers */}
          {showPreconf && hasRevoked && (
            <div className="flex items-center gap-2 text-xs text-orange-400 bg-orange-400/10 rounded p-2 mt-2">
              <ShieldAlert className="h-3 w-3" />
              {txRevokedCount.toLocaleString()} preconfirmations were revoked (execution layer rejected)
            </div>
          )}

          {/* Confirmation Rate */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Confirmation Rate</span>
            <span className="font-mono font-semibold">{confirmRate.toFixed(1)}%</span>
          </div>

          {/* Preconfirmation Rate - only for preconf-capable layers */}
          {showPreconf && txPreconfirmedCount > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Preconf Rate</span>
              <span className="font-mono font-semibold">{preconfRate.toFixed(1)}%</span>
            </div>
          )}

          {/* Average TPS */}
          {averageTps > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Average TPS</span>
              <span className="font-mono font-semibold">{averageTps.toFixed(0)} tx/s</span>
            </div>
          )}

          {/* Status Message */}
          {status === "running" && (
            <div className="flex items-center gap-2 text-sm text-blue-400 bg-blue-400/10 rounded p-2">
              <Clock className="h-4 w-4" />
              Test in progress...
            </div>
          )}

          {status === "completed" && allAccountedFor && !hasDiscarded && (
            <div className="flex items-center gap-2 text-sm text-green-400 bg-green-400/10 rounded p-2">
              <CheckCircle className="h-4 w-4" />
              All {txSentCount.toLocaleString()} transactions confirmed on-chain
            </div>
          )}

          {status === "completed" && allAccountedFor && hasDiscarded && (
            <div className="flex items-center gap-2 text-sm text-orange-400 bg-orange-400/10 rounded p-2">
              <AlertTriangle className="h-4 w-4" />
              {txConfirmedCount.toLocaleString()} confirmed, {txDiscardedCount.toLocaleString()} discarded (pending at test end)
            </div>
          )}

          {status === "completed" && hasFailures && (
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-400/10 rounded p-2">
              <XCircle className="h-4 w-4" />
              {txFailedCount.toLocaleString()} transactions failed
            </div>
          )}

          {status === "completed" && !hasFailures && hasPending && (
            <div className="flex items-center gap-2 text-sm text-yellow-400 bg-yellow-400/10 rounded p-2">
              <AlertTriangle className="h-4 w-4" />
              {pendingCount.toLocaleString()} transactions still pending
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
