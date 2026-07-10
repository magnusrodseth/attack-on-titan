import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { createGame } from './game'
import { createPlayer } from './player'
import {
  STRIKE_EXIT_SPEED,
  STRIKE_RANGE,
  createStrike,
  findStrikeTarget,
  stepStrike,
} from './strike'
import type { TitanState } from './titan'
import { createTitan, napeCenter } from './titan'

const DT = 1 / 120

/** A cleared city with a wall, so line-of-sight tests place their own obstacles. */
function emptyArena() {
  const arena = createGame('strike-test', null).arena
  arena.buildings.length = 0
  return arena
}

function titanAt(x: number, z: number, id = 1, height = 10): TitanState {
  const titan = createTitan({ id, kind: 'normal', height, x, z })
  titan.facing = 0
  return titan
}

function aimAt(from: Vector3, target: Vector3): Vector3 {
  return target.clone().sub(from).normalize()
}

describe('findStrikeTarget', () => {
  it('locks a living nape inside the cone and range', () => {
    const arena = emptyArena()
    const titan = titanAt(30, 0)
    const pos = new Vector3(0, 10, 0)
    const look = aimAt(pos, napeCenter(titan))
    expect(findStrikeTarget(pos, look, [titan], arena)).toBe(titan.id)
  })

  it('rejects an aim well outside the cone', () => {
    const arena = emptyArena()
    const titan = titanAt(30, 0)
    const pos = new Vector3(0, 10, 0)
    const look = aimAt(pos, napeCenter(titan)).applyAxisAngle(new Vector3(0, 1, 0), 0.18) // ~10°
    expect(findStrikeTarget(pos, look, [titan], arena)).toBe(null)
  })

  it('rejects napes beyond range and dead titans', () => {
    const arena = emptyArena()
    const far = titanAt(STRIKE_RANGE + 20, 0)
    const pos = new Vector3(0, 10, 0)
    expect(findStrikeTarget(pos, aimAt(pos, napeCenter(far)), [far], arena)).toBe(null)

    const dead = titanAt(30, 0)
    dead.hp = 0
    expect(findStrikeTarget(pos, aimAt(pos, napeCenter(dead)), [dead], arena)).toBe(null)
  })

  it('rejects a nape hidden behind a building', () => {
    const arena = emptyArena()
    arena.buildings.push({ x: 15, z: 0, w: 8, d: 8, h: 40, kind: 'tower', ridgeAxis: 'x', tint: 0.5 })
    const titan = titanAt(30, 0)
    const pos = new Vector3(0, 10, 0)
    expect(findStrikeTarget(pos, aimAt(pos, napeCenter(titan)), [titan], arena)).toBe(null)
  })

  it('picks the nape closest to the crosshair when several qualify', () => {
    const arena = emptyArena()
    const centered = titanAt(30, 0, 1)
    const offside = titanAt(30, 1.4, 2)
    const pos = new Vector3(0, 10, 0)
    const look = aimAt(pos, napeCenter(centered))
    expect(findStrikeTarget(pos, look, [offside, centered], arena)).toBe(centered.id)
  })
})

describe('stepStrike', () => {
  it('homes through a moving nape, kills on passage, and exits with momentum', () => {
    const arena = emptyArena()
    const titan = titanAt(30, 0)
    const p = createPlayer()
    p.pos.set(0, 10, 0)
    const strike = createStrike(titan, p.pos)

    let killed: TitanState | null = null
    let done = false
    for (let i = 0; i < 400 && !done; i++) {
      titan.pos.z += 0.05 // the titan keeps walking; homing must not care
      const result = stepStrike(strike, p, [titan], arena, DT)
      if (result.killed) {
        killed = result.killed
        expect(result.oneCut).toBe(true)
      }
      done = result.done
    }
    expect(killed).toBe(titan)
    expect(titan.hp).toBe(0)
    expect(done).toBe(true)
    // carried well past the nape, at exit speed, still airborne
    expect(p.pos.x).toBeGreaterThan(titan.pos.x + 5)
    expect(p.vel.length()).toBeCloseTo(STRIKE_EXIT_SPEED, 1)
    expect(p.onGround).toBe(false)
  })

  it('clips the exit run short of a building behind the titan', () => {
    const arena = emptyArena()
    arena.buildings.push({ x: 36, z: 0, w: 6, d: 30, h: 40, kind: 'tower', ridgeAxis: 'x', tint: 0.5 })
    const titan = titanAt(30, 0)
    const p = createPlayer()
    p.pos.set(0, napeCenter(titan).y, -0.9) // level, straight shot down +x
    const strike = createStrike(titan, p.pos)
    for (let i = 0; i < 400; i++) {
      if (stepStrike(strike, p, [titan], arena, DT).done) break
    }
    expect(p.pos.x).toBeLessThan(33.5) // stopped short of the tower face at x=33
  })

  it('ends without a kill when the target dies mid-dash', () => {
    const arena = emptyArena()
    const titan = titanAt(30, 0)
    const p = createPlayer()
    p.pos.set(0, 10, 0)
    const strike = createStrike(titan, p.pos)
    stepStrike(strike, p, [titan], arena, DT)
    titan.hp = 0 // someone else's spear got there first
    let sawKill = false
    let done = false
    for (let i = 0; i < 400 && !done; i++) {
      const result = stepStrike(strike, p, [titan], arena, DT)
      sawKill ||= result.killed !== null
      done = result.done
    }
    expect(sawKill).toBe(false)
    expect(done).toBe(true)
  })

  it('never tunnels below the street on a downward exit', () => {
    const arena = emptyArena()
    const titan = titanAt(12, 0, 1, 4) // short titan: the nape sits low
    const p = createPlayer()
    p.pos.set(0, 40, 0) // steep dive
    const strike = createStrike(titan, p.pos)
    let done = false
    for (let i = 0; i < 400 && !done; i++) {
      done = stepStrike(strike, p, [titan], arena, DT).done
    }
    expect(done).toBe(true)
    expect(p.pos.y).toBeGreaterThanOrEqual(1.69) // never under eye height off the street
  })
})
