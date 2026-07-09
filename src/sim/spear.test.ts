import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { emptyArena } from './city'
import { buildNavGrid } from './nav'
import { createPlayer } from './player'
import type { SpearState } from './spear'
import {
  BLAST_DAMAGE,
  FIRE_COOLDOWN,
  PICKUPS_PER_WAVE,
  SPEAR_FUSE,
  SPEAR_RANGE,
  SPEAR_SPEED,
  collectPickups,
  fireSpear,
  spawnPickups,
  stepSpears,
} from './spear'
import { createTitan, napeCenter } from './titan'

const DT = 1 / 120

function stuckSpear(pos: Vector3, titanId: number | null = null, fuse = 0.01): SpearState {
  return {
    id: 1,
    phase: 'stuck',
    pos: pos.clone(),
    vel: new Vector3(),
    traveled: 0,
    titanId,
    local: new Vector3(),
    fuse,
  }
}

function makeTitan(id = 1, x = 0, z = 0) {
  const t = createTitan({ id, kind: 'normal', height: 15, x, z })
  t.facing = 0
  return t
}

describe('fireSpear', () => {
  it('launches along the look direction at spear speed and spends one spear', () => {
    const p = createPlayer()
    const spear = fireSpear(p, 1, new Vector3(0, 0, -1))
    expect(spear).not.toBeNull()
    expect(p.spears).toBe(p.config.spearCapacity - 1)
    expect(p.fireTimer).toBe(FIRE_COOLDOWN)
    expect(spear!.vel.length()).toBeCloseTo(SPEAR_SPEED)
    expect(spear!.vel.z).toBeLessThan(0)
  })

  it('refuses to fire while dry or cooling down', () => {
    const p = createPlayer()
    p.spears = 0
    expect(fireSpear(p, 1, new Vector3(0, 0, -1))).toBeNull()

    const p2 = createPlayer()
    expect(fireSpear(p2, 1, new Vector3(0, 0, -1))).not.toBeNull()
    expect(fireSpear(p2, 2, new Vector3(0, 0, -1))).toBeNull() // cooldown blocks the double-tap
    expect(p2.spears).toBe(p2.config.spearCapacity - 1)
  })
})

describe('spear flight', () => {
  it('flies straight and sticks into a titan, riding it afterwards', () => {
    const arena = emptyArena()
    const p = createPlayer() // eye at (0, 1.7, 26)
    const titan = makeTitan(7, 0, 0)
    const spear = fireSpear(p, 1, new Vector3(0, 0, -1))!
    const spears = [spear]
    for (let i = 0; i < 200 && spear.phase === 'flying'; i++) {
      stepSpears(spears, [titan], p.pos, arena, DT)
    }
    expect(spear.phase).toBe('stuck')
    expect(spear.titanId).toBe(7)

    const posBefore = spear.pos.clone()
    titan.pos.x += 5
    stepSpears(spears, [titan], p.pos, arena, DT)
    expect(spear.pos.x).toBeCloseTo(posBefore.x + 5, 5)
  })

  it('sticks into the ground when fired downward', () => {
    const arena = emptyArena()
    const p = createPlayer()
    p.pos.set(0, 30, 0)
    const spear = fireSpear(p, 1, new Vector3(0, -1, 0))!
    const spears = [spear]
    for (let i = 0; i < 200 && spear.phase === 'flying'; i++) {
      stepSpears(spears, [], p.pos, arena, DT)
    }
    expect(spear.phase).toBe('stuck')
    expect(spear.titanId).toBeNull()
    expect(spear.pos.y).toBe(0)
  })

  it('fizzles and despawns past max range without detonating', () => {
    const arena = emptyArena()
    const p = createPlayer()
    p.pos.set(0, 60, 0) // above the wall so nothing blocks a long horizontal flight
    const spear = fireSpear(p, 1, new Vector3(1, 0, 0))!
    const spears = [spear]
    let fizzled: number[] = []
    let blasts = 0
    for (let i = 0; i < 400 && spears.length > 0; i++) {
      const result = stepSpears(spears, [], p.pos, arena, DT)
      fizzled = fizzled.concat(result.fizzled)
      blasts += result.blasts.length
    }
    expect(fizzled).toEqual([1])
    expect(blasts).toBe(0)
    expect(spear.traveled).toBeGreaterThanOrEqual(SPEAR_RANGE)
  })
})

