import { describe, expect, it } from 'vitest'
import {
  CYCLE_SECONDS,
  clockFraction,
  nightFactor,
  START_MAX,
  START_MIN,
  startFraction,
  sunElevation,
} from './daynight'

describe('startFraction', () => {
  it('is deterministic per seed', () => {
    expect(startFraction('wall-2026-7-9')).toBe(startFraction('wall-2026-7-9'))
  })

  it('varies across seeds', () => {
    const hours = new Set(
      ['a', 'b', 'c', 'd', 'e'].map((seed) => startFraction(seed).toFixed(6)),
    )
    expect(hours.size).toBeGreaterThan(1)
  })

  it('always starts a run in daylight', () => {
    for (let i = 0; i < 200; i++) {
      const f = startFraction(`seed-${i}`)
      expect(f).toBeGreaterThanOrEqual(START_MIN)
      expect(f).toBeLessThan(START_MAX)
    }
  })
})

describe('clockFraction', () => {
  it('starts at the seeded hour and stays in [0, 1)', () => {
    expect(clockFraction('x', 0)).toBe(startFraction('x'))
    for (const t of [0, 1, 599, 600, 12345.6, 1e6]) {
      const f = clockFraction('x', t)
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThan(1)
    }
  })

  it('advances one full cycle per CYCLE_SECONDS and wraps', () => {
    const at = (t: number) => clockFraction('x', t)
    expect(at(CYCLE_SECONDS)).toBeCloseTo(at(0), 10)
    expect(at(CYCLE_SECONDS / 2)).toBeCloseTo((at(0) + 0.5) % 1, 10)
  })
})

describe('sunElevation', () => {
  it('peaks at noon, bottoms at midnight, crosses zero at sunrise and sunset', () => {
    expect(sunElevation(0.5)).toBeCloseTo(1, 10)
    expect(sunElevation(0)).toBeCloseTo(-1, 10)
    expect(sunElevation(0.25)).toBeCloseTo(0, 10)
    expect(sunElevation(0.75)).toBeCloseTo(0, 10)
  })

  it('is above the horizon through the day half and below through the night half', () => {
    expect(sunElevation(0.35)).toBeGreaterThan(0)
    expect(sunElevation(0.65)).toBeGreaterThan(0)
    expect(sunElevation(0.85)).toBeLessThan(0)
    expect(sunElevation(0.15)).toBeLessThan(0)
  })
})

describe('nightFactor', () => {
  it('is 0 in full day and 1 in full night', () => {
    expect(nightFactor(0.5)).toBe(0)
    expect(nightFactor(0)).toBe(1)
  })

  it('passes smoothly through twilight at sunset', () => {
    expect(nightFactor(0.75)).toBeCloseTo(0.5, 10)
    let prev = nightFactor(0.7)
    for (let f = 0.71; f <= 0.86; f += 0.01) {
      const now = nightFactor(f)
      expect(now).toBeGreaterThanOrEqual(prev)
      prev = now
    }
    expect(nightFactor(0.7)).toBe(0)
    expect(nightFactor(0.86)).toBe(1)
  })

  it('mirrors at dawn', () => {
    expect(nightFactor(0.25)).toBeCloseTo(0.5, 10)
    expect(nightFactor(0.3)).toBeLessThan(nightFactor(0.2))
  })

  it('stays clamped to [0, 1] over the whole cycle', () => {
    for (let f = 0; f < 1; f += 0.005) {
      const n = nightFactor(f)
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThanOrEqual(1)
    }
  })
})
