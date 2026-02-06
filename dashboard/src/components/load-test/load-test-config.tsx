"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGoLoadTestStore } from "@/stores/go-load-test-store";
import type { LoadPattern, TransactionType } from "@/types/load-test";
import { TRANSACTION_TYPES } from "@/types/load-test";
import { getPatternDescription, getDefaultConfigForPattern } from "@/lib/load-patterns";
import { needsDeployment, loadDeployedContracts } from "@/lib/contract-deployer";
import { RealisticTestConfigPanel } from "./realistic-test-config";

function formatDurationHuman(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

export function LoadTestConfig() {
  const { config, setConfig, status } = useGoLoadTestStore();
  const isDisabled = status === "running";

  const handlePatternChange = (pattern: LoadPattern) => {
    setConfig({ pattern, ...getDefaultConfigForPattern(pattern) });
  };

  const handleTxTypeChange = (type: TransactionType) => {
    setConfig({ transactionType: type });
  };

  const selectedType = TRANSACTION_TYPES.find(
    (t) => t.id === (config?.transactionType ?? "eth-transfer")
  );

  const contracts = loadDeployedContracts();
  const needsDeploy = needsDeployment(config?.transactionType ?? "eth-transfer", contracts);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold font-mono">Load Test Configuration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Pattern Selection */}
        <Tabs
          value={config?.pattern ?? "constant"}
          onValueChange={(v) => handlePatternChange(v as LoadPattern)}
        >
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="constant" disabled={isDisabled}>
              Constant
            </TabsTrigger>
            <TabsTrigger value="ramp" disabled={isDisabled}>
              Ramp
            </TabsTrigger>
            <TabsTrigger value="spike" disabled={isDisabled}>
              Spike
            </TabsTrigger>
            <TabsTrigger value="adaptive" disabled={isDisabled}>
              Adaptive
            </TabsTrigger>
            <TabsTrigger value="adaptive-realistic" disabled={isDisabled}>
              Adaptive Mix
            </TabsTrigger>
            <TabsTrigger value="realistic" disabled={isDisabled}>
              Realistic
            </TabsTrigger>
          </TabsList>

          <p className="text-xs text-muted-foreground mt-2">
            {getPatternDescription(config?.pattern ?? "constant")}
          </p>

          {/* Transaction Type Selection - only show for non-realistic modes */}
          {config?.pattern !== "realistic" && config?.pattern !== "adaptive-realistic" && (
            <div className="space-y-2 mt-4">
              <Label className="font-mono">Transaction Type</Label>
              <Select
                value={config?.transactionType ?? "eth-transfer"}
                onValueChange={(v) => handleTxTypeChange(v as TransactionType)}
                disabled={isDisabled}
              >
                <SelectTrigger>
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
              <p className="text-xs text-muted-foreground">
                {selectedType?.description}
              </p>
              {needsDeploy && (
                <p className="text-xs text-amber-600">
                  Requires contract deployment (auto-deployed on first test)
                </p>
              )}
            </div>
          )}

          {/* Constant Pattern Config */}
          <TabsContent value="constant" className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label className="font-mono">Rate (tx/s)</Label>
              <Input
                type="number"
                min={1}
                key={`constant-${config?.constantRate}`}
                defaultValue={config?.constantRate ?? 100}
                onBlur={(e) => setConfig({ constantRate: e.target.valueAsNumber || 100 })}
                disabled={isDisabled}
              />
            </div>
          </TabsContent>

          {/* Ramp Pattern Config */}
          <TabsContent value="ramp" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-mono">Start Rate (tx/s)</Label>
                <Input
                  type="number"
                  min={1}
                  key={`rampstart-${config?.rampStart}`}
                  defaultValue={config?.rampStart ?? 100}
                  onBlur={(e) => setConfig({ rampStart: e.target.valueAsNumber || 100 })}
                  disabled={isDisabled}
                />
              </div>
              <div className="space-y-2">
                <Label className="font-mono">End Rate (tx/s)</Label>
                <Input
                  type="number"
                  min={1}
                  key={`rampend-${config?.rampEnd}`}
                  defaultValue={config?.rampEnd ?? 5000}
                  onBlur={(e) => setConfig({ rampEnd: e.target.valueAsNumber || 5000 })}
                  disabled={isDisabled}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="font-mono">Steps</Label>
              <Input
                type="number"
                min={1}
                key={`rampsteps-${config?.rampSteps}`}
                defaultValue={config?.rampSteps ?? 10}
                onBlur={(e) => setConfig({ rampSteps: e.target.valueAsNumber || 10 })}
                disabled={isDisabled}
              />
            </div>
          </TabsContent>

          {/* Spike Pattern Config */}
          <TabsContent value="spike" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-mono">Baseline Rate (tx/s)</Label>
                <Input
                  type="number"
                  min={1}
                  key={`baseline-${config?.baselineRate}`}
                  defaultValue={config?.baselineRate ?? 100}
                  onBlur={(e) => setConfig({ baselineRate: e.target.valueAsNumber || 100 })}
                  disabled={isDisabled}
                />
              </div>
              <div className="space-y-2">
                <Label className="font-mono">Spike Rate (tx/s)</Label>
                <Input
                  type="number"
                  min={1}
                  key={`spikerate-${config?.spikeRate}`}
                  defaultValue={config?.spikeRate ?? 5000}
                  onBlur={(e) => setConfig({ spikeRate: e.target.valueAsNumber || 5000 })}
                  disabled={isDisabled}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-mono">Spike Duration (s)</Label>
                <Input
                  type="number"
                  min={1}
                  key={`spikedur-${config?.spikeDuration}`}
                  defaultValue={config?.spikeDuration ?? 5}
                  onBlur={(e) => setConfig({ spikeDuration: e.target.valueAsNumber || 5 })}
                  disabled={isDisabled}
                />
              </div>
              <div className="space-y-2">
                <Label className="font-mono">Spike Interval (s)</Label>
                <Input
                  type="number"
                  min={1}
                  key={`spikeint-${config?.spikeInterval}`}
                  defaultValue={config?.spikeInterval ?? 15}
                  onBlur={(e) => setConfig({ spikeInterval: e.target.valueAsNumber || 15 })}
                  disabled={isDisabled}
                />
              </div>
            </div>
          </TabsContent>

          {/* Adaptive Pattern Config */}
          <TabsContent value="adaptive" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-mono">Initial Rate (tx/s)</Label>
                <Input
                  type="number"
                  min={1}
                  key={`adaptinit-${config?.adaptiveInitialRate}`}
                  defaultValue={config?.adaptiveInitialRate ?? 100}
                  onBlur={(e) => setConfig({ adaptiveInitialRate: e.target.valueAsNumber || 100 })}
                  disabled={isDisabled}
                />
              </div>
              <div className="space-y-2">
                <Label className="font-mono">Rate Step (tx/s)</Label>
                <Input
                  type="number"
                  min={1}
                  key={`adaptstep-${config?.adaptiveRateStep}`}
                  defaultValue={config?.adaptiveRateStep ?? 100}
                  onBlur={(e) => setConfig({ adaptiveRateStep: e.target.valueAsNumber || 100 })}
                  disabled={isDisabled}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="font-mono">Target Pending TXs</Label>
              <Input
                type="number"
                min={1}
                key={`adaptpending-${config?.adaptiveTargetPending}`}
                defaultValue={config?.adaptiveTargetPending ?? 1000}
                onBlur={(e) => setConfig({ adaptiveTargetPending: e.target.valueAsNumber || 1000 })}
                disabled={isDisabled}
              />
            </div>
          </TabsContent>

          {/* Adaptive Realistic Pattern Config */}
          <TabsContent value="adaptive-realistic" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-mono">Initial Rate (tx/s)</Label>
                <Input
                  type="number"
                  min={1}
                  key={`adaptrealinit-${config?.adaptiveInitialRate}`}
                  defaultValue={config?.adaptiveInitialRate ?? 100}
                  onBlur={(e) => setConfig({ adaptiveInitialRate: e.target.valueAsNumber || 100 })}
                  disabled={isDisabled}
                />
              </div>
              <div className="space-y-2">
                <Label className="font-mono">Rate Step (tx/s)</Label>
                <Input
                  type="number"
                  min={1}
                  key={`adaptrealstep-${config?.adaptiveRateStep}`}
                  defaultValue={config?.adaptiveRateStep ?? 100}
                  onBlur={(e) => setConfig({ adaptiveRateStep: e.target.valueAsNumber || 100 })}
                  disabled={isDisabled}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="font-mono">Target Pending TXs</Label>
              <Input
                type="number"
                min={1}
                key={`adaptrealpending-${config?.adaptiveTargetPending}`}
                defaultValue={config?.adaptiveTargetPending ?? 1000}
                onBlur={(e) => setConfig({ adaptiveTargetPending: e.target.valueAsNumber || 1000 })}
                disabled={isDisabled}
              />
            </div>

            {/* TX Type Mix Preview (read-only) */}
            <div className="border-t pt-4 mt-4">
              <Label className="text-xs text-muted-foreground mb-2 block">TX Type Mix (fixed defaults)</Label>
              <div className="space-y-1">
                {[
                  { label: "ETH Transfer", value: 50 },
                  { label: "ERC20 Transfer", value: 20 },
                  { label: "Uniswap Swap", value: 15 },
                  { label: "ERC20 Approve", value: 5 },
                  { label: "Storage Write", value: 5 },
                  { label: "Heavy Compute", value: 5 },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center gap-2 text-xs">
                    <span className="w-28 text-muted-foreground">{label}</span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary/60 rounded-full"
                        style={{ width: `${value}%` }}
                      />
                    </div>
                    <span className="w-8 text-right">{value}%</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Tips: exponential distribution (0-10 gwei)
              </p>
            </div>
          </TabsContent>

          {/* Realistic Pattern Config */}
          <TabsContent value="realistic" className="mt-4">
            <RealisticTestConfigPanel />
          </TabsContent>
        </Tabs>

        {/* Common Config */}
        <div className="border-t pt-4 space-y-4">
          <div className="space-y-2">
            <Label className="font-mono">Test Duration (seconds)</Label>
            <Input
              type="number"
              min={1}
              key={`duration-${config?.duration}`}
              defaultValue={config?.duration ?? 60}
              onBlur={(e) => setConfig({ duration: e.target.valueAsNumber || 60 })}
              disabled={isDisabled}
            />
            <p className="text-xs text-muted-foreground">
              {formatDurationHuman(config?.duration ?? 60)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
