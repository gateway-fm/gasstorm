import { describe, it, expect } from 'vitest'
import {
  generateLoadSchedule,
  getRateAtTime,
  getPatternDescription,
  getDefaultConfigForPattern,
  type LoadScheduleEntry,
} from './load-patterns'
import type { LoadTestConfig, LoadPattern } from '../types/load-test'

describe('generateLoadSchedule', () => {
  describe('constant pattern', () => {
    it('generates two entries for constant rate', () => {
      const config: LoadTestConfig = {
        pattern: 'constant',
        duration: 60,
        transactionType: 'eth-transfer',
        constantRate: 100,
      }
      const schedule = generateLoadSchedule(config)

      expect(schedule).toHaveLength(2)
      expect(schedule[0]).toEqual({ timestamp: 0, rate: 100 })
      expect(schedule[1]).toEqual({ timestamp: 60000, rate: 100 })
    })

    it('uses default rate of 5 when constantRate not specified', () => {
      const config: LoadTestConfig = {
        pattern: 'constant',
        duration: 30,
        transactionType: 'eth-transfer',
      }
      const schedule = generateLoadSchedule(config)

      expect(schedule[0].rate).toBe(5)
      expect(schedule[1].rate).toBe(5)
    })
  })

  describe('ramp pattern', () => {
    it('generates stepped ramp entries', () => {
      const config: LoadTestConfig = {
        pattern: 'ramp',
        duration: 100,
        transactionType: 'eth-transfer',
        rampStart: 10,
        rampEnd: 100,
        rampSteps: 9, // 10 points including start and end
      }
      const schedule = generateLoadSchedule(config)

      expect(schedule).toHaveLength(10) // steps + 1
      expect(schedule[0]).toEqual({ timestamp: 0, rate: 10 })
      expect(schedule[schedule.length - 1]).toEqual({ timestamp: 100000, rate: 100 })
    })

    it('uses default values when not specified', () => {
      const config: LoadTestConfig = {
        pattern: 'ramp',
        duration: 50,
        transactionType: 'eth-transfer',
      }
      const schedule = generateLoadSchedule(config)

      // Default: rampStart=1, rampEnd=10, rampSteps=5
      expect(schedule[0].rate).toBe(1)
      expect(schedule[schedule.length - 1].rate).toBe(10)
    })

    it('creates linear interpolation between steps', () => {
      const config: LoadTestConfig = {
        pattern: 'ramp',
        duration: 100,
        transactionType: 'eth-transfer',
        rampStart: 0,
        rampEnd: 100,
        rampSteps: 4,
      }
      const schedule = generateLoadSchedule(config)

      // 5 points: 0, 25, 50, 75, 100 at times 0, 25s, 50s, 75s, 100s
      expect(schedule[0].rate).toBe(0)
      expect(schedule[1].rate).toBe(25)
      expect(schedule[2].rate).toBe(50)
      expect(schedule[3].rate).toBe(75)
      expect(schedule[4].rate).toBe(100)
    })
  })

  describe('spike pattern', () => {
    it('generates baseline and spike entries', () => {
      const config: LoadTestConfig = {
        pattern: 'spike',
        duration: 30,
        transactionType: 'eth-transfer',
        baselineRate: 10,
        spikeRate: 100,
        spikeDuration: 5,
        spikeInterval: 15,
      }
      const schedule = generateLoadSchedule(config)

      // First entry should be baseline at t=0
      expect(schedule[0]).toEqual({ timestamp: 0, rate: 10 })
      // Should have spike entry somewhere
      const spikeEntries = schedule.filter(e => e.rate === 100)
      expect(spikeEntries.length).toBeGreaterThan(0)
    })

    it('uses default values when not specified', () => {
      const config: LoadTestConfig = {
        pattern: 'spike',
        duration: 60,
        transactionType: 'eth-transfer',
      }
      const schedule = generateLoadSchedule(config)

      // Default: baseline=2, spike=20
      expect(schedule[0].rate).toBe(2) // baseline
    })
  })

  describe('adaptive pattern', () => {
    it('generates two entries at initial rate', () => {
      const config: LoadTestConfig = {
        pattern: 'adaptive',
        duration: 60,
        transactionType: 'eth-transfer',
        adaptiveInitialRate: 50,
      }
      const schedule = generateLoadSchedule(config)

      expect(schedule).toHaveLength(2)
      expect(schedule[0]).toEqual({ timestamp: 0, rate: 50 })
      expect(schedule[1]).toEqual({ timestamp: 60000, rate: 50 })
    })

    it('uses default initial rate of 10', () => {
      const config: LoadTestConfig = {
        pattern: 'adaptive',
        duration: 30,
        transactionType: 'eth-transfer',
      }
      const schedule = generateLoadSchedule(config)

      expect(schedule[0].rate).toBe(10)
    })
  })

  describe('realistic pattern', () => {
    it('generates two entries at target TPS', () => {
      const config: LoadTestConfig = {
        pattern: 'realistic',
        duration: 120,
        transactionType: 'eth-transfer',
        realisticConfig: {
          numAccounts: 100,
          targetTps: 500,
          minTipGwei: 1,
          maxTipGwei: 100,
          tipDistribution: 'exponential',
          txTypeRatios: {
            ethTransfer: 40,
            erc20Transfer: 20,
            erc20Approve: 10,
            uniswapSwap: 15,
            storageWrite: 10,
            heavyCompute: 5,
          },
        },
      }
      const schedule = generateLoadSchedule(config)

      expect(schedule).toHaveLength(2)
      expect(schedule[0]).toEqual({ timestamp: 0, rate: 500 })
      expect(schedule[1]).toEqual({ timestamp: 120000, rate: 500 })
    })
  })

  it('returns sorted schedule by timestamp', () => {
    const config: LoadTestConfig = {
      pattern: 'spike',
      duration: 60,
      transactionType: 'eth-transfer',
    }
    const schedule = generateLoadSchedule(config)

    for (let i = 1; i < schedule.length; i++) {
      expect(schedule[i].timestamp).toBeGreaterThanOrEqual(schedule[i - 1].timestamp)
    }
  })
})

