import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { createTitan, napeCenter, stepTitan } from './titan'

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
