import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { emptyArena, insideBuildingXZ } from './city'
import { buildNavGrid, isWalkable } from './nav'
import { aggroRange, createTitan, napeCenter, raycastTitan, stepTitan, TURN_RATE } from './titan'

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

  it('footballers are apex aberrants: they see further and leap higher than abnormals', () => {
    for (const kind of ['striker', 'captain'] as const) {
      expect(aggroRange(kind)).toBeGreaterThan(aggroRange('abnormal'))
      const t = createTitan({ id: 1, kind, height: 14, x: 0, z: 0 })
      expect(t.leapCooldown).toBeGreaterThan(0) // spawns holding the aberrant leap timer
      t.state = 'chase'
      t.leapCooldown = 0
      stepTitan(t, player(30, 1.7, 0), DT, rngZero)
      expect(t.state).toBe('leap')
      expect(t.vel.y).toBeGreaterThan(13) // an abnormal leaps at 13 m/s
    }
  })

  it('footballers outrun an abnormal of the same height', () => {
    const chased = (kind: 'abnormal' | 'striker') => {
      const t = createTitan({ id: 1, kind, height: 14, x: 0, z: 0 })
      t.state = 'chase'
      t.leapCooldown = 999 // keep it on foot
      const target = player(100, 1.7, 0)
      for (let i = 0; i < 120; i++) stepTitan(t, target, DT, rngZero)
      return t.pos.x
    }
    expect(chased('striker')).toBeGreaterThan(chased('abnormal'))
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
    arena.buildings.push({ x: 15, z: 0, w: 6, d: 14, h: 16, kind: 'house', ridgeAxis: 'x', tint: 0.5 })
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
    arena.buildings.push({ x: 15, z: 0, w: 10, d: 14, h: 16, kind: 'house', ridgeAxis: 'x', tint: 0.5 })
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
    arena.buildings.push({ x: 10, z: 0, w: 4, d: 60, h: 20, kind: 'house', ridgeAxis: 'z', tint: 0.5 })
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
