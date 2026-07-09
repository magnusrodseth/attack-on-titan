import { describe, expect, it } from 'vitest'
import { CYCLE_SECONDS } from './daynight'
import { LAMP_BATTERY_SECONDS, LAMP_LOW_SECONDS, drainLamp, lampGlow, lampOn } from './flashlight'

// Clock fractions: 0 = midnight, 0.5 = noon, 0.75 = sunset.
const MIDNIGHT = 0
const NOON = 0.5
const SUNSET = 0.75

describe('lampOn', () => {
  it('is off in daylight and on at midnight', () => {
    expect(lampOn(NOON)).toBe(false)
    expect(lampOn(MIDNIGHT)).toBe(true)
  })

  it('switches on as the sun crosses the horizon', () => {
    expect(lampOn(SUNSET + 0.001)).toBe(true) // just after the sun dips under
    expect(lampOn(SUNSET - 0.03)).toBe(false) // still dusk, sun above the horizon
  })
})

describe('drainLamp', () => {
  it('does not drain in daylight', () => {
    expect(drainLamp(LAMP_BATTERY_SECONDS, NOON, 1)).toBe(LAMP_BATTERY_SECONDS)
  })

  it('drains one second of battery per second of night', () => {
    expect(drainLamp(LAMP_BATTERY_SECONDS, MIDNIGHT, 1)).toBe(LAMP_BATTERY_SECONDS - 1)
  })

  it('clamps at zero instead of going negative', () => {
    expect(drainLamp(0.25, MIDNIGHT, 1)).toBe(0)
    expect(drainLamp(0, MIDNIGHT, 1)).toBe(0)
  })
})

describe('lampGlow', () => {
  it('is dark in daylight even with a full battery', () => {
    expect(lampGlow(NOON, LAMP_BATTERY_SECONDS)).toBe(0)
  })

  it('is at full strength deep in the night with a healthy battery', () => {
    expect(lampGlow(MIDNIGHT, LAMP_BATTERY_SECONDS)).toBe(1)
  })

  it('browns out as the battery runs down, and dies at zero', () => {
    const half = lampGlow(MIDNIGHT, 6)
    expect(half).toBeGreaterThan(0)
    expect(half).toBeLessThan(1)
    expect(lampGlow(MIDNIGHT, 0)).toBe(0)
  })

  it('fades in through late dusk instead of popping on', () => {
    const early = lampGlow(SUNSET, LAMP_BATTERY_SECONDS)
    expect(early).toBeGreaterThanOrEqual(0)
    expect(early).toBeLessThan(lampGlow(MIDNIGHT, LAMP_BATTERY_SECONDS))
  })
})

describe('battery vs night length', () => {
  it('forces exactly one resupply per night: the lamp dies mid-night, one recharge covers the rest', () => {
    let litSeconds = 0
    for (let s = 0; s < CYCLE_SECONDS; s++) {
      if (lampOn(s / CYCLE_SECONDS)) litSeconds += 1
    }
    expect(LAMP_BATTERY_SECONDS).toBeLessThan(litSeconds) // a full charge cannot cover the night
    expect(LAMP_BATTERY_SECONDS * 2).toBeGreaterThan(litSeconds) // one recharge can
    expect(LAMP_LOW_SECONDS).toBeLessThan(LAMP_BATTERY_SECONDS)
  })
})
