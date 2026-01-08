"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, XCircle, AlertTriangle, Loader2 } from "lucide-react";
import type { CorrectnessResult, VerificationStatus } from "@/types/load-test";

interface CorrectnessReportProps {
  status: VerificationStatus;
  result: CorrectnessResult | null;
}

export function CorrectnessReport({ status, result }: CorrectnessReportProps) {
  if (status === "idle") {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          On-Chain Verification
          {status === "verifying" && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          {status === "completed" && result?.verified && (
            <CheckCircle className="h-4 w-4 text-green-500" />
          )}
          {status === "completed" && !result?.verified && (
            <XCircle className="h-4 w-4 text-red-500" />
          )}
          {status === "error" && (
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {status === "verifying" && (
          <p className="text-sm text-muted-foreground">
            Verifying transactions on chain...
          </p>
        )}

        {status === "error" && (
          <p className="text-sm text-red-400">
            Verification failed. Check console for details.
          </p>
        )}

        {status === "completed" && result && (
          <div className="space-y-3">
            {/* Summary */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-muted/50 rounded p-2">
                <div className="text-lg font-mono font-bold">{result.totalSent}</div>
                <div className="text-xs text-muted-foreground">Sent</div>
              </div>
              <div className="bg-muted/50 rounded p-2">
                <div className="text-lg font-mono font-bold text-green-400">
                  {result.onChainConfirmed}
                </div>
                <div className="text-xs text-muted-foreground">On-Chain</div>
              </div>
              <div className="bg-muted/50 rounded p-2">
                <div className="text-lg font-mono font-bold text-red-400">
                  {result.onChainFailed}
                </div>
                <div className="text-xs text-muted-foreground">Failed</div>
              </div>
              <div className="bg-muted/50 rounded p-2">
                <div className="text-lg font-mono font-bold text-yellow-400">
                  {result.missing}
                </div>
                <div className="text-xs text-muted-foreground">Missing</div>
              </div>
            </div>

            {/* Status message */}
            {result.verified ? (
              <div className="flex items-center gap-2 text-sm text-green-400 bg-green-400/10 rounded p-2">
                <CheckCircle className="h-4 w-4" />
                All {result.totalSent} transactions verified on-chain
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-red-400 bg-red-400/10 rounded p-2">
                <XCircle className="h-4 w-4" />
                Verification failed: {result.missing} missing, {result.onChainFailed} failed
              </div>
            )}

            {/* Nonce gaps */}
            {result.nonceGaps.length > 0 && (
              <div className="text-sm">
                <div className="text-yellow-400 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Nonce gaps detected: {result.nonceGaps.slice(0, 5).join(", ")}
                  {result.nonceGaps.length > 5 && ` and ${result.nonceGaps.length - 5} more`}
                </div>
              </div>
            )}

            {/* Missing tx hashes */}
            {result.missingTxHashes.length > 0 && (
              <div className="text-xs text-muted-foreground">
                <details>
                  <summary className="cursor-pointer hover:text-foreground">
                    Show missing transaction hashes
                  </summary>
                  <div className="mt-2 max-h-20 overflow-y-auto font-mono bg-muted/30 rounded p-2">
                    {result.missingTxHashes.map((hash) => (
                      <div key={hash} className="truncate">
                        {hash}
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
