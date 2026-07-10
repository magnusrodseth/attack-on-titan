import { describe, expect, it } from 'vitest'
import type { Arena } from './city'
import { emptyArena } from './city'
import { generateCity } from './citygen'
import { buildNavGrid, findPath, isWalkable, nearestWalkable } from './nav'
import { createRng, hashSeed } from './rng'

function arenaWith(buildings: Partial<Arena['buildings'][0]>[]): Arena {
  const arena = emptyArena()
  for (const b of buildings) {
    arena.buildings.push({
      x: 0,
      z: 0,
      w: 10,
      d: 10,
      y0: 0,
      h: 15,
      kind: 'house',
      ridgeAxis: 'x',
      tint: 0.5,
      ...b,
    })
  }
  return arena
}

describe('buildNavGrid', () => {
  it('marks building interiors (with clearance) unwalkable and open streets walkable', () => {
    const grid = buildNavGrid(arenaWith([{ x: 20, z: 0, w: 12, d: 12 }]))
    expect(isWalkable(grid, 20, 0)).toBe(false) // dead centre of the house
    expect(isWalkable(grid, 20 + 6 + 1, 0)).toBe(false) // inside the clearance ring
    expect(isWalkable(grid, 0, 0)).toBe(true) // open plaza
    expect(isWalkable(grid, 20, 40)).toBe(true) // open street
  })

  it('marks everything beyond the wall unwalkable', () => {
    const arena = emptyArena()
    const grid = buildNavGrid(arena)
    expect(isWalkable(grid, 0, 0)).toBe(true)
    expect(isWalkable(grid, arena.wallRadius - 1, 0)).toBe(false)
    expect(isWalkable(grid, 0, -arena.wallRadius - 10)).toBe(false)
  })

  it('lets titans walk beneath high spans but not beneath low bridge decks', () => {
    const grid = buildNavGrid(
      arenaWith([
        { x: 30, z: 0, w: 10, d: 12, y0: 36, h: 42, kind: 'deck' }, // the gate span
        { x: -30, z: 0, w: 17, d: 5, y0: 3.3, h: 4.6, kind: 'deck' }, // a canal bridge
      ]),
    )
    expect(isWalkable(grid, 30, 0)).toBe(true) // room for a 15m titan under 36m
    expect(isWalkable(grid, -30, 0)).toBe(false) // a 4m deck is a wall to a titan
  })
})

describe('nearestWalkable', () => {
  it('snaps a point inside a building out onto walkable ground', () => {
    const grid = buildNavGrid(arenaWith([{ x: 0, z: 0, w: 20, d: 20 }]))
    const [x, z] = nearestWalkable(grid, 0, 0)
    expect(isWalkable(grid, x, z)).toBe(true)
    expect(Math.hypot(x, z)).toBeLessThan(25) // snapped nearby, not across the map
  })

  it('returns the point itself when already walkable', () => {
    const grid = buildNavGrid(emptyArena())
    const [x, z] = nearestWalkable(grid, 30, 30)
    expect(Math.hypot(x - 30, z - 30)).toBeLessThan(3)
  })
})

describe('findPath', () => {
  it('routes around a building instead of through it', () => {
    const arena = arenaWith([{ x: 20, z: 0, w: 10, d: 30 }]) // wall between start and goal
    const grid = buildNavGrid(arena)
    const path = findPath(grid, 0, 0, 40, 0)
    expect(path).not.toBeNull()
    for (const [x, z] of path!) {
      expect(isWalkable(grid, x, z)).toBe(true)
    }
    // the detour must clear the building's z-extent on one side
    const maxAbsZ = Math.max(...path!.map(([, z]) => Math.abs(z)))
    expect(maxAbsZ).toBeGreaterThan(15)
  })

  it('is near-direct in the open after smoothing', () => {
    const grid = buildNavGrid(emptyArena())
    const path = findPath(grid, -30, -30, 30, 30)
    expect(path).not.toBeNull()
    expect(path!.length).toBeLessThanOrEqual(3) // line of sight collapses the waypoints
  })

  it('finds street routes through the real generated city', () => {
    const arena = generateCity(createRng(hashSeed('nav-city:city')))
    const grid = buildNavGrid(arena)
    const path = findPath(grid, 0, 0, 100, 60)
    expect(path).not.toBeNull()
    for (const [x, z] of path!) {
      expect(isWalkable(grid, x, z)).toBe(true)
    }
  })

  it('is deterministic for identical inputs', () => {
    const arena = generateCity(createRng(hashSeed('nav-det:city')))
    const grid = buildNavGrid(arena)
    const a = findPath(grid, -60, 20, 80, -40)
    const b = findPath(grid, -60, 20, 80, -40)
    expect(a).toEqual(b)
  })
})
