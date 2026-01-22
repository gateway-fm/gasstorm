import { describe, it, expect } from 'vitest'
import {
  calculatePercentile,
  calculateStatistics,
  formatNumber,
  formatDuration,
  formatGas,
  formatEth,
  formatGwei,
  formatPercent,
} from './statistics'

describe('calculatePercentile', () => {
  it('returns 0 for empty array', () => {
    expect(calculatePercentile([], 50)).toBe(0)
  })

  it('returns the single value for single-element array', () => {
    expect(calculatePercentile([42], 50)).toBe(42)
    expect(calculatePercentile([42], 0)).toBe(42)
    expect(calculatePercentile([42], 100)).toBe(42)
  })

  it('calculates p50 (median) correctly', () => {
    // For [1, 2, 3, 4, 5], median is 3
    expect(calculatePercentile([1, 2, 3, 4, 5], 50)).toBe(3)
  })

  it('calculates p50 with interpolation for even-length arrays', () => {
    // For [1, 2, 3, 4], p50 is 2.5
    expect(calculatePercentile([1, 2, 3, 4], 50)).toBe(2.5)
  })

  it('calculates p0 (min) correctly', () => {
    expect(calculatePercentile([1, 2, 3, 4, 5], 0)).toBe(1)
  })

  it('calculates p100 (max) correctly', () => {
    expect(calculatePercentile([1, 2, 3, 4, 5], 100)).toBe(5)
  })

  it('calculates p25 correctly', () => {
    // For [1, 2, 3, 4, 5], p25 index = 0.25 * 4 = 1, so value is 2
    expect(calculatePercentile([1, 2, 3, 4, 5], 25)).toBe(2)
  })

  it('calculates p75 correctly', () => {
    // For [1, 2, 3, 4, 5], p75 index = 0.75 * 4 = 3, so value is 4
    expect(calculatePercentile([1, 2, 3, 4, 5], 75)).toBe(4)
  })

  it('interpolates between values correctly', () => {
    // For [10, 20, 30, 40, 50], p10 should interpolate
    // index = 0.1 * 4 = 0.4
    // weight = 0.4
    // result = 10 * 0.6 + 20 * 0.4 = 6 + 8 = 14
    expect(calculatePercentile([10, 20, 30, 40, 50], 10)).toBeCloseTo(14)
  })

  it('handles two-element array correctly', () => {
    expect(calculatePercentile([0, 100], 0)).toBe(0)
    expect(calculatePercentile([0, 100], 50)).toBe(50)
    expect(calculatePercentile([0, 100], 100)).toBe(100)
  })
})

