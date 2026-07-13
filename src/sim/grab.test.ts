import { describe, expect, it } from 'vitest'
import {
  GRAB_ESCAPE_PRESSES,
  GRAB_ESCAPE_SECONDS,
  GRAB_LINGER_SECONDS,
  GRAB_REGRAB_COOLDOWN,
  GRAB_SPEED_LIMIT,
  createGrabWatch,
  findGrabCandidates,
  grabHoldPoint,
  grabReach,
  startGrab,
  stepGrab,
  updateGrabWatch,
} from './grab'
import { createPlayer } from './player'
import type { TitanState } from './titan'
import { createTitan } from './titan'

const DT = 1 / 120

function loiterSetup(height = 10) {
  const titan = createTitan({ id: 1, kind: 'normal', height, x: 0, z: 0 })
  const player = createPlayer()
  player.pos.set(grabReach(titan) - 1, 1.6, 0) // on the ground at its feet
  player.vel.set(0, 0, 0)
  return { titan, player, watch: createGrabWatch() }
}

/** Steps the watch until it fires or the deadline passes; returns the grabber (or null). */
function stepUntilGrab(
  watch: ReturnType<typeof createGrabWatch>,
  player: ReturnType<typeof createPlayer>,
  titans: TitanState[],
  seconds: number,
): TitanState | null {
  for (let t = 0; t < seconds; t += DT) {
    const grabber = updateGrabWatch(watch, player, titans, DT, false)
    if (grabber) return grabber
  }
  return null
}

describe('updateGrabWatch', () => {
  it('grabs after lingering still at a titan\'s feet for the full linger time', () => {
    const { titan, player, watch } = loiterSetup()
    expect(stepUntilGrab(watch, player, [titan], GRAB_LINGER_SECONDS - 0.1)).toBeNull()
    expect(stepUntilGrab(watch, player, [titan], 0.2)).toBe(titan)
  })

  it('counts hanging onto the titan itself as inside its area', () => {
    const { titan, player, watch } = loiterSetup()
    player.pos.set(1, titan.height * 0.5, 0) // dangling from a hook in its flank
    expect(stepUntilGrab(watch, player, [titan], GRAB_LINGER_SECONDS + 0.1)).toBe(titan)
  })

  it('moving above the speed limit resets the linger', () => {
    const { titan, player, watch } = loiterSetup()
    stepUntilGrab(watch, player, [titan], GRAB_LINGER_SECONDS * 0.8)
    player.vel.set(GRAB_SPEED_LIMIT + 4, 0, 0)
    updateGrabWatch(watch, player, [titan], DT, false)
    player.vel.set(0, 0, 0)
    // the clock started over: the remaining fifth of the old linger is not enough
    expect(stepUntilGrab(watch, player, [titan], GRAB_LINGER_SECONDS * 0.5)).toBeNull()
    expect(stepUntilGrab(watch, player, [titan], GRAB_LINGER_SECONDS)).toBe(titan)
  })

  it('leaving the zone resets the linger', () => {
    const { titan, player, watch } = loiterSetup()
    stepUntilGrab(watch, player, [titan], GRAB_LINGER_SECONDS * 0.8)
    const inside = player.pos.x
    player.pos.x = grabReach(titan) + 10
    updateGrabWatch(watch, player, [titan], DT, false)
    player.pos.x = inside
    expect(stepUntilGrab(watch, player, [titan], GRAB_LINGER_SECONDS * 0.5)).toBeNull()
  })

  it('perching above the titan\'s head is out of reach', () => {
    const { titan, player, watch } = loiterSetup()
    player.pos.y = titan.height * 1.5 // a rooftop overhead, inside the horizontal ring
    expect(stepUntilGrab(watch, player, [titan], GRAB_LINGER_SECONDS + 0.5)).toBeNull()
  })

  it('dead, crippled, staggered and leaping titans cannot grab', () => {
    for (const state of ['dead', 'crippled', 'staggered', 'leap'] as const) {
      const { titan, player, watch } = loiterSetup()
      titan.state = state
      if (state === 'dead') titan.hp = 0
      expect(stepUntilGrab(watch, player, [titan], GRAB_LINGER_SECONDS + 0.5)).toBeNull()
    }
  })

  it('a blocked tick (invulnerable, striking) resets the linger', () => {
    const { titan, player, watch } = loiterSetup()
    stepUntilGrab(watch, player, [titan], GRAB_LINGER_SECONDS * 0.8)
    updateGrabWatch(watch, player, [titan], DT, true)
    expect(stepUntilGrab(watch, player, [titan], GRAB_LINGER_SECONDS * 0.5)).toBeNull()
  })

  it('the regrab cooldown must expire before the linger accrues again', () => {
    const { titan, player, watch } = loiterSetup()
    watch.cooldown = GRAB_REGRAB_COOLDOWN
    expect(
      stepUntilGrab(watch, player, [titan], GRAB_REGRAB_COOLDOWN + GRAB_LINGER_SECONDS - 0.2),
    ).toBeNull()
    expect(stepUntilGrab(watch, player, [titan], 0.5)).toBe(titan)
  })

  it('the nearest eligible titan takes the grab', () => {
    const near = createTitan({ id: 1, kind: 'normal', height: 10, x: 3, z: 0 })
    const far = createTitan({ id: 2, kind: 'normal', height: 10, x: -4, z: 0 })
    const player = createPlayer()
    player.pos.set(0, 1.6, 0)
    player.vel.set(0, 0, 0)
    const watch = createGrabWatch()
    expect(stepUntilGrab(watch, player, [far, near], GRAB_LINGER_SECONDS + 0.1)).toBe(near)
  })
})

