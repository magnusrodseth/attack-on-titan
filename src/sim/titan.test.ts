import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { emptyArena, insideBuildingXZ } from './city'
import { buildNavGrid, isWalkable } from './nav'
import type { TitanBehavior } from './titan'
import {
  createTitan,
  napeCenter,
  raycastTitan,
  STAGGER_DURATION,
  staggerTitan,
  stepTitan,
  TURN_RATE,
} from './titan'

const DT = 1 / 120
const rngZero = () => 0
const player = (x: number, y: number, z: number) => new Vector3(x, y, z)

describe('napeCenter', () => {
  it('sits high on the neck, behind the facing direction', () => {
    const t = createTitan({ id: 1, kind: 'normal', height: 15, x: 0, z: 0 })
    t.facing = 0 // forward = +z
    const nape = napeCenter(t)
    expect(nape.y).toBeCloseTo(15 * 0.82)
    expect(nape.z).toBeLessThan(0)
    expect(nape.x).toBeCloseTo(0)
  })
})

describe('stepTitan', () => {
  it('starts wandering and switches to chase when the player is inside aggro range', () => {
    const t = createTitan({ id: 1, kind: 'normal', height: 12, x: 0, z: 0 })
    expect(t.state).toBe('wander')
    stepTitan(t, player(40, 1.7, 0), DT, rngZero)
    expect(t.state).toBe('chase')
  })

  it('keeps wandering when the player is far away', () => {
    const t = createTitan({ id: 1, kind: 'normal', height: 12, x: 0, z: 0 })
    stepTitan(t, player(200, 1.7, 0), DT, rngZero)
    expect(t.state).toBe('wander')
  })

  it('closes distance to the player while chasing', () => {
    const t = createTitan({ id: 1, kind: 'normal', height: 12, x: 0, z: 0 })
    const target = player(40, 1.7, 0)
    for (let i = 0; i < 240; i++) stepTitan(t, target, DT, rngZero)
    expect(t.pos.distanceTo(target)).toBeLessThan(40)
  })

  it('swats exactly once per windup+cooldown while the player stays in reach', () => {
    const t = createTitan({ id: 1, kind: 'normal', height: 15, x: 0, z: 0 })
    const target = player(5, 1.7, 0) // well inside reach for a 15m titan
    let swats = 0
    for (let i = 0; i < 120; i++) {
      // 1 second
      for (const e of stepTitan(t, target, DT, rngZero)) {
        if (e.type === 'swat') swats++
      }
    }
    expect(swats).toBe(1)
  })

  it('abnormals leap at the player from range', () => {
    const t = createTitan({ id: 1, kind: 'abnormal', height: 10, x: 0, z: 0 })
    t.state = 'chase'
    t.leapCooldown = 0
    stepTitan(t, player(30, 1.7, 0), DT, rngZero)
    expect(t.state).toBe('leap')
    expect(t.vel.y).toBeGreaterThan(0)
    expect(t.vel.x).toBeGreaterThan(0)
  })


  it('turns toward the player gradually instead of snapping', () => {
    const t = createTitan({ id: 1, kind: 'normal', height: 12, x: 0, z: 0 })
    t.state = 'chase'
    t.facing = 0
    stepTitan(t, player(0, 1.7, -40), DT, rngZero) // target yaw is π, directly behind
    expect(Math.abs(t.facing)).toBeGreaterThan(0)
    expect(Math.abs(t.facing)).toBeLessThanOrEqual(TURN_RATE.normal * DT + 1e-9)
  })

  it('paths around a building between it and the player instead of grinding into it', () => {
    const arena = emptyArena()
    arena.buildings.push({ x: 15, z: 0, w: 6, d: 14, y0: 0, h: 16, kind: 'house', ridgeAxis: 'x', tint: 0.5 })
    const nav = buildNavGrid(arena)
    const t = createTitan({ id: 1, kind: 'normal', height: 16, x: 0, z: 0 })
    t.state = 'chase'
    const target = player(30, 1.7, 0)
    for (let i = 0; i < 120 * 10; i++) stepTitan(t, target, DT, rngZero, arena, nav)
    expect(Math.hypot(t.pos.x - 30, t.pos.z)).toBeLessThan(10) // arrived despite the wall
    expect(isWalkable(nav, t.pos.x, t.pos.z)).toBe(true) // and never parked inside it
  })

  it('a titan standing inside a building wades out of the footprint', () => {
    const arena = emptyArena()
    arena.buildings.push({ x: 15, z: 0, w: 10, d: 14, y0: 0, h: 16, kind: 'house', ridgeAxis: 'x', tint: 0.5 })
    const nav = buildNavGrid(arena)
    const t = createTitan({ id: 1, kind: 'normal', height: 12, x: 15, z: 0 }) // embedded
    for (let i = 0; i < 120 * 5; i++) stepTitan(t, player(200, 1.7, 0), DT, rngZero, arena, nav)
    expect(insideBuildingXZ(arena, t.pos.x, t.pos.z)).toBe(false)
  })

  it('only aggros with a chase token, and disengages when the token is lost', () => {
    const t = createTitan({ id: 1, kind: 'normal', height: 12, x: 0, z: 0 })
    stepTitan(t, player(40, 1.7, 0), DT, rngZero, undefined, undefined, false)
    expect(t.state).toBe('wander')
    t.state = 'chase'
    stepTitan(t, player(40, 1.7, 0), DT, rngZero, undefined, undefined, false)
    expect(t.state).toBe('wander')
  })

  it('dead titans do not move or emit events', () => {
    const t = createTitan({ id: 1, kind: 'normal', height: 12, x: 0, z: 0 })
    t.hp = 0
    const before = t.pos.clone()
    const events = stepTitan(t, player(5, 1.7, 0), DT, rngZero)
    expect(t.state).toBe('dead')
    expect(events).toEqual([])
    expect(t.pos.toArray()).toEqual(before.toArray())
  })
})

