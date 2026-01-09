import type { LoadTestConfig, LoadPattern } from "@/types/load-test";
import { DEFAULT_REALISTIC_CONFIG } from "@/types/load-test";

export interface LoadScheduleEntry {
  timestamp: number; // ms from start
  rate: number; // tx/s at this point
}

export function generateLoadSchedule(config: LoadTestConfig): LoadScheduleEntry[] {
  const schedule: LoadScheduleEntry[] = [];
  const durationMs = config.duration * 1000;

  switch (config.pattern) {
    case "constant":
      schedule.push({ timestamp: 0, rate: config.constantRate ?? 5 });
      schedule.push({ timestamp: durationMs, rate: config.constantRate ?? 5 });
      break;

    case "ramp":
      const rampStart = config.rampStart ?? 1;
      const rampEnd = config.rampEnd ?? 10;
      const steps = config.rampSteps ?? 5;
      const stepDuration = durationMs / steps;

      for (let i = 0; i <= steps; i++) {
        const rate = rampStart + (rampEnd - rampStart) * (i / steps);
        schedule.push({ timestamp: i * stepDuration, rate });
      }
      break;

    case "spike":
      const baseline = config.baselineRate ?? 2;
      const spike = config.spikeRate ?? 20;
      const spikeDuration = (config.spikeDuration ?? 5) * 1000;
      const spikeInterval = (config.spikeInterval ?? 15) * 1000;

      let currentTime = 0;
      while (currentTime < durationMs) {
        // Baseline phase
        schedule.push({ timestamp: currentTime, rate: baseline });

        // Spike phase
        const spikeStart = currentTime + spikeInterval - spikeDuration;
        if (spikeStart < durationMs) {
          schedule.push({ timestamp: spikeStart, rate: spike });
          const spikeEnd = currentTime + spikeInterval;
          if (spikeEnd < durationMs) {
            schedule.push({ timestamp: spikeEnd, rate: baseline });
          }
        }

        currentTime += spikeInterval;
      }
      break;

    case "adaptive":
      // Adaptive mode: start at initial rate, actual rate managed dynamically by store
      const initialRate = config.adaptiveInitialRate ?? 10;
      schedule.push({ timestamp: 0, rate: initialRate });
      schedule.push({ timestamp: durationMs, rate: initialRate });
      break;

    case "realistic":
      // Realistic mode: constant target TPS with dynamic tx types and tips
      const targetTps = config.realisticConfig?.targetTps ?? DEFAULT_REALISTIC_CONFIG.targetTps;
      schedule.push({ timestamp: 0, rate: targetTps });
      schedule.push({ timestamp: durationMs, rate: targetTps });
      break;
  }

  return schedule.sort((a, b) => a.timestamp - b.timestamp);
}

export function getRateAtTime(schedule: LoadScheduleEntry[], elapsedMs: number): number {
  if (schedule.length === 0) return 0;
  if (schedule.length === 1) return schedule[0].rate;

  // Find the two points we're between
  for (let i = 0; i < schedule.length - 1; i++) {
    const current = schedule[i];
    const next = schedule[i + 1];

    if (elapsedMs >= current.timestamp && elapsedMs <= next.timestamp) {
      // Linear interpolation
      const progress = (elapsedMs - current.timestamp) / (next.timestamp - current.timestamp);
      return current.rate + (next.rate - current.rate) * progress;
    }
  }

  // Past the end, return last rate
  return schedule[schedule.length - 1].rate;
}

export function getPatternDescription(pattern: LoadPattern): string {
  switch (pattern) {
    case "constant":
      return "Fixed rate throughout the test duration";
    case "ramp":
      return "Gradually increasing rate to find breaking point";
    case "spike":
      return "Periodic bursts to test resilience";
    case "adaptive":
      return "Adaptive rate that finds maximum throughput";
    case "realistic":
      return "Realistic mempool: many senders, variable tips, mixed tx types";
  }
}

export function getDefaultConfigForPattern(pattern: LoadPattern): Partial<LoadTestConfig> {
  // These values should match DEFAULT_LOAD_TEST_CONFIG in types/load-test.ts
  switch (pattern) {
    case "constant":
      return { constantRate: 100, duration: 60 };
    case "ramp":
      return { rampStart: 100, rampEnd: 5000, rampSteps: 10, duration: 120 };
    case "spike":
      return { baselineRate: 100, spikeRate: 5000, spikeDuration: 5, spikeInterval: 15, duration: 90 };
    case "adaptive":
      return { adaptiveInitialRate: 100, adaptiveTargetPending: 1000, adaptiveRateStep: 100, duration: 60 };
    case "realistic":
      return { duration: 120 }; // Realistic config handled separately via realisticConfig
  }
}
