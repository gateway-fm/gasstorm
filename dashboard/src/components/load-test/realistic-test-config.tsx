"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGoLoadTestStore } from "@/stores/go-load-test-store";
import type { TipDistribution, TxTypeRatios, RealisticTestConfig } from "@/types/load-test";
import { DEFAULT_REALISTIC_CONFIG } from "@/types/load-test";

interface TxTypeRatioConfigProps {
  ratios: TxTypeRatios;
  onChange: (ratios: TxTypeRatios) => void;
  disabled: boolean;
}

const TX_TYPE_LABELS: Record<keyof TxTypeRatios, string> = {
  ethTransfer: "ETH Transfer",
  erc20Transfer: "ERC20 Transfer",
  erc20Approve: "ERC20 Approve",
  uniswapSwap: "Uniswap Swap",
  storageWrite: "Storage Write",
  heavyCompute: "Heavy Compute",
};

function TxTypeRatioConfig({ ratios, onChange, disabled }: TxTypeRatioConfigProps) {
  const total = Object.values(ratios).reduce((sum, v) => sum + v, 0);
  const isValid = total === 100;

  const handleChange = (key: keyof TxTypeRatios, value: number) => {
    onChange({ ...ratios, [key]: value });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>TX Type Ratios</Label>
        <span className={`text-xs ${isValid ? "text-green-600" : "text-red-600"}`}>
          Total: {total}% {isValid ? "" : "(must = 100%)"}
        </span>
      </div>
      {(Object.keys(TX_TYPE_LABELS) as (keyof TxTypeRatios)[]).map((key) => (
        <div key={key} className="grid grid-cols-[1fr_60px_40px] gap-2 items-center">
          <Label className="text-xs text-muted-foreground">{TX_TYPE_LABELS[key]}</Label>
          <Slider
            value={[ratios[key]]}
            onValueChange={([v]) => handleChange(key, v)}
            min={0}
            max={100}
            step={5}
            disabled={disabled}
            className="w-full"
          />
          <span className="text-xs text-right">{ratios[key]}%</span>
        </div>
      ))}
    </div>
  );
}

export function RealisticTestConfigPanel() {
  const { config, setConfig, status } = useGoLoadTestStore();
  const isDisabled = status === "running";

  const realisticConfig = config?.realisticConfig ?? DEFAULT_REALISTIC_CONFIG;

  const updateRealisticConfig = (updates: Partial<RealisticTestConfig>) => {
    setConfig({
      realisticConfig: { ...realisticConfig, ...updates },
    });
  };

  return (
    <div className="space-y-4">
      {/* Account Count */}
      <div className="space-y-2">
        <Label>Number of Accounts</Label>
        <Input
          type="number"
          min={1}
          key={`accounts-${realisticConfig.numAccounts}`}
          defaultValue={realisticConfig.numAccounts}
          onBlur={(e) => updateRealisticConfig({ numAccounts: e.target.valueAsNumber || 100 })}
          disabled={isDisabled}
        />
        <p className="text-xs text-muted-foreground">
          Accounts will be generated and funded before test starts
        </p>
      </div>

      {/* Target TPS */}
      <div className="space-y-2">
        <Label>Target TPS</Label>
        <Input
          type="number"
          min={1}
          key={`tps-${realisticConfig.targetTps}`}
          defaultValue={realisticConfig.targetTps}
          onBlur={(e) => updateRealisticConfig({ targetTps: e.target.valueAsNumber || 100 })}
          disabled={isDisabled}
        />
      </div>

      {/* Tip Range */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Min Tip (gwei)</Label>
          <Input
            type="number"
            min={0}
            step={0.1}
            key={`mintip-${realisticConfig.minTipGwei}`}
            defaultValue={realisticConfig.minTipGwei}
            onBlur={(e) => updateRealisticConfig({ minTipGwei: e.target.valueAsNumber || 0 })}
            disabled={isDisabled}
          />
        </div>
        <div className="space-y-2">
          <Label>Max Tip (gwei)</Label>
          <Input
            type="number"
            min={0}
            step={0.1}
            key={`maxtip-${realisticConfig.maxTipGwei}`}
            defaultValue={realisticConfig.maxTipGwei}
            onBlur={(e) => updateRealisticConfig({ maxTipGwei: e.target.valueAsNumber || 0 })}
            disabled={isDisabled}
          />
        </div>
      </div>

      {/* Tip Distribution */}
      <div className="space-y-2">
        <Label>Tip Distribution</Label>
        <Select
          value={realisticConfig.tipDistribution}
          onValueChange={(v) => updateRealisticConfig({ tipDistribution: v as TipDistribution })}
          disabled={isDisabled}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="exponential">
              Exponential (realistic - more low tips)
            </SelectItem>
            <SelectItem value="power-law">
              Power Law (heavy tail)
            </SelectItem>
            <SelectItem value="uniform">
              Uniform (evenly distributed)
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* TX Type Ratios */}
      <div className="border-t pt-4">
        <TxTypeRatioConfig
          ratios={realisticConfig.txTypeRatios}
          onChange={(txTypeRatios) => updateRealisticConfig({ txTypeRatios })}
          disabled={isDisabled}
        />
      </div>
    </div>
  );
}