describe('titan building collision', () => {
  it('cannot walk through a house; it is held at the wall', () => {
    const arena = emptyArena()
    // a long wall of building directly in the chase path
    arena.buildings.push({ x: 10, z: 0, w: 4, d: 60, y0: 0, h: 20, kind: 'house', ridgeAxis: 'z', tint: 0.5 })
    const t = createTitan({ id: 1, kind: 'normal', height: 12, x: 0, z: 0 })
    t.state = 'chase'
    const target = player(30, 1.7, 0)
    for (let i = 0; i < 480; i++) stepTitan(t, target, DT, rngZero, arena)
    expect(t.pos.x).toBeLessThan(8) // never inside the building footprint
  })
})

describe('crippled titans', () => {
  function crippled() {
    const t = createTitan({ id: 1, kind: 'normal', height: 12, x: 0, z: 0 })
    t.ankles = [true, true]
    t.state = 'crippled'
    t.stateTime = 0
    t.crippleTimer = 60
    return t
  }

  it('does not move or swat while crippled', () => {
    const t = crippled()
    const before = t.pos.clone()
    let swats = 0
    for (let i = 0; i < 240; i++) {
      for (const e of stepTitan(t, player(3, 1.7, 0), DT, rngZero)) {
        if (e.type === 'swat') swats++
      }
    }
    expect(swats).toBe(0)
    expect(t.pos.toArray()).toEqual(before.toArray())
  })

  it('lowers the nape while kneeling', () => {
    const t = crippled()
    const standing = createTitan({ id: 2, kind: 'normal', height: 12, x: 0, z: 0 })
    expect(napeCenter(t).y).toBeLessThan(napeCenter(standing).y - 1)
  })

  it('rises with full health and healed ankles when the timer expires', () => {
    const t = crippled()
    t.hp = 40
    t.crippleTimer = 0.05
    for (let i = 0; i < 20; i++) stepTitan(t, player(50, 1.7, 0), DT, rngZero)
    expect(t.state).not.toBe('crippled')
    expect(t.hp).toBe(t.maxHp)
    expect(t.ankles).toEqual([false, false])
  })
})

describe('staggered titans', () => {
  it('freezes in place without swatting, then recovers with wounds intact', () => {
    const t = createTitan({ id: 1, kind: 'normal', height: 12, x: 0, z: 0 })
    t.hp = 40
    t.state = 'chase'
    expect(staggerTitan(t)).toBe(true)
    expect(t.state).toBe('staggered')

    const before = t.pos.clone()
    let swats = 0
    for (let i = 0; i < Math.ceil((STAGGER_DURATION - 0.1) * 120); i++) {
      for (const e of stepTitan(t, player(3, 1.7, 0), DT, rngZero)) {
        if (e.type === 'swat') swats++
      }
    }
    expect(swats).toBe(0)
    expect(t.pos.toArray()).toEqual(before.toArray())
    expect(t.state).toBe('staggered')

    for (let i = 0; i < 30; i++) stepTitan(t, player(3, 1.7, 0), DT, rngZero)
    expect(t.state).not.toBe('staggered')
    expect(t.hp).toBe(40) // unlike a cripple recovery, the wounds stay
  })

  it('a second blast refreshes the timer without reporting a fresh stagger', () => {
    const t = createTitan({ id: 1, kind: 'normal', height: 12, x: 0, z: 0 })
    t.state = 'chase'
    staggerTitan(t)
    t.staggerTimer = 0.5
    expect(staggerTitan(t)).toBe(false)
    expect(t.staggerTimer).toBe(STAGGER_DURATION)
  })

  it('never staggers crippled, leaping or dead titans', () => {
    const crippledT = createTitan({ id: 1, kind: 'normal', height: 12, x: 0, z: 0 })
    crippledT.state = 'crippled'
    expect(staggerTitan(crippledT)).toBe(false)
    expect(crippledT.state).toBe('crippled')

    const leaper = createTitan({ id: 2, kind: 'abnormal', height: 12, x: 0, z: 0 })
    leaper.state = 'leap'
    expect(staggerTitan(leaper)).toBe(false)

    const dead = createTitan({ id: 3, kind: 'normal', height: 12, x: 0, z: 0 })
    dead.hp = 0
    expect(staggerTitan(dead)).toBe(false)
  })
})

