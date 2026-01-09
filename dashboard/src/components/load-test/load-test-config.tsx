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
        <CardTitle className="text-base font-semibold">Load Test Configuration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Transaction Type Selection - only show for non-realistic modes */}
        {config?.pattern !== "realistic" && (
          <div className="space-y-2">
            <Label>Transaction Type</Label>
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

        {/* Pattern Selection */}
        <Tabs
          value={config?.pattern ?? "constant"}
          onValueChange={(v) => handlePatternChange(v as LoadPattern)}
        >
          <TabsList className="grid w-full grid-cols-5">
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
            <TabsTrigger value="realistic" disabled={isDisabled}>
              Realistic
            </TabsTrigger>
          </TabsList>

          <p className="text-xs text-muted-foreground mt-2">
            {getPatternDescription(config?.pattern ?? "constant")}
          </p>

          {/* Constant Pattern Config */}
          <TabsContent value="constant" className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label>Rate (tx/s)</Label>
              <Input
                type="text"
                value={config?.constantRate ?? 100}
                onChange={(e) => setConfig({ constantRate: parseInt(e.target.value) || 0 })}
                disabled={isDisabled}
              />
            </div>
          </TabsContent>

          {/* Ramp Pattern Config */}
          <TabsContent value="ramp" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Rate (tx/s)</Label>
                <Input
                  type="text"
                  value={config?.rampStart ?? 100}
                  onChange={(e) => setConfig({ rampStart: parseInt(e.target.value) || 0 })}
                  disabled={isDisabled}
                />
              </div>
              <div className="space-y-2">
                <Label>End Rate (tx/s)</Label>
                <Input
                  type="text"
                  value={config?.rampEnd ?? 5000}
                  onChange={(e) => setConfig({ rampEnd: parseInt(e.target.value) || 0 })}
                  disabled={isDisabled}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Steps</Label>
              <Input
                type="text"
                value={config?.rampSteps ?? 10}
                onChange={(e) => setConfig({ rampSteps: parseInt(e.target.value) || 0 })}
                disabled={isDisabled}
              />
            </div>
          </TabsContent>

          {/* Spike Pattern Config */}
          <TabsContent value="spike" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Baseline Rate (tx/s)</Label>
                <Input
                  type="text"
                  value={config?.baselineRate ?? 100}
                  onChange={(e) => setConfig({ baselineRate: parseInt(e.target.value) || 0 })}
                  disabled={isDisabled}
                />
              </div>
              <div className="space-y-2">
                <Label>Spike Rate (tx/s)</Label>
                <Input
                  type="text"
                  value={config?.spikeRate ?? 5000}
                  onChange={(e) => setConfig({ spikeRate: parseInt(e.target.value) || 0 })}
                  disabled={isDisabled}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Spike Duration (s)</Label>
                <Input
                  type="text"
                  value={config?.spikeDuration ?? 5}
                  onChange={(e) => setConfig({ spikeDuration: parseInt(e.target.value) || 0 })}
                  disabled={isDisabled}
                />
              </div>
              <div className="space-y-2">
                <Label>Spike Interval (s)</Label>
                <Input
                  type="text"
                  value={config?.spikeInterval ?? 15}
                  onChange={(e) => setConfig({ spikeInterval: parseInt(e.target.value) || 0 })}
                  disabled={isDisabled}
                />
              </div>
            </div>
          </TabsContent>

          {/* Adaptive Pattern Config */}
          <TabsContent value="adaptive" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Initial Rate (tx/s)</Label>
                <Input
                  type="text"
                  value={config?.adaptiveInitialRate ?? 100}
                  onChange={(e) => setConfig({ adaptiveInitialRate: parseInt(e.target.value) || 0 })}
                  disabled={isDisabled}
                />
              </div>
              <div className="space-y-2">
                <Label>Rate Step (tx/s)</Label>
                <Input
                  type="text"
                  value={config?.adaptiveRateStep ?? 100}
                  onChange={(e) => setConfig({ adaptiveRateStep: parseInt(e.target.value) || 0 })}
                  disabled={isDisabled}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Target Pending TXs</Label>
              <Input
                type="text"
                value={config?.adaptiveTargetPending ?? 1000}
                onChange={(e) => setConfig({ adaptiveTargetPending: parseInt(e.target.value) || 0 })}
                disabled={isDisabled}
              />
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
            <Label>Test Duration (seconds)</Label>
            <Input
              type="text"
              value={config?.duration ?? 60}
              onChange={(e) => setConfig({ duration: parseInt(e.target.value) || 0 })}
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