describe('stepGrab', () => {
  it('escapes on the final mash press inside the window', () => {
    const grab = startGrab(createTitan({ id: 1, kind: 'normal', height: 10, x: 0, z: 0 }))
    for (let press = 0; press < GRAB_ESCAPE_PRESSES - 1; press++) {
      expect(stepGrab(grab, true, DT)).toBe('held')
      expect(stepGrab(grab, false, DT)).toBe('held')
    }
    expect(stepGrab(grab, true, DT)).toBe('escaped')
  })

  it('holding the key counts once; only fresh presses fill the bar', () => {
    const grab = startGrab(createTitan({ id: 1, kind: 'normal', height: 10, x: 0, z: 0 }))
    stepGrab(grab, true, DT)
    expect(grab.presses).toBe(1)
  })

  it('fails when the timer runs out short of the press count', () => {
    const grab = startGrab(createTitan({ id: 1, kind: 'normal', height: 10, x: 0, z: 0 }))
    let result: ReturnType<typeof stepGrab> = 'held'
    let elapsed = 0
    while (result === 'held') {
      result = stepGrab(grab, false, DT)
      elapsed += DT
    }
    expect(result).toBe('failed')
    expect(elapsed).toBeGreaterThanOrEqual(GRAB_ESCAPE_SECONDS - DT)
    expect(elapsed).toBeLessThan(GRAB_ESCAPE_SECONDS + 0.1)
  })
})

describe('grabHoldPoint', () => {
  it('holds the soldier at chest height in front of the titan', () => {
    const titan = createTitan({ id: 1, kind: 'normal', height: 12, x: 5, z: -3 })
    const point = grabHoldPoint(titan)
    expect(point.y).toBeCloseTo(titan.pos.y + titan.height * 0.62)
    const horiz = Math.hypot(point.x - titan.pos.x, point.z - titan.pos.z)
    expect(horiz).toBeGreaterThan(0)
    expect(horiz).toBeLessThan(titan.height * 0.5)
  })
})

describe('shifters and the grab', () => {
  it('a shifter never grabs: its pressure comes from abilities instead', () => {
    const player = createPlayer()
    player.vel.set(0, 0, 0)
    const shifter = createTitan({ id: 5, kind: 'shifter', height: 17, x: 0, z: 0 })
    shifter.state = 'chase'
    player.pos.set(2, 2, 0) // deep inside grab reach
    expect(findGrabCandidates(player, [shifter])).toHaveLength(0)
  })
})
