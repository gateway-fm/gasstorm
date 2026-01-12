"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Settings,
  Layers,
  Receipt,
} from "lucide-react";
import type {
  TestRun,
  VerificationResult,
  EnvironmentSnapshot,
  TipOrderingResult,
  TxReceiptVerification,
} from "@/types/load-test";

interface VerificationDetailsProps {
  testRun: TestRun;
}

function EnvironmentCard({ env }: { env: EnvironmentSnapshot }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Settings className="h-4 w-4 text-blue-400" />
          Environment Snapshot
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <h4 className="text-xs text-muted-foreground mb-2 font-semibold">Block Builder</h4>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Block Time</span>
                <span className="font-mono">{env.builderBlockTimeMs}ms</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gas Limit</span>
                <span className="font-mono">{(env.builderGasLimit / 1e6).toFixed(0)}M</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Max TXs/Block</span>
                <span className="font-mono">{env.builderMaxTxsPerBlock.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">TX Ordering</span>
                <span className={`font-mono ${env.builderTxOrdering !== "fifo" ? "text-purple-400" : ""}`}>
                  {env.builderTxOrdering}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Preconfs</span>
                <span className={`font-mono ${env.builderEnablePreconfs ? "text-green-400" : "text-muted-foreground"}`}>
                  {env.builderEnablePreconfs ? "enabled" : "disabled"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Skip Empty</span>
                <span className="font-mono">{env.builderSkipEmptyBlocks ? "yes" : "no"}</span>
              </div>
            </div>
          </div>
          <div>
            <h4 className="text-xs text-muted-foreground mb-2 font-semibold">Load Generator</h4>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gas Tip Cap</span>
                <span className="font-mono">{env.loadGenGasTipCapGwei.toFixed(2)} Gwei</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gas Fee Cap</span>
                <span className="font-mono">{env.loadGenGasFeeCapGwei.toFixed(2)} Gwei</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Execution Layer</span>
                <span className="font-mono">{env.loadGenExecutionLayer}</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TipOrderingCard({ result }: { result: TipOrderingResult }) {
  const successRate = result.blocksSampled > 0
    ? (result.correctlyOrdered / result.blocksSampled) * 100
    : 100;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Layers className="h-4 w-4 text-purple-400" />
          Tip Ordering Verification
          {result.verified ? (
            <CheckCircle className="h-4 w-4 text-green-500 ml-auto" />
          ) : (
            <XCircle className="h-4 w-4 text-red-500 ml-auto" />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="bg-muted/50 rounded p-2">
              <div className="text-lg font-mono font-bold">{result.totalBlocks.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Total Blocks</div>
            </div>
            <div className="bg-blue-500/10 rounded p-2">
              <div className="text-lg font-mono font-bold text-blue-400">
                {result.blocksSampled.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">Sampled</div>
            </div>
            <div className="bg-green-500/10 rounded p-2">
              <div className="text-lg font-mono font-bold text-green-400">
                {result.correctlyOrdered.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">Correct</div>
            </div>
            <div className={`rounded p-2 ${result.orderingViolations?.length ? "bg-red-500/10" : "bg-muted/50"}`}>
              <div className={`text-lg font-mono font-bold ${result.orderingViolations?.length ? "text-red-400" : ""}`}>
                {(result.orderingViolations?.length ?? 0).toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">Violations</div>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Success Rate</span>
            <span className={`font-mono font-semibold ${successRate === 100 ? "text-green-400" : "text-yellow-400"}`}>
              {successRate.toFixed(1)}%
            </span>
          </div>

          {result.sampleBlocks && result.sampleBlocks.length > 0 && (
            <div className="pt-2 border-t border-border/50">
              <div className="text-xs text-muted-foreground mb-2">Sample Blocks</div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {result.sampleBlocks.map((block) => (
                  <div
                    key={block.blockNumber}
                    className={`flex items-center justify-between text-xs p-1.5 rounded ${
                      block.isOrdered ? "bg-green-500/5" : "bg-red-500/10"
                    }`}
                  >
                    <span className="font-mono">Block {block.blockNumber.toLocaleString()}</span>
                    <span className="text-muted-foreground">{block.txCount} TXs</span>
                    <span className={block.isOrdered ? "text-green-400" : "text-red-400"}>
                      {block.isOrdered ? "OK" : "FAIL"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.orderingViolations && result.orderingViolations.length > 0 && (
            <div className="pt-2 border-t border-border/50">
              <div className="text-xs text-red-400 mb-2 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Ordering Violations
              </div>
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {result.orderingViolations.slice(0, 5).map((v, i) => (
                  <div key={i} className="text-xs bg-red-500/10 rounded p-1.5">
                    <span className="font-mono">Block {v.blockNumber.toLocaleString()}</span>
                    <span className="text-muted-foreground"> TX #{v.txIndex}: </span>
                    <span className="text-red-400">{v.actualTip}</span>
                    <span className="text-muted-foreground"> should be {`<= `}</span>
                    <span className="text-green-400">{v.expectedTip}</span>
                  </div>
                ))}
                {result.orderingViolations.length > 5 && (
                  <div className="text-xs text-muted-foreground">
                    +{result.orderingViolations.length - 5} more violations
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TxReceiptsCard({ result }: { result: TxReceiptVerification }) {
  const allSuccess = result.revertCount === 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Receipt className="h-4 w-4 text-cyan-400" />
          TX Receipt Sampling
          {allSuccess ? (
            <CheckCircle className="h-4 w-4 text-green-500 ml-auto" />
          ) : (
            <XCircle className="h-4 w-4 text-red-500 ml-auto" />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-muted/50 rounded p-2">
              <div className="text-lg font-mono font-bold">{result.sampleSize.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Sampled</div>
            </div>
            <div className="bg-green-500/10 rounded p-2">
              <div className="text-lg font-mono font-bold text-green-400">
                {result.successCount.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">Success</div>
            </div>
            <div className={`rounded p-2 ${result.revertCount > 0 ? "bg-red-500/10" : "bg-muted/50"}`}>
              <div className={`text-lg font-mono font-bold ${result.revertCount > 0 ? "text-red-400" : ""}`}>
                {result.revertCount.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">Reverted</div>
            </div>
          </div>

          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Avg Gas Used</span>
              <span className="font-mono">{result.avgGasUsed.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Min Gas Used</span>
              <span className="font-mono">{result.minGasUsed.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Max Gas Used</span>
              <span className="font-mono">{result.maxGasUsed.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Gas Verified</span>
              <span className="font-mono">{(result.totalGasVerified / 1e6).toFixed(2)}M</span>
            </div>
          </div>

          {result.samples && result.samples.length > 0 && (
            <div className="pt-2 border-t border-border/50">
              <div className="text-xs text-muted-foreground mb-2">Sample Receipts</div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {result.samples.map((s) => (
                  <div
                    key={s.txHash}
                    className={`flex items-center justify-between text-xs p-1.5 rounded ${
                      s.status === 1 ? "bg-green-500/5" : "bg-red-500/10"
                    }`}
                  >
                    <span className="font-mono truncate max-w-[120px]" title={s.txHash}>
                      {s.txHash.slice(0, 10)}...
                    </span>
                    <span className="text-muted-foreground">{s.gasUsed.toLocaleString()} gas</span>
                    <span className={s.status === 1 ? "text-green-400" : "text-red-400"}>
                      {s.status === 1 ? "OK" : "REVERT"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function VerificationSummaryCard({ result }: { result: VerificationResult }) {
  return (
    <Card className={result.allChecksPass ? "border-green-500/30" : "border-red-500/30"}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          {result.allChecksPass ? (
            <>
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span className="text-green-400">All Verification Checks Passed</span>
            </>
          ) : (
            <>
              <XCircle className="h-5 w-5 text-red-500" />
              <span className="text-red-400">Verification Issues Detected</span>
            </>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Metrics Match</span>
            <span className={result.metricsMatch ? "text-green-400" : "text-red-400"}>
              {result.metricsMatch ? "Yes" : "No"}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">TX Count Delta</span>
            <span className={`font-mono ${result.txCountDelta === 0 ? "text-green-400" : "text-yellow-400"}`}>
              {result.txCountDelta > 0 ? "+" : ""}{result.txCountDelta}
            </span>
          </div>
          {result.tipOrdering && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Tip Ordering</span>
              <span className={result.tipOrdering.verified ? "text-green-400" : "text-red-400"}>
                {result.tipOrdering.verified ? "Verified" : "Failed"}
              </span>
            </div>
          )}
          {result.txReceipts && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">TX Receipts</span>
              <span className={result.txReceipts.revertCount === 0 ? "text-green-400" : "text-red-400"}>
                {result.txReceipts.revertCount === 0 ? "All Success" : `${result.txReceipts.revertCount} Reverted`}
              </span>
            </div>
          )}
          {result.warnings && result.warnings.length > 0 && (
            <div className="pt-2 border-t border-border/50">
              <div className="text-xs text-yellow-400 mb-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Warnings
              </div>
              <ul className="text-xs text-muted-foreground space-y-1">
                {result.warnings.map((w, i) => (
                  <li key={i} className="bg-yellow-500/10 rounded p-1.5">{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function VerificationDetails({ testRun }: VerificationDetailsProps) {
  const hasEnvironment = !!testRun.environment;
  const hasVerification = !!testRun.verification;

  if (!hasEnvironment && !hasVerification) {
    return null;
  }

  return (
    <div className="space-y-4">
      {hasVerification && testRun.verification && (
        <VerificationSummaryCard result={testRun.verification} />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {hasEnvironment && testRun.environment && (
          <EnvironmentCard env={testRun.environment} />
        )}

        {testRun.verification?.tipOrdering && (
          <TipOrderingCard result={testRun.verification.tipOrdering} />
        )}

        {testRun.verification?.txReceipts && (
          <TxReceiptsCard result={testRun.verification.txReceipts} />
        )}
      </div>
    </div>
  );
}