describe('raycastTitan', () => {
  it('hits the body cylinder and reports the distance', () => {
    const t = createTitan({ id: 1, kind: 'normal', height: 15, x: 30, z: 0 })
    const dist = raycastTitan(t, new Vector3(0, 5, 0), new Vector3(1, 0, 0), 100)
    expect(dist).not.toBeNull()
    expect(dist!).toBeGreaterThan(25)
    expect(dist!).toBeLessThan(30)
  })

  it('misses above the head and beyond range', () => {
    const t = createTitan({ id: 1, kind: 'normal', height: 15, x: 30, z: 0 })
    expect(raycastTitan(t, new Vector3(0, 20, 0), new Vector3(1, 0, 0), 100)).toBeNull()
    expect(raycastTitan(t, new Vector3(0, 5, 0), new Vector3(1, 0, 0), 10)).toBeNull()
  })
})

/**
 * A leap is the one titan state that owns its own vertical arc, and it used to own it
 * completely — no ceiling, no buildings. Under a cavern roof that meant leaping into rock,
 * and in the Forest it meant sailing through 80m of tree.
 */
describe('leaping through the world', () => {
  function cavern() {
    const a = emptyArena()
    a.wallRadius = 240
    a.cavern = { centerY: 44, edgeY: 22, shafts: [], torches: [] }
    return a
  }

  it('keeps a leaping titan out of the cavern roof', () => {
    const a = cavern()
    const t = createTitan({ id: 1, kind: 'abnormal', height: 20, x: 0, z: 0 })
    t.state = 'leap'
    t.vel.set(0, 40, 0) // absurd upward kick: without a clamp it ends up inside the rock
    const player = new Vector3(0, 0, 30)
    for (let i = 0; i < 60; i++) stepTitan(t, player, 1 / 60, () => 0.5, a)
    // head (feet + height) must stay under the rock overhead, always
    const roof = 44 // ceiling at the centre
    expect(t.pos.y + t.height).toBeLessThanOrEqual(roof)
  })

  it('does not leap through a tree', () => {
    const a = emptyArena()
    a.buildings = [
      { x: 0, z: 20, w: 14, d: 14, y0: 0, h: 80, kind: 'trunk', ridgeAxis: 'x', tint: 0, shape: 'cyl' },
    ]
    const t = createTitan({ id: 1, kind: 'abnormal', height: 12, x: 0, z: 0 })
    t.state = 'leap'
    t.vel.set(0, 8, 30) // launched straight at the trunk
    const player = new Vector3(0, 0, 60) // player on the far side
    for (let i = 0; i < 90; i++) stepTitan(t, player, 1 / 60, () => 0.5, a)
    // it may end up anywhere except inside the bark
    expect(insideBuildingXZ(a, t.pos.x, t.pos.z, 0)).toBe(false)
    expect(Math.hypot(t.pos.x - 0, t.pos.z - 20)).toBeGreaterThan(6.9)
  })

  it('cannot leap out of a map with no wall', () => {
    const a = emptyArena()
    const t = createTitan({ id: 1, kind: 'abnormal', height: 12, x: 250, z: 0 })
    t.state = 'leap'
    t.vel.set(200, 5, 0) // flung at the horizon
    const player = new Vector3(0, 0, 0)
    for (let i = 0; i < 60; i++) stepTitan(t, player, 1 / 60, () => 0.5, a)
    expect(Math.hypot(t.pos.x, t.pos.z)).toBeLessThanOrEqual(a.wallRadius)
  })

  it('still lands and returns to the chase on open ground', () => {
    const a = emptyArena()
    const t = createTitan({ id: 1, kind: 'abnormal', height: 12, x: 0, z: 0 })
    t.state = 'leap'
    t.vel.set(0, 13, 20)
    const player = new Vector3(0, 0, 40)
    let landed = false
    for (let i = 0; i < 200; i++) {
      stepTitan(t, player, 1 / 60, () => 0.5, a)
      const state = t.state as TitanBehavior // stepTitan moves it on; don't let TS narrow
      if (t.pos.y === 0 && state === 'chase') landed = true
      expect(t.pos.y).toBeGreaterThanOrEqual(0) // never through the floor
    }
    expect(landed).toBe(true) // it comes down and resumes the chase (then leaps again)
  })
})
