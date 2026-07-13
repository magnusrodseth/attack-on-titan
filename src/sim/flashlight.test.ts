import { describe, expect, it } from 'vitest'
import { emptyArena } from './city'
import { CYCLE_SECONDS, nightFactor } from './daynight'
import {
  LAMP_BATTERY_SECONDS,
  LAMP_LOW_SECONDS,
  drainLamp,
  lampGlow,
  lampOn,
  lightAround,
} from './flashlight'

// Clock fractions: 0 = midnight, 0.5 = noon, 0.75 = sunset.
const MIDNIGHT = 0
const NOON = 0.5
const SUNSET = 0.75

/** The light a soldier standing in the open district sees at an hour. */
const outdoors = (fraction: number): number => lightAround(emptyArena(), 0, 2, 0, fraction)

function cavern(): ReturnType<typeof emptyArena> {
  const arena = emptyArena()
  arena.cavern = {
    centerY: 44,
    edgeY: 22,
    shafts: [{ x: 100, z: 0, radius: 12 }],
    torches: [{ x: 0, z: 0 }],
  }
  return arena
}

describe('lightAround', () => {
  it('under an open sky is simply the daylight', () => {
    expect(outdoors(NOON)).toBeCloseTo(1)
    expect(outdoors(MIDNIGHT)).toBeCloseTo(0)
    expect(outdoors(SUNSET)).toBeCloseTo(1 - nightFactor(SUNSET))
  })

  it('in the cavern a torch lights its own patch, day or night', () => {
    const arena = cavern()
    expect(lightAround(arena, 0, 2, 0, MIDNIGHT)).toBeGreaterThan(0.5) // standing at the fire
    expect(lightAround(arena, 8, 2, 0, MIDNIGHT)).toBeGreaterThan(0.5) // still in its pool
    expect(lightAround(arena, 60, 2, 60, MIDNIGHT)).toBeLessThan(0.1) // a dark alley
    // the fire does not care whether the sun is up
    expect(lightAround(arena, 0, 2, 0, MIDNIGHT)).toBeCloseTo(lightAround(arena, 0, 2, 0, NOON) - 0.1, 1)
  })

  it('the vault overhead stays dark: swing up off the street and the lamp is yours again', () => {
    const arena = cavern()
    expect(lampOn(lightAround(arena, 0, 2, 0, MIDNIGHT))).toBe(false) // at the fire
    expect(lampOn(lightAround(arena, 0, 34, 0, MIDNIGHT))).toBe(true) // up under the rock
  })

  it('two torches pool their light, so a lit street never goes dark between them', () => {
    const arena = cavern()
    arena.cavern!.torches = [
      { x: -18, z: 0 },
      { x: 18, z: 0 },
    ]
    // the midpoint is out of each torch's strong range, but their pools add up
    expect(lampOn(lightAround(arena, 0, 2, 0, MIDNIGHT))).toBe(false)
    // step off the street into a back courtyard and the dark takes over
    expect(lampOn(lightAround(arena, 0, 2, 55, MIDNIGHT))).toBe(true)
  })

  it('in the cavern a shaft pours daylight, and nothing at midnight', () => {
    const arena = cavern()
    expect(lightAround(arena, 100, 2, 0, NOON)).toBeGreaterThan(0.5) // under the hole at noon
    expect(lightAround(arena, 100, 2, 0, MIDNIGHT)).toBeLessThan(0.1) // the same spot at night
  })
})

describe('lampOn', () => {
  it('is off in daylight and on at midnight (the district, unchanged)', () => {
    expect(lampOn(outdoors(NOON))).toBe(false)
    expect(lampOn(outdoors(MIDNIGHT))).toBe(true)
  })

  it('switches on as the sun crosses the horizon', () => {
    expect(lampOn(outdoors(SUNSET + 0.001))).toBe(true) // just after the sun dips under
    expect(lampOn(outdoors(SUNSET - 0.03))).toBe(false) // still dusk, sun above the horizon
  })

  it('stays off beside a torch at midnight, and trips in the dark between them', () => {
    const arena = cavern()
    expect(lampOn(lightAround(arena, 0, 2, 0, MIDNIGHT))).toBe(false)
    expect(lampOn(lightAround(arena, 60, 2, 60, MIDNIGHT))).toBe(true)
  })
})

describe('drainLamp', () => {
  it('does not drain in daylight', () => {
    expect(drainLamp(LAMP_BATTERY_SECONDS, outdoors(NOON), 1)).toBe(LAMP_BATTERY_SECONDS)
  })

  it('drains one second of battery per second of darkness', () => {
    expect(drainLamp(LAMP_BATTERY_SECONDS, outdoors(MIDNIGHT), 1)).toBe(LAMP_BATTERY_SECONDS - 1)
  })

  it('does not drain while the soldier stands in torchlight', () => {
    const lit = lightAround(cavern(), 0, 2, 0, MIDNIGHT)
    expect(drainLamp(LAMP_BATTERY_SECONDS, lit, 1)).toBe(LAMP_BATTERY_SECONDS)
  })

  it('clamps at zero instead of going negative', () => {
    expect(drainLamp(0.25, outdoors(MIDNIGHT), 1)).toBe(0)
    expect(drainLamp(0, outdoors(MIDNIGHT), 1)).toBe(0)
  })
})

describe('lampGlow', () => {
  it('is dark in daylight even with a full battery', () => {
    expect(lampGlow(outdoors(NOON), LAMP_BATTERY_SECONDS)).toBe(0)
  })

  it('is at full strength in pitch dark with a healthy battery', () => {
    expect(lampGlow(outdoors(MIDNIGHT), LAMP_BATTERY_SECONDS)).toBe(1)
  })

  it('browns out as the battery runs down, and dies at zero', () => {
    const half = lampGlow(outdoors(MIDNIGHT), 6)
    expect(half).toBeGreaterThan(0)
    expect(half).toBeLessThan(1)
    expect(lampGlow(outdoors(MIDNIGHT), 0)).toBe(0)
  })

  it('fades in as the light fails instead of popping on', () => {
    const early = lampGlow(outdoors(SUNSET), LAMP_BATTERY_SECONDS)
    expect(early).toBeGreaterThanOrEqual(0)
    expect(early).toBeLessThan(lampGlow(outdoors(MIDNIGHT), LAMP_BATTERY_SECONDS))
  })
})

describe('battery vs night length', () => {
  it('forces exactly one resupply per night: the lamp dies mid-night, one recharge covers the rest', () => {
    let litSeconds = 0
    for (let s = 0; s < CYCLE_SECONDS; s++) {
      if (lampOn(outdoors(s / CYCLE_SECONDS))) litSeconds += 1
    }
    expect(LAMP_BATTERY_SECONDS).toBeLessThan(litSeconds) // a full charge cannot cover the night
    expect(LAMP_BATTERY_SECONDS * 2).toBeGreaterThan(litSeconds) // one recharge can
    expect(LAMP_LOW_SECONDS).toBeLessThan(LAMP_BATTERY_SECONDS)
  })
})