describe('calculateStatistics', () => {
  it('returns zeros for empty array', () => {
    const stats = calculateStatistics([])
    expect(stats.min).toBe(0)
    expect(stats.max).toBe(0)
    expect(stats.mean).toBe(0)
    expect(stats.median).toBe(0)
    expect(stats.p75).toBe(0)
    expect(stats.p90).toBe(0)
    expect(stats.p95).toBe(0)
    expect(stats.p99).toBe(0)
    expect(stats.stdDev).toBe(0)
    expect(stats.count).toBe(0)
  })

  it('calculates stats for single value', () => {
    const stats = calculateStatistics([42])
    expect(stats.min).toBe(42)
    expect(stats.max).toBe(42)
    expect(stats.mean).toBe(42)
    expect(stats.median).toBe(42)
    expect(stats.stdDev).toBe(0)
    expect(stats.count).toBe(1)
  })

  it('calculates min and max correctly', () => {
    const stats = calculateStatistics([5, 2, 8, 1, 9])
    expect(stats.min).toBe(1)
    expect(stats.max).toBe(9)
  })

  it('calculates mean correctly', () => {
    const stats = calculateStatistics([10, 20, 30])
    expect(stats.mean).toBe(20)
  })

  it('calculates median correctly', () => {
    const stats = calculateStatistics([1, 2, 3, 4, 5])
    expect(stats.median).toBe(3)
  })

  it('calculates standard deviation correctly', () => {
    // For [2, 4, 4, 4, 5, 5, 7, 9]
    // Mean = 40/8 = 5
    // Variance = [(2-5)^2 + (4-5)^2 + (4-5)^2 + (4-5)^2 + (5-5)^2 + (5-5)^2 + (7-5)^2 + (9-5)^2] / 8
    //          = [9 + 1 + 1 + 1 + 0 + 0 + 4 + 16] / 8 = 32 / 8 = 4
    // StdDev = sqrt(4) = 2
    const stats = calculateStatistics([2, 4, 4, 4, 5, 5, 7, 9])
    expect(stats.mean).toBe(5)
    expect(stats.stdDev).toBe(2)
  })

  it('calculates count correctly', () => {
    const stats = calculateStatistics([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(stats.count).toBe(10)
  })

  it('does not modify the original array', () => {
    const original = [5, 2, 8, 1, 9]
    const copy = [...original]
    calculateStatistics(original)
    expect(original).toEqual(copy)
  })

  it('handles negative values', () => {
    const stats = calculateStatistics([-10, -5, 0, 5, 10])
    expect(stats.min).toBe(-10)
    expect(stats.max).toBe(10)
    expect(stats.mean).toBe(0)
    expect(stats.median).toBe(0)
  })

  it('handles duplicate values', () => {
    const stats = calculateStatistics([5, 5, 5, 5, 5])
    expect(stats.min).toBe(5)
    expect(stats.max).toBe(5)
    expect(stats.mean).toBe(5)
    expect(stats.stdDev).toBe(0)
  })

  it('calculates percentiles (p75, p90, p95, p99)', () => {
    // Create 100 values from 1 to 100
    const values = Array.from({ length: 100 }, (_, i) => i + 1)
    const stats = calculateStatistics(values)

    // With 100 values, p75 should be around 75, p90 around 90, etc.
    expect(stats.p75).toBeGreaterThanOrEqual(74)
    expect(stats.p75).toBeLessThanOrEqual(76)
    expect(stats.p90).toBeGreaterThanOrEqual(89)
    expect(stats.p90).toBeLessThanOrEqual(91)
    expect(stats.p95).toBeGreaterThanOrEqual(94)
    expect(stats.p95).toBeLessThanOrEqual(96)
    expect(stats.p99).toBeGreaterThanOrEqual(98)
    expect(stats.p99).toBeLessThanOrEqual(100)
  })
})

describe('formatNumber', () => {
  it('formats with default 2 decimals', () => {
    expect(formatNumber(3.14159)).toBe('3.14')
  })

  it('formats with custom decimals', () => {
    expect(formatNumber(3.14159, 4)).toBe('3.1416')
    expect(formatNumber(3.14159, 0)).toBe('3')
  })

  it('formats integers', () => {
    expect(formatNumber(42)).toBe('42.00')
    expect(formatNumber(42, 0)).toBe('42')
  })

  it('formats negative numbers', () => {
    expect(formatNumber(-3.14159)).toBe('-3.14')
  })

  it('formats zero', () => {
    expect(formatNumber(0)).toBe('0.00')
  })
})

describe('formatDuration', () => {
  it('formats milliseconds', () => {
    expect(formatDuration(500)).toBe('500ms')
    expect(formatDuration(0)).toBe('0ms')
    expect(formatDuration(999)).toBe('999ms')
  })

  it('formats seconds', () => {
    expect(formatDuration(1000)).toBe('1.00s')
    expect(formatDuration(1500)).toBe('1.50s')
    expect(formatDuration(30000)).toBe('30.00s')
    expect(formatDuration(59999)).toBe('60.00s')
  })

  it('formats minutes and seconds', () => {
    expect(formatDuration(60000)).toBe('1m 0.0s')
    expect(formatDuration(90000)).toBe('1m 30.0s')
    expect(formatDuration(120000)).toBe('2m 0.0s')
    expect(formatDuration(125500)).toBe('2m 5.5s')
  })

  it('formats large durations', () => {
    expect(formatDuration(3600000)).toBe('60m 0.0s')
  })
})

describe('formatGas', () => {
  it('formats gas in Mgas', () => {
    expect(formatGas(BigInt(1_000_000))).toBe('1.00 Mgas')
    expect(formatGas(BigInt(500_000_000))).toBe('500.00 Mgas')
    expect(formatGas(BigInt(999_999_999))).toBe('1000.00 Mgas')
  })

  it('formats gas in Ggas for large values', () => {
    expect(formatGas(BigInt(1_000_000_000_000))).toBe('1000.00 Ggas')
    expect(formatGas(BigInt(1_500_000_000_000))).toBe('1500.00 Ggas')
  })

  it('formats zero gas', () => {
    expect(formatGas(BigInt(0))).toBe('0.00 Mgas')
  })

  it('formats small gas values', () => {
    expect(formatGas(BigInt(21000))).toBe('0.02 Mgas')
  })
})

describe('formatEth', () => {
  it('formats 1 ETH', () => {
    expect(formatEth(BigInt('1000000000000000000'))).toBe('1.0000 ETH')
  })

  it('formats fractional ETH', () => {
    expect(formatEth(BigInt('500000000000000000'))).toBe('0.5000 ETH')
    expect(formatEth(BigInt('100000000000000000'))).toBe('0.1000 ETH')
  })

  it('formats zero', () => {
    expect(formatEth(BigInt(0))).toBe('0.0000 ETH')
  })

  it('formats small amounts', () => {
    expect(formatEth(BigInt('1000000000000000'))).toBe('0.0010 ETH')
  })
})

describe('formatGwei', () => {
  it('formats gwei', () => {
    expect(formatGwei(BigInt(1_000_000_000))).toBe('1.00 gwei')
    expect(formatGwei(BigInt(10_000_000_000))).toBe('10.00 gwei')
  })

  it('formats fractional gwei', () => {
    expect(formatGwei(BigInt(500_000_000))).toBe('0.50 gwei')
  })

  it('formats zero', () => {
    expect(formatGwei(BigInt(0))).toBe('0.00 gwei')
  })
})

describe('formatPercent', () => {
  it('formats percentages', () => {
    expect(formatPercent(50)).toBe('50.0%')
    expect(formatPercent(100)).toBe('100.0%')
    expect(formatPercent(0)).toBe('0.0%')
  })

  it('formats decimal percentages', () => {
    expect(formatPercent(33.333)).toBe('33.3%')
    expect(formatPercent(66.666)).toBe('66.7%')
  })

  it('formats values over 100%', () => {
    expect(formatPercent(150)).toBe('150.0%')
  })

  it('formats negative percentages', () => {
    expect(formatPercent(-10)).toBe('-10.0%')
  })
})