describe('detonation', () => {
  it('kills any titan whose nape is inside the blast radius, at zero player speed', () => {
    const arena = emptyArena()
    const titan = makeTitan()
    const spears = [stuckSpear(napeCenter(titan))]
    const result = stepSpears(spears, [titan], new Vector3(0, 0, 1000), arena, DT * 2)
    expect(result.blasts).toHaveLength(1)
    expect(result.blasts[0]!.kills).toEqual([{ titanId: 1, kind: 'normal' }])
    expect(titan.hp).toBe(0)
    expect(spears).toHaveLength(0)
  })

  it('deals heavy damage and staggers on a body hit away from the nape', () => {
    const arena = emptyArena()
    const titan = makeTitan()
    const spears = [stuckSpear(new Vector3(0, 1, 0), titan.id)] // ankle height, nape 11m up
    const result = stepSpears(spears, [titan], new Vector3(0, 0, 1000), arena, DT * 2)
    expect(result.blasts[0]!.kills).toHaveLength(0)
    expect(result.blasts[0]!.staggered).toEqual([1])
    expect(titan.hp).toBe(titan.maxHp - BLAST_DAMAGE)
    expect(titan.state).toBe('staggered')
  })

  it('a second body blast finishes the titan and reports the kill', () => {
    const arena = emptyArena()
    const titan = makeTitan()
    titan.hp = BLAST_DAMAGE // one more body hit is lethal
    const spears = [stuckSpear(new Vector3(0, 1, 0), titan.id)]
    const result = stepSpears(spears, [titan], new Vector3(0, 0, 1000), arena, DT * 2)
    expect(result.blasts[0]!.kills).toEqual([{ titanId: 1, kind: 'normal' }])
    expect(titan.hp).toBe(0)
  })

  it('damages a crippled titan without standing it back up', () => {
    const arena = emptyArena()
    const titan = makeTitan()
    titan.ankles = [true, true]
    titan.state = 'crippled'
    titan.crippleTimer = 30
    const spears = [stuckSpear(new Vector3(0, 1, 0), titan.id)]
    // a kneeling titan's nape drops to 0.6 * height = 9m, still out of a 5m ankle blast
    stepSpears(spears, [titan], new Vector3(0, 0, 1000), arena, DT * 2)
    expect(titan.hp).toBe(titan.maxHp - BLAST_DAMAGE)
    expect(titan.state).toBe('crippled')
  })

  it('does not freeze a leaping titan in mid-air', () => {
    const arena = emptyArena()
    const titan = makeTitan()
    titan.state = 'leap'
    titan.pos.y = 6
    const spears = [stuckSpear(new Vector3(0, 7, 0), titan.id)]
    stepSpears(spears, [titan], new Vector3(0, 0, 1000), arena, DT * 2)
    expect(titan.hp).toBe(titan.maxHp - BLAST_DAMAGE)
    expect(titan.state).toBe('leap')
  })

  it('catches a whole cluster in one blast', () => {
    const arena = emptyArena()
    const near = makeTitan(1, 0, 0)
    const alsoNear = makeTitan(2, 3, 0)
    const far = makeTitan(3, 40, 0)
    const spears = [stuckSpear(new Vector3(0, 1, 0))]
    const result = stepSpears(spears, [near, alsoNear, far], new Vector3(0, 0, 1000), arena, DT * 2)
    expect(result.blasts[0]!.staggered.sort()).toEqual([1, 2])
    expect(far.hp).toBe(far.maxHp)
  })

  it('flags the player inside the blast radius', () => {
    const arena = emptyArena()
    const spears = [stuckSpear(new Vector3(0, 1, 0))]
    const result = stepSpears(spears, [], new Vector3(3, 1, 0), arena, DT * 2)
    expect(result.blasts[0]!.playerInBlast).toBe(true)

    const spears2 = [stuckSpear(new Vector3(0, 1, 0))]
    const result2 = stepSpears(spears2, [], new Vector3(10, 1, 0), arena, DT * 2)
    expect(result2.blasts[0]!.playerInBlast).toBe(false)
  })

  it('the fuse survives partial ticks: no blast before it runs out', () => {
    const arena = emptyArena()
    const spears = [stuckSpear(new Vector3(0, 1, 0), null, SPEAR_FUSE)]
    let elapsed = 0
    let blasted = false
    while (elapsed < SPEAR_FUSE - DT) {
      const result = stepSpears(spears, [], new Vector3(0, 0, 1000), arena, DT)
      blasted = blasted || result.blasts.length > 0
      elapsed += DT
    }
    expect(blasted).toBe(false)
    const result = stepSpears(spears, [], new Vector3(0, 0, 1000), arena, DT * 2)
    expect(result.blasts).toHaveLength(1)
  })
})

describe('spear pickups', () => {
  const arena = emptyArena()
  const nav = buildNavGrid(arena)

  it('spawns a deterministic set per seed and wave', () => {
    const a = spawnPickups('trost', 3, nav)
    const b = spawnPickups('trost', 3, nav)
    const other = spawnPickups('trost', 4, nav)
    expect(a).toHaveLength(PICKUPS_PER_WAVE)
    expect(a).toEqual(b)
    expect(a.map((pk) => [pk.x, pk.z])).not.toEqual(other.map((pk) => [pk.x, pk.z]))
  })

  it('collects on fly-by, one spear per rack, only below capacity', () => {
    const p = createPlayer()
    p.spears = 0
    const pickups = [
      { id: 1, x: 0, z: 0, taken: false },
      { id: 2, x: 1, z: 1, taken: false },
      { id: 3, x: 50, z: 50, taken: false },
    ]
    p.pos.set(0, 1.7, 0)
    const collected = collectPickups(pickups, p)
    expect(collected.sort()).toEqual([1, 2])
    expect(p.spears).toBe(2)
    expect(pickups[2]!.taken).toBe(false)

    // at capacity: the third rack stays for later
    p.pos.set(50, 1.7, 50)
    expect(collectPickups(pickups, p)).toEqual([])
    expect(pickups[2]!.taken).toBe(false)
  })

  it('ignores racks far below a soldier flying overhead', () => {
    const p = createPlayer()
    p.spears = 0
    const pickups = [{ id: 1, x: 0, z: 0, taken: false }]
    p.pos.set(0, 20, 0)
    expect(collectPickups(pickups, p)).toEqual([])
  })
})
