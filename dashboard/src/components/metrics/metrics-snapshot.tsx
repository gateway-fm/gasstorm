"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMetricsStore } from "@/stores/metrics-store";
import { useGoLoadTestStore } from "@/stores/go-load-test-store";
import { formatGas, formatPercent } from "@/lib/statistics";

function formatBlockTime(ms: number): string {
  if (ms === 0) return "N/A";
  if (ms < 1000) return `${Math.round(ms)}`;
  return `${(ms / 1000).toFixed(2)}`;
}

function getBlockTimeUnit(ms: number): string {
  if (ms === 0) return "";
  if (ms < 1000) return "ms";
  return "s";
}

function getBlockTimeColor(ms: number, targetMs: number): string {
  if (ms === 0) return "text-muted-foreground";

  const deviation = Math.abs(ms - targetMs) / targetMs;

  if (deviation <= 0.2) return "text-success";
  if (deviation <= 0.5) return "text-warning";
  return "text-destructive";
}

function formatGasPrice(gwei: number): string {
  if (gwei === 0) return "—";
  if (gwei < 0.001) return gwei.toExponential(1);
  if (gwei < 0.1) return gwei.toFixed(4);
  if (gwei < 1) return gwei.toFixed(3);
  return gwei.toFixed(2);
}

type Metric = { label: string; value: string; unit: string; color: string };

