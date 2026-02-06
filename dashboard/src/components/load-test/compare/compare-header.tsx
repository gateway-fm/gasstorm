"use client";

import { ArrowLeft, ArrowLeftRight, Calendar, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { TestRun } from "@/types/load-test";

interface CompareHeaderProps {
  testA: TestRun;
  testB: TestRun;
  onSwap: () => void;
  onBack: () => void;
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ms: number | undefined): string {
  if (!ms) return "-";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

function getPatternLabel(pattern: string): string {
  const labels: Record<string, string> = {
    constant: "Constant",
    ramp: "Ramp",
    spike: "Spike",
    adaptive: "Adaptive",
    realistic: "Realistic",
  };
  return labels[pattern] || pattern;
}

interface TestCardProps {
  test: TestRun;
  label: string;
  colorClass: string;
}

function TestCard({ test, label, colorClass }: TestCardProps) {
  return (
    <div className={`flex-1 p-4 rounded-lg border ${colorClass}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
      </div>
      <h3 className="font-semibold truncate">
        {test.customName || `${getPatternLabel(test.pattern)} Test`}
      </h3>
      <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {formatDateTime(test.startedAt)}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatDuration(test.durationMs)}
        </span>
      </div>
      <div className="flex items-center gap-2 mt-2">
        <Badge variant="outline" className="text-xs">
          {getPatternLabel(test.pattern)}
        </Badge>
        <Badge
          variant="secondary"
          className={`text-xs ${
            test.executionLayer === "cdk-erigon"
              ? "bg-primary/10 text-primary"
              : test.executionLayer === "gravity-reth"
              ? "bg-success/10 text-success"
              : "bg-warning/10 text-warning"
          }`}
        >
          {test.executionLayer || "reth"}
        </Badge>
      </div>
    </div>
  );
}

export function CompareHeader({ testA, testB, onSwap, onBack }: CompareHeaderProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2 -ml-2">
          <ArrowLeft className="h-4 w-4" />
          Back to History
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold">Compare Tests</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Side-by-side comparison of test results and performance metrics
        </p>
      </div>

      <div className="flex items-center gap-3">
        <TestCard
          test={testA}
          label="Test A"
          colorClass="bg-info/5 border-info/20"
        />

        <Button
          variant="outline"
          size="icon"
          onClick={onSwap}
          className="shrink-0 h-10 w-10"
          title="Swap tests"
        >
          <ArrowLeftRight className="h-4 w-4" />
        </Button>

        <TestCard
          test={testB}
          label="Test B"
          colorClass="bg-primary/5 border-primary/20"
        />
      </div>
    </div>
  );
}
