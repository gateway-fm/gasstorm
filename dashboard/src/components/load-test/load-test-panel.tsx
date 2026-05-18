"use client";

import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGoLoadTestStore } from "@/stores/go-load-test-store";
import { useMetricsStore } from "@/stores/metrics-store";
import {
  TRANSACTION_TYPES,
  type LoadPattern,
  type TransactionType,
} from "@/types/load-test";
import { getPatternDescription, getDefaultConfigForPattern } from "@/lib/load-patterns";
import { needsDeployment, loadDeployedContracts } from "@/lib/contract-deployer";
import { formatDuration } from "@/lib/statistics";
import { cn } from "@/lib/utils";
import { RealisticTestConfigPanel } from "./realistic-test-config";

function formatDurationHuman(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

const STATUS_BADGE: Record<string, string> = {
  idle: "bg-muted text-muted-foreground",
  initializing: "bg-warning text-warning-foreground",
  running: "bg-success text-success-foreground",
  paused: "bg-warning text-warning-foreground",
  verifying: "bg-primary text-primary-foreground",
  completed: "bg-info text-info-foreground",
  error: "bg-destructive text-destructive-foreground",
};

export function LoadTestPanel() {
  const {
    config,
    setConfig,
    status,
    privacyAvailable,
    elapsedTime,
    currentRate,
    averageTps,
    targetTps,
    peakTps,
    durationSec,
    txSentCount,
    txConfirmedCount,
    txFailedCount,
    peakMgasPerSec,
    error,
    isStarting,
    start,
    stop,
    reset,
    initPhase,
    initProgress,
    accountsTotal,
    accountsGenerated,
    fundingTxsSent,
    fundingTxsTotal,
    contractsDeployed,
    contractsTotal,
    verifyPhase,
    verifyProgress,
    blocksToVerify,
    blocksVerified,
    receiptsToSample,
    receiptsSampled,
  } = useGoLoadTestStore();
  const peakMgasFromMetrics = useMetricsStore((s) => s.snapshot.peakMgasPerSec);

  const isDisabled = status === "running" || status === "initializing" || status === "verifying";
  const isAdaptiveMode = config?.pattern === "adaptive";
  const hideFailed = !!process.env.NEXT_PUBLIC_LOADTEST_HIDE_FAILED;

  const handlePatternChange = (pattern: LoadPattern) => {
    setConfig({ pattern, ...getDefaultConfigForPattern(pattern) });
  };

  const selectedType = TRANSACTION_TYPES.find(
    (t) => t.id === (config?.transactionType ?? "eth-transfer")
  );

  const contracts = loadDeployedContracts();
  const needsDeploy = needsDeployment(config?.transactionType ?? "eth-transfer", contracts);

  // Duration & progress
  const duration = durationSec > 0 ? durationSec : config?.duration ?? 60;
  const progressPct = duration > 0 ? Math.min((elapsedTime / duration) * 100, 100) : 0;

  // Init / verify sub-progress (0..1)
  const initSubPct = (() => {
    if (initPhase === "generating_accounts" && accountsTotal > 0)
      return (accountsGenerated / accountsTotal) * 100;
    if (initPhase === "funding_accounts" && fundingTxsTotal > 0)
      return (fundingTxsSent / fundingTxsTotal) * 100;
    if (initPhase === "deploying_contracts" && contractsTotal > 0)
      return (contractsDeployed / contractsTotal) * 100;
    return 0;
  })();
  const verifySubPct = blocksToVerify > 0 ? (blocksVerified / blocksToVerify) * 100 : 0;

  // The progress bar that lives along the transport bar's top border
  const progressBarPct =
    status === "running"
      ? progressPct
      : status === "initializing"
        ? initSubPct
        : status === "verifying"
          ? verifySubPct
          : 0;
  const showProgressBar =
    status === "running" || status === "initializing" || status === "verifying";

  // Last-run summary (only valid in completed state; reset clears it)
  const peakMgas = Math.max(peakMgasFromMetrics, peakMgasPerSec);
  const confirmedRate =
    txSentCount > 0 ? (txConfirmedCount / txSentCount) * 100 : 0;

  return (
    <div className="bg-card text-card-foreground rounded-xl border shadow-[0_1px_3px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.1)] overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 flex items-center justify-between border-b border-border/60">
        <div className="flex items-baseline gap-3">
          <h2 className="text-base font-semibold font-mono tracking-tight">Load Test</h2>
          {status === "completed" && (
            <span className="text-xs text-muted-foreground font-mono">
              {formatDuration(elapsedTime * 1000)} ·{" "}
              <span className="text-success">
                {peakMgas > 0 ? `${peakMgas.toFixed(1)} MGas/s peak` : `${peakTps.toFixed(0)} tx/s peak`}
              </span>{" "}
              · {confirmedRate.toFixed(1)}% conf
            </span>
          )}
        </div>
        <Badge className={cn(STATUS_BADGE[status], "capitalize border-0 font-mono")}>
          {status}
        </Badge>
      </div>

      {/* Parameter body */}
      <div
        className={cn(
          "px-5 py-4 space-y-3 transition-opacity duration-150",
          isDisabled && "opacity-60 pointer-events-none"
        )}
      >
        {/* Mode toggle */}
        <div className="grid grid-cols-[80px_1fr] items-center gap-3">
          <Label className="text-xs font-mono text-muted-foreground">Mode</Label>
          <div className="flex gap-2">
            <Button
              variant={!config?.privacyMode ? "default" : "outline"}
              size="sm"
              onClick={() => setConfig({ privacyMode: false })}
              disabled={isDisabled}
              className="flex-1"
            >
              Direct
            </Button>
            <Button
              variant={config?.privacyMode ? "default" : "outline"}
              size="sm"
              onClick={() => setConfig({ privacyMode: true })}
              disabled={isDisabled || !privacyAvailable}
              className="flex-1"
            >
              Through Privacy Proxy
            </Button>
          </div>
        </div>

        {/* Pattern tabs */}
        <div className="grid grid-cols-[80px_1fr] items-start gap-3 pt-1">
          <Label className="text-xs font-mono text-muted-foreground mt-2">Pattern</Label>
          <Tabs
            value={config?.pattern ?? "constant"}
            onValueChange={(v) => handlePatternChange(v as LoadPattern)}
          >
            <TabsList className="grid w-full grid-cols-6 gap-0.5">
              <TabsTrigger value="constant" disabled={isDisabled} className="text-xs px-1.5">
                Constant
              </TabsTrigger>
              <TabsTrigger value="ramp" disabled={isDisabled} className="text-xs px-1.5">
                Ramp
              </TabsTrigger>
              <TabsTrigger value="spike" disabled={isDisabled} className="text-xs px-1.5">
                Spike
              </TabsTrigger>
              <TabsTrigger value="adaptive" disabled={isDisabled} className="text-xs px-1.5">
                Adaptive
              </TabsTrigger>
              <TabsTrigger
                value="adaptive-realistic"
                disabled={isDisabled}
                className="text-xs px-1.5"
              >
                Mixed
              </TabsTrigger>
              <TabsTrigger value="realistic" disabled={isDisabled} className="text-xs px-1.5">
                Realistic
              </TabsTrigger>
            </TabsList>

            <p className="text-xs text-muted-foreground mt-1.5">
              {getPatternDescription(config?.pattern ?? "constant")}
            </p>

            {/* TX type — non-realistic only */}
            {config?.pattern !== "realistic" && config?.pattern !== "adaptive-realistic" && (
              <div className="mt-3 space-y-1.5">
                <Label className="text-xs font-mono text-muted-foreground">
                  Transaction type
                </Label>
                <Select
                  value={config?.transactionType ?? "eth-transfer"}
                  onValueChange={(v) => setConfig({ transactionType: v as TransactionType })}
                  disabled={isDisabled}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select transaction type" />
                  </SelectTrigger>
                  <SelectContent>
                    {TRANSACTION_TYPES.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        <div className="flex items-center justify-between w-full gap-4">
                          <span>{type.label}</span>
                          <span className="text-xs text-muted-foreground">
                            ~{(type.gasEstimate / 1000).toFixed(0)}k gas
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedType && (
                  <p className="text-xs text-muted-foreground">{selectedType.description}</p>
                )}
                {needsDeploy && (
                  <p className="text-xs text-warning">
                    Requires contract deployment (auto-deployed on first test)
                  </p>
                )}
              </div>
            )}

            {/* Constant */}
            <TabsContent value="constant" className="mt-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-mono text-muted-foreground">Rate (tx/s)</Label>
                <Input
                  type="number"
                  min={1}
                  className="h-9"
                  key={`constant-${config?.constantRate}`}
                  defaultValue={config?.constantRate ?? 100}
                  onBlur={(e) => setConfig({ constantRate: e.target.valueAsNumber || 100 })}
                  disabled={isDisabled}
                />
              </div>
            </TabsContent>

            {/* Ramp */}
            <TabsContent value="ramp" className="mt-3 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground">
                    Start (tx/s)
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    className="h-9"
                    key={`rampstart-${config?.rampStart}`}
                    defaultValue={config?.rampStart ?? 100}
                    onBlur={(e) => setConfig({ rampStart: e.target.valueAsNumber || 100 })}
                    disabled={isDisabled}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground">End (tx/s)</Label>
                  <Input
                    type="number"
                    min={1}
                    className="h-9"
                    key={`rampend-${config?.rampEnd}`}
                    defaultValue={config?.rampEnd ?? 5000}
                    onBlur={(e) => setConfig({ rampEnd: e.target.valueAsNumber || 5000 })}
                    disabled={isDisabled}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground">Steps</Label>
                  <Input
                    type="number"
                    min={1}
                    className="h-9"
                    key={`rampsteps-${config?.rampSteps}`}
                    defaultValue={config?.rampSteps ?? 10}
                    onBlur={(e) => setConfig({ rampSteps: e.target.valueAsNumber || 10 })}
                    disabled={isDisabled}
                  />
                </div>
              </div>
            </TabsContent>

            {/* Spike */}
            <TabsContent value="spike" className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground">
                    Baseline (tx/s)
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    className="h-9"
                    key={`baseline-${config?.baselineRate}`}
                    defaultValue={config?.baselineRate ?? 100}
                    onBlur={(e) =>
                      setConfig({ baselineRate: e.target.valueAsNumber || 100 })
                    }
                    disabled={isDisabled}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground">
                    Spike rate (tx/s)
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    className="h-9"
                    key={`spikerate-${config?.spikeRate}`}
                    defaultValue={config?.spikeRate ?? 5000}
                    onBlur={(e) => setConfig({ spikeRate: e.target.valueAsNumber || 5000 })}
                    disabled={isDisabled}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground">
                    Spike duration (s)
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    className="h-9"
                    key={`spikedur-${config?.spikeDuration}`}
                    defaultValue={config?.spikeDuration ?? 5}
                    onBlur={(e) => setConfig({ spikeDuration: e.target.valueAsNumber || 5 })}
                    disabled={isDisabled}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground">
                    Spike interval (s)
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    className="h-9"
                    key={`spikeint-${config?.spikeInterval}`}
                    defaultValue={config?.spikeInterval ?? 15}
                    onBlur={(e) =>
                      setConfig({ spikeInterval: e.target.valueAsNumber || 15 })
                    }
                    disabled={isDisabled}
                  />
                </div>
              </div>
            </TabsContent>

            {/* Adaptive */}
            <TabsContent value="adaptive" className="mt-3 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground">
                    Initial (tx/s)
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    className="h-9"
                    key={`adaptinit-${config?.adaptiveInitialRate}`}
                    defaultValue={config?.adaptiveInitialRate ?? 100}
                    onBlur={(e) =>
                      setConfig({ adaptiveInitialRate: e.target.valueAsNumber || 100 })
                    }
                    disabled={isDisabled}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground">
                    Step (tx/s)
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    className="h-9"
                    key={`adaptstep-${config?.adaptiveRateStep}`}
                    defaultValue={config?.adaptiveRateStep ?? 100}
                    onBlur={(e) =>
                      setConfig({ adaptiveRateStep: e.target.valueAsNumber || 100 })
                    }
                    disabled={isDisabled}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground">
                    Target pending
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    className="h-9"
                    key={`adaptpending-${config?.adaptiveTargetPending}`}
                    defaultValue={config?.adaptiveTargetPending ?? 1000}
                    onBlur={(e) =>
                      setConfig({ adaptiveTargetPending: e.target.valueAsNumber || 1000 })
                    }
                    disabled={isDisabled}
                  />
                </div>
              </div>
            </TabsContent>

            {/* Adaptive Mixed */}
            <TabsContent value="adaptive-realistic" className="mt-3 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground">
                    Initial (tx/s)
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    className="h-9"
                    key={`adaptrealinit-${config?.adaptiveInitialRate}`}
                    defaultValue={config?.adaptiveInitialRate ?? 100}
                    onBlur={(e) =>
                      setConfig({ adaptiveInitialRate: e.target.valueAsNumber || 100 })
                    }
                    disabled={isDisabled}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground">
                    Step (tx/s)
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    className="h-9"
                    key={`adaptrealstep-${config?.adaptiveRateStep}`}
                    defaultValue={config?.adaptiveRateStep ?? 100}
                    onBlur={(e) =>
                      setConfig({ adaptiveRateStep: e.target.valueAsNumber || 100 })
                    }
                    disabled={isDisabled}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono text-muted-foreground">
                    Target pending
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    className="h-9"
                    key={`adaptrealpending-${config?.adaptiveTargetPending}`}
                    defaultValue={config?.adaptiveTargetPending ?? 1000}
                    onBlur={(e) =>
                      setConfig({ adaptiveTargetPending: e.target.valueAsNumber || 1000 })
                    }
                    disabled={isDisabled}
                  />
                </div>
              </div>
              <div className="border-t pt-3">
                <Label className="text-xs font-mono text-muted-foreground mb-1.5 block">
                  Mix (fixed defaults)
                </Label>
                <div className="space-y-0.5">
                  {[
                    { label: "ETH Transfer", value: 50 },
                    { label: "ERC20 Transfer", value: 20 },
                    { label: "Uniswap Swap", value: 15 },
                    { label: "ERC20 Approve", value: 5 },
                    { label: "Storage Write", value: 5 },
                    { label: "Heavy Compute", value: 5 },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center gap-2 text-xs font-mono">
                      <span className="w-28 text-muted-foreground">{label}</span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary/60 rounded-full"
                          style={{ width: `${value}%` }}
                        />
                      </div>
                      <span className="w-8 text-right">{value}%</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Tips: exponential distribution (0–10 gwei)
                </p>
              </div>
            </TabsContent>

            {/* Realistic */}
            <TabsContent value="realistic" className="mt-3">
              <RealisticTestConfigPanel />
            </TabsContent>
          </Tabs>
        </div>

        {/* Duration + fix nonce gaps */}
        <div className="grid grid-cols-[80px_1fr] items-start gap-3 pt-1">
          <Label className="text-xs font-mono text-muted-foreground mt-2">Duration</Label>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                className="h-9 w-24"
                key={`duration-${config?.duration}`}
                defaultValue={config?.duration ?? 60}
                onBlur={(e) => setConfig({ duration: e.target.valueAsNumber || 60 })}
                disabled={isDisabled}
              />
              <span className="text-xs text-muted-foreground font-mono">
                s ({formatDurationHuman(config?.duration ?? 60)})
              </span>
            </div>
            <NonceGapToggle
              checked={!!config?.fixNonceGaps}
              disabled={isDisabled}
              onToggle={() => setConfig({ fixNonceGaps: !config?.fixNonceGaps })}
            />
          </div>
        </div>

        {/* Error display lives inside the body so it doesn't crowd the transport */}
        {error && status === "error" && (
          <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
      </div>

      {/* Transport bar */}
      <div className="relative">
        {/* Top divider doubles as the progress indicator while running */}
        <div className="h-px bg-border/60 relative overflow-hidden">
          {showProgressBar && (
            <div
              className="absolute inset-y-0 left-0 bg-primary transition-[width] duration-300 ease-out"
              style={{ width: `${progressBarPct}%` }}
            />
          )}
        </div>

        <div className="px-5 py-3 flex items-center justify-between gap-4 min-h-[60px]">
          <TransportReadout
            status={status}
            elapsedTime={elapsedTime}
            duration={duration}
            txSentCount={txSentCount}
            txConfirmedCount={txConfirmedCount}
            txFailedCount={txFailedCount}
            currentRate={currentRate}
            averageTps={averageTps}
            targetTps={targetTps}
            peakTps={peakTps}
            peakMgas={peakMgas}
            confirmedRate={confirmedRate}
            hideFailed={hideFailed}
            isAdaptiveMode={isAdaptiveMode}
            initProgress={initProgress}
            initPhase={initPhase}
            accountsGenerated={accountsGenerated}
            accountsTotal={accountsTotal}
            fundingTxsSent={fundingTxsSent}
            fundingTxsTotal={fundingTxsTotal}
            contractsDeployed={contractsDeployed}
            contractsTotal={contractsTotal}
            verifyProgress={verifyProgress}
            verifyPhase={verifyPhase}
            blocksVerified={blocksVerified}
            blocksToVerify={blocksToVerify}
            receiptsSampled={receiptsSampled}
            receiptsToSample={receiptsToSample}
          />
          <TransportAction
            status={status}
            isStarting={isStarting}
            start={start}
            stop={stop}
            reset={reset}
          />
        </div>
      </div>
    </div>
  );
}

// ---------- subcomponents ----------

function NonceGapToggle({
  checked,
  disabled,
  onToggle,
}: {
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label="Fix nonce gaps"
        onClick={onToggle}
        disabled={disabled}
        className={cn(
          "h-4 w-4 shrink-0 rounded border flex items-center justify-center transition-colors",
          checked
            ? "bg-primary border-primary"
            : "border-muted-foreground/40 hover:border-muted-foreground",
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
        )}
      >
        {checked && (
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M2 5L4.5 7.5L8 3"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
      <Label
        className={cn("text-xs font-mono cursor-pointer select-none", disabled && "opacity-50")}
        onClick={() => !disabled && onToggle()}
      >
        Fix nonce gaps
      </Label>
    </div>
  );
}

interface TransportReadoutProps {
  status: string;
  elapsedTime: number;
  duration: number;
  txSentCount: number;
  txConfirmedCount: number;
  txFailedCount: number;
  currentRate: number;
  averageTps: number;
  targetTps: number;
  peakTps: number;
  peakMgas: number;
  confirmedRate: number;
  hideFailed: boolean;
  isAdaptiveMode: boolean;
  initProgress: string;
  initPhase: string;
  accountsGenerated: number;
  accountsTotal: number;
  fundingTxsSent: number;
  fundingTxsTotal: number;
  contractsDeployed: number;
  contractsTotal: number;
  verifyProgress: string;
  verifyPhase: string;
  blocksVerified: number;
  blocksToVerify: number;
  receiptsSampled: number;
  receiptsToSample: number;
}

function TransportReadout(p: TransportReadoutProps) {
  if (p.status === "idle") {
    return (
      <p className="text-sm text-muted-foreground font-mono flex-1 min-w-0 truncate">
        No previous run. Configure and press Start.
      </p>
    );
  }

  if (p.status === "initializing") {
    const detail = (() => {
      if (p.initPhase === "generating_accounts" && p.accountsTotal > 0)
        return `Generating accounts ${p.accountsGenerated} / ${p.accountsTotal}`;
      if (p.initPhase === "funding_accounts" && p.fundingTxsTotal > 0)
        return `Funding accounts ${p.fundingTxsSent} / ${p.fundingTxsTotal}`;
      if (p.initPhase === "waiting_for_funding")
        return `Waiting for funding confirmations · ${p.fundingTxsSent} txs`;
      if (p.initPhase === "deploying_contracts" && p.contractsTotal > 0)
        return `Deploying contracts ${p.contractsDeployed} / ${p.contractsTotal}`;
      return p.initProgress || "Starting initialization";
    })();
    return (
      <div className="flex-1 min-w-0 flex items-center gap-2 font-mono">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-warning shrink-0" />
        <p className="text-sm text-foreground truncate">{detail}</p>
      </div>
    );
  }

  if (p.status === "running") {
    const pending = Math.max(0, p.txSentCount - p.txConfirmedCount - p.txFailedCount);
    return (
      <div className="flex-1 min-w-0 flex flex-col gap-0.5 font-mono">
        <p className="text-sm tabular-nums">
          <span className="text-foreground">
            {formatDuration(p.elapsedTime * 1000)} / {formatDuration(p.duration * 1000)}
          </span>
          <span className="text-muted-foreground"> · </span>
          <span className="text-primary">{p.currentRate.toFixed(0)} tx/s</span>
          {p.targetTps > 0 && (
            <span className="text-muted-foreground"> / {p.targetTps.toLocaleString()} target</span>
          )}
          {p.isAdaptiveMode && p.peakTps > 0 && (
            <>
              <span className="text-muted-foreground"> · </span>
              <span className="text-primary">{p.peakTps.toLocaleString()} peak</span>
            </>
          )}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums truncate">
          {p.txSentCount.toLocaleString()} sent
          <span className="mx-1.5">·</span>
          <span className="text-success">{p.txConfirmedCount.toLocaleString()} conf</span>
          {!p.hideFailed && p.txFailedCount > 0 && (
            <>
              <span className="mx-1.5">·</span>
              <span className="text-destructive">{p.txFailedCount.toLocaleString()} failed</span>
            </>
          )}
          {pending > 0 && (
            <>
              <span className="mx-1.5">·</span>
              <span>{pending.toLocaleString()} pending</span>
            </>
          )}
        </p>
      </div>
    );
  }

  if (p.status === "verifying") {
    const detail = (() => {
      if (p.verifyPhase === "on_chain_metrics" && p.blocksToVerify > 0)
        return `Fetching on-chain metrics ${p.blocksVerified} / ${p.blocksToVerify}`;
      if (p.verifyPhase === "aggregating" && p.blocksToVerify > 0)
        return `Aggregating snapshots ${p.blocksVerified} / ${p.blocksToVerify}`;
      if (p.verifyPhase === "tip_ordering" && p.blocksToVerify > 0)
        return `Checking tip ordering ${p.blocksVerified} / ${p.blocksToVerify}`;
      if (p.verifyPhase === "receipts" && p.receiptsToSample > 0)
        return `Sampling receipts ${p.receiptsSampled} / ${p.receiptsToSample}`;
      return p.verifyProgress || "Verifying on-chain results";
    })();
    return (
      <div className="flex-1 min-w-0 flex items-center gap-2 font-mono">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
        <p className="text-sm text-foreground truncate">{detail}</p>
      </div>
    );
  }

  if (p.status === "completed") {
    const peakLabel =
      p.peakMgas > 0 ? `${p.peakMgas.toFixed(1)} MGas/s peak` : `${p.peakTps.toFixed(0)} tx/s peak`;
    return (
      <p className="text-sm text-muted-foreground font-mono flex-1 min-w-0 truncate tabular-nums">
        Completed
        <span className="mx-1.5">·</span>
        <span className="text-foreground">{formatDuration(p.elapsedTime * 1000)}</span>
        <span className="mx-1.5">·</span>
        <span className="text-success">{peakLabel}</span>
        <span className="mx-1.5">·</span>
        <span className="text-foreground">{p.confirmedRate.toFixed(1)}% conf</span>
        <span className="mx-1.5">·</span>
        <span>{p.txConfirmedCount.toLocaleString()} txs</span>
      </p>
    );
  }

  if (p.status === "error") {
    return (
      <p className="text-sm text-destructive font-mono flex-1 min-w-0 truncate">
        Test failed. Review the error above and reset to try again.
      </p>
    );
  }

  return null;
}

function TransportAction({
  status,
  isStarting,
  start,
  stop,
  reset,
}: {
  status: string;
  isStarting: boolean;
  start: () => void;
  stop: () => void;
  reset: () => void;
}) {
  if (status === "idle") {
    return (
      <Button onClick={start} disabled={isStarting} className="shrink-0 min-w-[140px]">
        {isStarting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Starting
          </>
        ) : (
          "Start Test"
        )}
      </Button>
    );
  }
  if (status === "initializing") {
    return (
      <Button variant="destructive" onClick={stop} className="shrink-0 min-w-[120px]">
        Cancel
      </Button>
    );
  }
  if (status === "running") {
    return (
      <Button variant="destructive" onClick={stop} className="shrink-0 min-w-[120px]">
        Stop
      </Button>
    );
  }
  if (status === "verifying") {
    return (
      <Button variant="outline" disabled className="shrink-0 min-w-[120px]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Verifying
      </Button>
    );
  }
  if (status === "completed" || status === "error") {
    return (
      <Button variant="outline" onClick={reset} className="shrink-0 min-w-[120px]">
        Reset
      </Button>
    );
  }
  return null;
}