export function MetricsSnapshot() {
  const { snapshot, blockMetrics, timeSeries } = useMetricsStore();
  const {
    status: goStatus,
    isHistoricalMode: goIsHistorical,
    latestBaseFeeGwei,
    latestGasPriceGwei,
    txConfirmedCount,
    currentRate: goCurrentTps,
    averageTps: goAverageTps,
    peakTps: goPeakTps,
    totalGasUsed: goTotalGasUsed,
    blockCount: goBlockCount,
    peakMgasPerSec: goPeakMgasPerSec,
    avgMgasPerSec: goAvgMgasPerSec,
    avgFillRate: goAvgFillRate,
    blockAttestationEnabled,
    hsmProvider,
    hsmKeyIdActive,
    hsmFailoverEnabled,
  } = useGoLoadTestStore();

  const isLiveRunning = goStatus === "running" || goStatus === "initializing" || goStatus === "verifying";

  const totalTxs = goIsHistorical ? snapshot.totalTransactions : txConfirmedCount;

  const hasGoBlockMetrics = goBlockCount > 0 || goTotalGasUsed > 0;
  const hasBlockMetrics = blockMetrics.length > 0 || hasGoBlockMetrics;

  const hasHistoricalMgasData =
    goIsHistorical &&
    (timeSeries.mgasPerSec.some((v) => v > 0) ||
      snapshot.currentMgasPerSec > 0 ||
      snapshot.peakMgasPerSec > 0);

  const showMgasMetrics = hasBlockMetrics || hasHistoricalMgasData;

  const targetBlockTimeMs = 2000;

  const peakMgasPerSec = goIsHistorical ? snapshot.peakMgasPerSec : goPeakMgasPerSec;
  const avgMgasPerSec = goIsHistorical ? snapshot.currentMgasPerSec : goAvgMgasPerSec;
  const avgFillRate = goIsHistorical ? snapshot.averageFillRate : goAvgFillRate;
  const blocksProduced = goIsHistorical ? snapshot.blocksProduced : goBlockCount;
  const totalGasUsed = goIsHistorical ? snapshot.totalGasUsed : BigInt(goTotalGasUsed);

  const attestationState =
    blockAttestationEnabled === null ? "—" : blockAttestationEnabled ? "ON" : "OFF";
  const attestationColor =
    blockAttestationEnabled === null
      ? "text-muted-foreground"
      : blockAttestationEnabled
        ? "text-success"
        : "text-warning";
  const hsmProviderLabel = hsmProvider || "—";
  const hsmKeyIdLabel = hsmKeyIdActive || "—";
  const hsmFailoverLabel =
    hsmFailoverEnabled === null ? "—" : hsmFailoverEnabled ? "ON" : "OFF";

  const sections: { heading: string; metrics: Metric[] }[] = [
    {
      heading: "Throughput",
      metrics: [
        {
          label: isLiveRunning ? "Now" : "Avg",
          value: showMgasMetrics ? avgMgasPerSec.toFixed(1) : snapshot.currentTxPerSec.toFixed(1),
          unit: showMgasMetrics ? "Mgas/s" : "tx/s",
          color: showMgasMetrics ? "text-info" : "text-primary",
        },
        {
          label: "Peak",
          value: showMgasMetrics ? peakMgasPerSec.toFixed(1) : snapshot.peakTxPerSec.toFixed(1),
          unit: showMgasMetrics ? "Mgas/s" : "tx/s",
          color: "text-success",
        },
        {
          label: isLiveRunning ? "TPS" : "Avg TPS",
          value: showMgasMetrics
            ? (isLiveRunning ? goCurrentTps : goAverageTps).toFixed(0)
            : snapshot.totalTransactions.toLocaleString(),
          unit: showMgasMetrics ? "" : "txs",
          color: "text-primary",
        },
        {
          label: "Peak TPS",
          value: showMgasMetrics
            ? goPeakTps.toFixed(0)
            : snapshot.totalTransactions > 0
              ? "100%"
              : "—",
          unit: "",
          color: showMgasMetrics ? "text-primary" : "text-success",
        },
      ],
    },
    {
      heading: "Blocks",
      metrics: [
        {
          label: "Block",
          value:
            blockMetrics.length > 0 || snapshot.currentBlockTimeMs > 0
              ? formatBlockTime(snapshot.currentBlockTimeMs)
              : "—",
          unit:
            blockMetrics.length > 0 || snapshot.currentBlockTimeMs > 0
              ? getBlockTimeUnit(snapshot.currentBlockTimeMs)
              : "",
          color:
            blockMetrics.length > 0 || snapshot.currentBlockTimeMs > 0
              ? getBlockTimeColor(snapshot.currentBlockTimeMs, targetBlockTimeMs)
              : "text-muted-foreground",
        },
        {
          label: "Avg Block",
          value:
            blockMetrics.length > 0 || snapshot.avgBlockTimeMs > 0
              ? formatBlockTime(snapshot.avgBlockTimeMs)
              : "—",
          unit:
            blockMetrics.length > 0 || snapshot.avgBlockTimeMs > 0
              ? getBlockTimeUnit(snapshot.avgBlockTimeMs)
              : "",
          color:
            blockMetrics.length > 0 || snapshot.avgBlockTimeMs > 0
              ? getBlockTimeColor(snapshot.avgBlockTimeMs, targetBlockTimeMs)
              : "text-muted-foreground",
        },
        {
          label: "Fill",
          value: showMgasMetrics ? formatPercent(avgFillRate) : "—",
          unit: "",
          color: showMgasMetrics ? "text-warning" : "text-muted-foreground",
        },
        {
          label: "Blocks",
          value: showMgasMetrics ? blocksProduced.toString() : "—",
          unit: "",
          color: "text-muted-foreground",
        },
      ],
    },
    {
      heading: "Gas",
      metrics: [
        {
          label: "Base Fee",
          value: formatGasPrice(goIsHistorical ? snapshot.baseFeeGwei ?? 0 : latestBaseFeeGwei),
          unit:
            (goIsHistorical ? (snapshot.baseFeeGwei ?? 0) > 0 : latestBaseFeeGwei > 0) ? "gwei" : "",
          color:
            (goIsHistorical ? (snapshot.baseFeeGwei ?? 0) : latestBaseFeeGwei) > 1.5
              ? "text-destructive"
              : (goIsHistorical ? (snapshot.baseFeeGwei ?? 0) : latestBaseFeeGwei) > 1.0
                ? "text-warning"
                : "text-success",
        },
        {
          label: "Gas Price",
          value: formatGasPrice(goIsHistorical ? snapshot.gasPriceGwei ?? 0 : latestGasPriceGwei),
          unit:
            (goIsHistorical ? (snapshot.gasPriceGwei ?? 0) > 0 : latestGasPriceGwei > 0) ? "gwei" : "",
          color:
            (goIsHistorical ? (snapshot.gasPriceGwei ?? 0) : latestGasPriceGwei) > 2.0
              ? "text-destructive"
              : (goIsHistorical ? (snapshot.gasPriceGwei ?? 0) : latestGasPriceGwei) > 1.5
                ? "text-warning"
                : "text-success",
        },
        {
          label: "Total Gas",
          value: showMgasMetrics ? formatGas(totalGasUsed) : "—",
          unit: "",
          color: "text-info",
        },
        {
          label: "Total Txs",
          value: totalTxs.toLocaleString(),
          unit: "",
          color: "text-warning",
        },
      ],
    },
    {
      heading: "Provenance",
      metrics: [
        { label: "Attestation", value: attestationState, unit: "", color: attestationColor },
        {
          label: "HSM Provider",
          value: hsmProviderLabel,
          unit: "",
          color: hsmProviderLabel === "—" ? "text-muted-foreground" : "text-info",
        },
        {
          label: "HSM Key",
          value: hsmKeyIdLabel,
          unit: "",
          color: hsmKeyIdLabel === "—" ? "text-muted-foreground" : "text-info",
        },
        {
          label: "HSM Failover",
          value: hsmFailoverLabel,
          unit: "",
          color:
            hsmFailoverLabel === "—"
              ? "text-muted-foreground"
              : hsmFailoverLabel === "ON"
                ? "text-success"
                : "text-warning",
        },
      ],
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold font-mono">
          {goIsHistorical
            ? "Historical Metrics"
            : isLiveRunning
              ? "Live Metrics"
              : goStatus === "completed" || goStatus === "error"
                ? "Test Results"
                : "Test Metrics"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {sections.map((section, idx) => (
          <div
            key={section.heading}
            className={idx > 0 ? "pt-3 border-t border-border/60" : ""}
          >
            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
              {section.heading}
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {section.metrics.map((metric) => (
                <div key={metric.label} className="min-w-0">
                  <p className="text-[10px] text-muted-foreground font-mono truncate">
                    {metric.label}
                  </p>
                  <p
                    className={`text-base font-bold font-mono ${metric.color} truncate leading-tight`}
                  >
                    {metric.value}
                    {metric.unit && (
                      <span className="text-[10px] font-normal text-muted-foreground ml-1">
                        {metric.unit}
                      </span>
                    )}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