describe('getRateAtTime', () => {
  it('returns 0 for empty schedule', () => {
    expect(getRateAtTime([], 1000)).toBe(0)
  })

  it('returns the single rate for single-entry schedule', () => {
    const schedule: LoadScheduleEntry[] = [{ timestamp: 0, rate: 50 }]
    expect(getRateAtTime(schedule, 0)).toBe(50)
    expect(getRateAtTime(schedule, 1000)).toBe(50)
  })

  it('returns exact rate at schedule points', () => {
    const schedule: LoadScheduleEntry[] = [
      { timestamp: 0, rate: 10 },
      { timestamp: 10000, rate: 100 },
    ]
    expect(getRateAtTime(schedule, 0)).toBe(10)
    expect(getRateAtTime(schedule, 10000)).toBe(100)
  })

  it('interpolates between schedule points', () => {
    const schedule: LoadScheduleEntry[] = [
      { timestamp: 0, rate: 0 },
      { timestamp: 10000, rate: 100 },
    ]
    expect(getRateAtTime(schedule, 5000)).toBe(50) // Linear interpolation
    expect(getRateAtTime(schedule, 2500)).toBe(25)
    expect(getRateAtTime(schedule, 7500)).toBe(75)
  })

  it('returns last rate when past end of schedule', () => {
    const schedule: LoadScheduleEntry[] = [
      { timestamp: 0, rate: 10 },
      { timestamp: 10000, rate: 50 },
    ]
    expect(getRateAtTime(schedule, 20000)).toBe(50)
    expect(getRateAtTime(schedule, 100000)).toBe(50)
  })

  it('handles multi-segment schedules', () => {
    const schedule: LoadScheduleEntry[] = [
      { timestamp: 0, rate: 10 },
      { timestamp: 10000, rate: 50 },
      { timestamp: 20000, rate: 100 },
    ]
    // In first segment
    expect(getRateAtTime(schedule, 5000)).toBe(30) // 10 + (50-10)*0.5
    // In second segment
    expect(getRateAtTime(schedule, 15000)).toBe(75) // 50 + (100-50)*0.5
    // Past end
    expect(getRateAtTime(schedule, 30000)).toBe(100)
  })

  it('returns last rate when before schedule start (edge case)', () => {
    const schedule: LoadScheduleEntry[] = [
      { timestamp: 1000, rate: 10 },
      { timestamp: 2000, rate: 20 },
    ]
    // When time is before all schedule entries, the function falls through
    // to return the last rate (current implementation behavior)
    expect(getRateAtTime(schedule, 0)).toBe(20) // Falls through to last rate
  })
})

describe('getPatternDescription', () => {
  it('returns description for constant pattern', () => {
    expect(getPatternDescription('constant')).toBe('Fixed rate throughout the test duration')
  })

  it('returns description for ramp pattern', () => {
    expect(getPatternDescription('ramp')).toBe('Gradually increasing rate to find breaking point')
  })

  it('returns description for spike pattern', () => {
    expect(getPatternDescription('spike')).toBe('Periodic bursts to test resilience')
  })

  it('returns description for adaptive pattern', () => {
    expect(getPatternDescription('adaptive')).toBe('Adaptive rate that finds maximum throughput')
  })

  it('returns description for realistic pattern', () => {
    expect(getPatternDescription('realistic')).toBe(
      'Realistic mempool: many senders, variable tips, mixed tx types'
    )
  })
})

describe('getDefaultConfigForPattern', () => {
  it('returns defaults for constant pattern', () => {
    const defaults = getDefaultConfigForPattern('constant')
    expect(defaults.constantRate).toBe(100)
    expect(defaults.duration).toBe(60)
  })

  it('returns defaults for ramp pattern', () => {
    const defaults = getDefaultConfigForPattern('ramp')
    expect(defaults.rampStart).toBe(100)
    expect(defaults.rampEnd).toBe(5000)
    expect(defaults.rampSteps).toBe(10)
    expect(defaults.duration).toBe(120)
  })

  it('returns defaults for spike pattern', () => {
    const defaults = getDefaultConfigForPattern('spike')
    expect(defaults.baselineRate).toBe(100)
    expect(defaults.spikeRate).toBe(5000)
    expect(defaults.spikeDuration).toBe(5)
    expect(defaults.spikeInterval).toBe(15)
    expect(defaults.duration).toBe(90)
  })

  it('returns defaults for adaptive pattern', () => {
    const defaults = getDefaultConfigForPattern('adaptive')
    expect(defaults.adaptiveInitialRate).toBe(100)
    expect(defaults.adaptiveTargetPending).toBe(1000)
    expect(defaults.adaptiveRateStep).toBe(100)
    expect(defaults.duration).toBe(60)
  })

  it('returns defaults for realistic pattern', () => {
    const defaults = getDefaultConfigForPattern('realistic')
    expect(defaults.duration).toBe(120)
  })

  it('returns defined values for all pattern types', () => {
    const patterns: LoadPattern[] = ['constant', 'ramp', 'spike', 'adaptive', 'realistic']
    for (const pattern of patterns) {
      const defaults = getDefaultConfigForPattern(pattern)
      expect(defaults).toBeDefined()
      expect(defaults.duration).toBeGreaterThan(0)
    }
  })
})
