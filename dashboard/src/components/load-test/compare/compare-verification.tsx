"use client";

import { CheckCircle, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { TestRun } from "@/types/load-test";
import { CompareSection } from "./compare-section";
import { MetricRow, MetricHeader } from "./metric-row";

interface CompareVerificationProps {
  testA: TestRun;
  testB: TestRun;
  labelA?: string;
  labelB?: string;
}

function formatPercent(value: number | string | undefined | null): string {
  if (value === undefined || value === null) return "-";
  if (typeof value === "string") return value;
  return `${value.toFixed(2)}%`;
}

function formatCount(value: number | string | undefined | null): string {
  if (value === undefined || value === null) return "-";
  if (typeof value === "string") return value;
  return value.toLocaleString();
}

function getConfirmRate(test: TestRun): number | undefined {
  if (!test.txSent || test.txSent === 0) return undefined;
  return (test.txConfirmed / test.txSent) * 100;
}

function getRevertCount(test: TestRun): number | undefined {
  return test.verification?.txReceipts?.revertCount;
}

function hasIssues(test: TestRun): boolean {
  return (
    test.txFailed > 0 ||
    (test.txDiscarded !== undefined && test.txDiscarded > 0) ||
    (getRevertCount(test) ?? 0) > 0 ||
    (test.verification?.tipOrdering?.violationCount ?? 0) > 0
  );
}

export function CompareVerification({
  testA,
  testB,
  labelA = "Test A",
  labelB = "Test B",
}: CompareVerificationProps) {
  const aHasIssues = hasIssues(testA);
  const bHasIssues = hasIssues(testB);

  return (
    <CompareSection
      title="Verification & Reverts"
      icon={
        aHasIssues || bHasIssues ? (
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
        ) : (
          <CheckCircle className="h-4 w-4 text-green-500" />
        )
      }
      badge={
        (aHasIssues || bHasIssues) && (
          <Badge variant="secondary" className="text-xs bg-yellow-500/10 text-yellow-500">
            Issues found
          </Badge>
        )
      }
    >
      <div className="p-4">
        <MetricHeader labelA={labelA} labelB={labelB} />

        {/* Transaction counts */}
        <MetricRow
          label="TX Sent"
          valueA={testA.txSent}
          valueB={testB.txSent}
          format="percent"
          formatValue={formatCount}
          higherIsBetter={true}
        />
        <MetricRow
          label="TX Confirmed"
          valueA={testA.txConfirmed}
          valueB={testB.txConfirmed}
          format="percent"
          formatValue={formatCount}
          higherIsBetter={true}
        />
        <MetricRow
          label="TX Failed"
          valueA={testA.txFailed}
          valueB={testB.txFailed}
          format="absolute"
          formatValue={formatCount}
          higherIsBetter={false}
          highlight={testA.txFailed > 0 || testB.txFailed > 0}
        />
        {(testA.txDiscarded !== undefined || testB.txDiscarded !== undefined) && (
          <MetricRow
            label="TX Discarded"
            valueA={testA.txDiscarded}
            valueB={testB.txDiscarded}
            format="absolute"
            formatValue={formatCount}
            higherIsBetter={false}
            highlight={(testA.txDiscarded ?? 0) > 0 || (testB.txDiscarded ?? 0) > 0}
          />
        )}

        {/* Success rate */}
        <MetricRow
          label="Confirm Rate"
          valueA={getConfirmRate(testA)}
          valueB={getConfirmRate(testB)}
          format="percentPoints"
          formatValue={formatPercent}
          higherIsBetter={true}
        />

        {/* Reverts from receipt verification */}
        {(testA.verification?.txReceipts || testB.verification?.txReceipts) && (
          <>
            <div className="border-t my-3" />
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 py-1">
              Receipt Verification
            </div>
            <MetricRow
              label="Sample Size"
              valueA={testA.verification?.txReceipts?.sampleSize}
              valueB={testB.verification?.txReceipts?.sampleSize}
              format="absolute"
              formatValue={formatCount}
              showDelta={false}
            />
            <MetricRow
              label="Successful"
              valueA={testA.verification?.txReceipts?.successCount}
              valueB={testB.verification?.txReceipts?.successCount}
              format="percent"
              formatValue={formatCount}
              higherIsBetter={true}
            />
            <MetricRow
              label="Reverted"
              valueA={getRevertCount(testA)}
              valueB={getRevertCount(testB)}
              format="absolute"
              formatValue={formatCount}
              higherIsBetter={false}
              highlight={(getRevertCount(testA) ?? 0) > 0 || (getRevertCount(testB) ?? 0) > 0}
            />
          </>
        )}

        {/* Tip ordering violations */}
        {(testA.verification?.tipOrdering || testB.verification?.tipOrdering) && (
          <>
            <div className="border-t my-3" />
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 py-1">
              Tip Ordering
            </div>
            <MetricRow
              label="Blocks Sampled"
              valueA={testA.verification?.tipOrdering?.blocksSampled}
              valueB={testB.verification?.tipOrdering?.blocksSampled}
              format="absolute"
              formatValue={formatCount}
              showDelta={false}
            />
            <MetricRow
              label="Correctly Ordered"
              valueA={testA.verification?.tipOrdering?.correctlyOrdered}
              valueB={testB.verification?.tipOrdering?.correctlyOrdered}
              format="percent"
              formatValue={formatCount}
              higherIsBetter={true}
            />
            <MetricRow
              label="Violations"
              valueA={testA.verification?.tipOrdering?.violationCount}
              valueB={testB.verification?.tipOrdering?.violationCount}
              format="absolute"
              formatValue={formatCount}
              higherIsBetter={false}
              highlight={
                (testA.verification?.tipOrdering?.violationCount ?? 0) > 0 ||
                (testB.verification?.tipOrdering?.violationCount ?? 0) > 0
              }
            />
          </>
        )}

        {/* Metrics match verification */}
        {(testA.verification || testB.verification) && (
          <>
            <div className="border-t my-3" />
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 py-1">
              On-Chain Verification
            </div>
            <MetricRow
              label="TX Count Delta"
              valueA={testA.verification?.txCountDelta}
              valueB={testB.verification?.txCountDelta}
              format="absolute"
              formatValue={formatCount}
              higherIsBetter={false}
            />
          </>
        )}
      </div>
    </CompareSection>
  );
}
