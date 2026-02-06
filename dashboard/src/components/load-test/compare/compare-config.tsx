"use client";

import { useState } from "react";
import { Settings, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { TestRun } from "@/types/load-test";
import { CompareSection } from "./compare-section";
import { ConfigRow, MetricHeader } from "./metric-row";

interface CompareConfigProps {
  testA: TestRun;
  testB: TestRun;
  labelA?: string;
  labelB?: string;
}

function getPatternLabel(pattern: string): string {
  const labels: Record<string, string> = {
    constant: "Constant Rate",
    ramp: "Ramp Up",
    spike: "Spike",
    adaptive: "Adaptive",
    realistic: "Realistic",
  };
  return labels[pattern] || pattern;
}

function getTxTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    "eth-transfer": "ETH Transfer",
    "erc20-transfer": "ERC20 Transfer",
    "erc20-approve": "ERC20 Approve",
    "uniswap-swap": "Uniswap Swap",
    "storage-write": "Storage Write",
    "heavy-compute": "Heavy Compute",
  };
  return labels[type] || type;
}

function formatDuration(ms: number | undefined): string {
  if (!ms) return "-";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

export function CompareConfig({
  testA,
  testB,
  labelA = "Test A",
  labelB = "Test B",
}: CompareConfigProps) {
  const [showAll, setShowAll] = useState(false);

  // Count differences
  const configA = testA.config;
  const configB = testB.config;
  const envA = testA.environment;
  const envB = testB.environment;

  const differences: string[] = [];

  if (testA.pattern !== testB.pattern) differences.push("pattern");
  if (testA.transactionType !== testB.transactionType) differences.push("txType");
  if (testA.durationMs !== testB.durationMs) differences.push("duration");
  if (testA.executionLayer !== testB.executionLayer) differences.push("executionLayer");
  if (configA?.constantRate !== configB?.constantRate) differences.push("constantRate");
  if (configA?.rampStart !== configB?.rampStart) differences.push("rampStart");
  if (configA?.rampEnd !== configB?.rampEnd) differences.push("rampEnd");
  if (configA?.rampSteps !== configB?.rampSteps) differences.push("rampSteps");
  if (configA?.spikeRate !== configB?.spikeRate) differences.push("spikeRate");
  if (configA?.baselineRate !== configB?.baselineRate) differences.push("baselineRate");
  if (envA?.builderBlockTimeMs !== envB?.builderBlockTimeMs) differences.push("blockTime");
  if (envA?.builderTxOrdering !== envB?.builderTxOrdering) differences.push("txOrdering");
  if (envA?.builderEnablePreconfs !== envB?.builderEnablePreconfs) differences.push("preconfs");
  if (envA?.nodeName !== envB?.nodeName) differences.push("nodeName");
  if (envA?.nodeVersion !== envB?.nodeVersion) differences.push("nodeVersion");

  return (
    <CompareSection
      title="Configuration Differences"
      icon={<Settings className="h-4 w-4 text-muted-foreground" />}
      badge={
        differences.length > 0 && (
          <Badge variant="secondary" className="text-xs">
            {differences.length} different
          </Badge>
        )
      }
    >
      <div className="p-4 space-y-2">
        <div className="flex justify-end mb-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAll(!showAll)}
            className="text-xs gap-1"
          >
            {showAll ? (
              <>
                <EyeOff className="h-3 w-3" />
                Show Differences Only
              </>
            ) : (
              <>
                <Eye className="h-3 w-3" />
                Show All
              </>
            )}
          </Button>
        </div>

        <MetricHeader labelA={labelA} labelB={labelB} />

        {/* Core config */}
        <ConfigRow
          label="Pattern"
          valueA={getPatternLabel(testA.pattern)}
          valueB={getPatternLabel(testB.pattern)}
          hideIfSame={!showAll}
        />
        <ConfigRow
          label="Transaction Type"
          valueA={testA.pattern === "realistic" ? "Mixed" : getTxTypeLabel(testA.transactionType)}
          valueB={testB.pattern === "realistic" ? "Mixed" : getTxTypeLabel(testB.transactionType)}
          hideIfSame={!showAll}
        />
        <ConfigRow
          label="Duration"
          valueA={formatDuration(testA.durationMs)}
          valueB={formatDuration(testB.durationMs)}
          hideIfSame={!showAll}
        />
        <ConfigRow
          label="Execution Layer"
          valueA={testA.executionLayer || "reth"}
          valueB={testB.executionLayer || "reth"}
          hideIfSame={!showAll}
        />

        {/* Pattern-specific config */}
        {(testA.pattern === "constant" || testB.pattern === "constant") && (
          <ConfigRow
            label="Target Rate"
            valueA={configA?.constantRate ? `${configA.constantRate} tx/s` : undefined}
            valueB={configB?.constantRate ? `${configB.constantRate} tx/s` : undefined}
            hideIfSame={!showAll}
          />
        )}

        {(testA.pattern === "ramp" || testB.pattern === "ramp") && (
          <>
            <ConfigRow
              label="Ramp Start"
              valueA={configA?.rampStart ? `${configA.rampStart} tx/s` : undefined}
              valueB={configB?.rampStart ? `${configB.rampStart} tx/s` : undefined}
              hideIfSame={!showAll}
            />
            <ConfigRow
              label="Ramp End"
              valueA={configA?.rampEnd ? `${configA.rampEnd} tx/s` : undefined}
              valueB={configB?.rampEnd ? `${configB.rampEnd} tx/s` : undefined}
              hideIfSame={!showAll}
            />
            <ConfigRow
              label="Ramp Steps"
              valueA={configA?.rampSteps}
              valueB={configB?.rampSteps}
              hideIfSame={!showAll}
            />
          </>
        )}

        {(testA.pattern === "spike" || testB.pattern === "spike") && (
          <>
            <ConfigRow
              label="Baseline Rate"
              valueA={configA?.baselineRate ? `${configA.baselineRate} tx/s` : undefined}
              valueB={configB?.baselineRate ? `${configB.baselineRate} tx/s` : undefined}
              hideIfSame={!showAll}
            />
            <ConfigRow
              label="Spike Rate"
              valueA={configA?.spikeRate ? `${configA.spikeRate} tx/s` : undefined}
              valueB={configB?.spikeRate ? `${configB.spikeRate} tx/s` : undefined}
              hideIfSame={!showAll}
            />
          </>
        )}

        {/* Environment config */}
        {(envA || envB) && (
          <>
            <div className="border-t my-3" />
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 py-1">
              Environment
            </div>
            <ConfigRow
              label="Node Name"
              valueA={envA?.nodeName}
              valueB={envB?.nodeName}
              hideIfSame={!showAll}
            />
            <ConfigRow
              label="Node Version"
              valueA={envA?.nodeVersion?.slice(0, 30)}
              valueB={envB?.nodeVersion?.slice(0, 30)}
              hideIfSame={!showAll}
            />
            <ConfigRow
              label="Block Time"
              valueA={envA?.builderBlockTimeMs ? `${envA.builderBlockTimeMs}ms` : undefined}
              valueB={envB?.builderBlockTimeMs ? `${envB.builderBlockTimeMs}ms` : undefined}
              hideIfSame={!showAll}
            />
            <ConfigRow
              label="TX Ordering"
              valueA={envA?.builderTxOrdering}
              valueB={envB?.builderTxOrdering}
              hideIfSame={!showAll}
            />
            <ConfigRow
              label="Preconfirmations"
              valueA={envA?.builderEnablePreconfs ? "Enabled" : "Disabled"}
              valueB={envB?.builderEnablePreconfs ? "Enabled" : "Disabled"}
              hideIfSame={!showAll}
            />
            <ConfigRow
              label="Block Builder"
              valueA={envA?.useBlockBuilder ? "External" : "Internal"}
              valueB={envB?.useBlockBuilder ? "External" : "Internal"}
              hideIfSame={!showAll}
            />
          </>
        )}

        {differences.length === 0 && !showAll && (
          <div className="text-sm text-muted-foreground text-center py-4">
            No configuration differences found
          </div>
        )}
      </div>
    </CompareSection>
  );
}
