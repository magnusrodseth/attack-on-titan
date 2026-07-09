import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import type { Arena } from './city'
import {
  clampToWall,
  emptyArena,
  generateCity,
  groundHeightAt,
  raycastHookTarget,
  resolveBuildingCollision,
} from './city'
import { createRng } from './rng'

function singleBuildingArena(): Arena {
  const arena = emptyArena()
  arena.buildings.push({ x: 0, z: 0, w: 10, d: 10, h: 20, kind: 'house', ridgeAxis: 'x', tint: 0.5 })
  return arena
}

describe('generateCity', () => {
  it('is deterministic for the same seed', () => {
    const a = generateCity(createRng(9))
    const b = generateCity(createRng(9))
    expect(a.buildings.length).toBe(b.buildings.length)
    expect(a.buildings[0]).toEqual(b.buildings[0])
  })

  it('keeps every building inside the wall ring', () => {
    const arena = generateCity(createRng(3))
    for (const bld of arena.buildings) {
      const cornerDist = Math.hypot(Math.abs(bld.x) + bld.w / 2, Math.abs(bld.z) + bld.d / 2)
      expect(cornerDist).toBeLessThan(arena.wallRadius)
    }
  })

  it('leaves a clear plaza around the resupply station at the center', () => {
    const arena = generateCity(createRng(3))
    for (const bld of arena.buildings) {
      const nearestX = Math.max(Math.abs(bld.x) - bld.w / 2, 0)
      const nearestZ = Math.max(Math.abs(bld.z) - bld.d / 2, 0)
      expect(Math.hypot(nearestX, nearestZ)).toBeGreaterThan(arena.plazaRadius - 1e-9)
    }
  })
})

describe('generateCity — AoT district look (user reference images)', () => {
  it('is mostly dense low row-houses at 2-4 story scale', () => {
    const arena = generateCity(createRng(5))
    const houses = arena.buildings.filter((b) => b.kind === 'house')
    expect(houses.length).toBeGreaterThan(150) // dense district
    const heights = houses.map((b) => b.h).sort((a, b) => a - b)
    const median = heights[Math.floor(heights.length / 2)]!
    expect(median).toBeGreaterThanOrEqual(9)
    expect(median).toBeLessThanOrEqual(16)
  })

  it('scatters tall church towers as high anchor points', () => {
    const arena = generateCity(createRng(5))
    const towers = arena.buildings.filter((b) => b.kind === 'tower')
    expect(towers.length).toBeGreaterThanOrEqual(3)
    for (const t of towers) expect(t.h).toBeGreaterThanOrEqual(25)
  })

  it('has an AoT-scale 50m wall', () => {
    const arena = generateCity(createRng(5))
    expect(arena.wallHeight).toBe(50)
  })
})

describe('groundHeightAt', () => {
  it('returns the roof height inside a building footprint and 0 outside', () => {
    const arena = singleBuildingArena()
    expect(groundHeightAt(arena, 0, 0)).toBe(20)
    expect(groundHeightAt(arena, 100, 100)).toBe(0)
  })
})

describe('resolveBuildingCollision', () => {
  it('pushes the player out of a wall face and zeroes the velocity into it', () => {
    const arena = singleBuildingArena()
    const pos = new Vector3(4.5, 5, 0) // inside, closest to +x face at x=5
    const vel = new Vector3(-3, 0, 1)
    resolveBuildingCollision(arena, pos, vel, 0.5)
    expect(pos.x).toBeCloseTo(5.5)
    expect(vel.x).toBe(0)
    expect(vel.z).toBe(1)
  })

  it('ignores a player above the roof', () => {
    const arena = singleBuildingArena()
    const pos = new Vector3(0, 25, 0)
    const vel = new Vector3(1, -1, 0)
    resolveBuildingCollision(arena, pos, vel, 0.5)
    expect(pos.toArray()).toEqual([0, 25, 0])
  })
})

describe('clampToWall', () => {
  it('keeps the player inside the wall ring and kills outward radial velocity', () => {
    const arena = emptyArena()
    const pos = new Vector3(arena.wallRadius + 10, 5, 0)
    const vel = new Vector3(20, 0, 4)
    clampToWall(arena, pos, vel, 1)
    expect(Math.hypot(pos.x, pos.z)).toBeCloseTo(arena.wallRadius - 1)
    expect(vel.x).toBeLessThanOrEqual(0)
    expect(vel.z).toBeCloseTo(4)
  })
})

describe('raycastHookTarget', () => {
  it('hits a building face along the ray', () => {
    const arena = singleBuildingArena()
    const hit = raycastHookTarget(arena, new Vector3(20, 5, 0), new Vector3(-1, 0, 0), 100)
    expect(hit).not.toBeNull()
    expect(hit!.x).toBeCloseTo(5)
    expect(hit!.y).toBeCloseTo(5)
  })

  it('returns null beyond max range', () => {
    const arena = singleBuildingArena()
    const hit = raycastHookTarget(arena, new Vector3(20, 5, 0), new Vector3(-1, 0, 0), 10)
    expect(hit).toBeNull()
  })

  it('hits the wall ring for long horizontal shots', () => {
    const arena = emptyArena()
    const hit = raycastHookTarget(arena, new Vector3(0, 5, 0), new Vector3(1, 0, 0), 500)
    expect(hit).not.toBeNull()
    expect(Math.hypot(hit!.x, hit!.z)).toBeCloseTo(arena.wallRadius)
  })

  it('returns null for a shot into the sky', () => {
    const arena = emptyArena()
    const hit = raycastHookTarget(arena, new Vector3(0, 5, 0), new Vector3(0, 1, 0), 500)
    expect(hit).toBeNull()
  })
})
