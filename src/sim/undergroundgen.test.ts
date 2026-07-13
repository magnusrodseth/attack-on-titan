import { describe, expect, it } from 'vitest'
import { ceilingHeightAt, insideBuildingXZ } from './city'
import { getMap, mapScopedSeed, mapsForMode } from './maps'
import { buildNavGrid, isWalkable, nearestWalkable } from './nav'
import {
  UG_CEILING_CENTER_Y,
  UG_CEILING_EDGE_Y,
  UG_WALL_RADIUS,
  generateUnderground,
} from './undergroundgen'

describe('generateUnderground', () => {
  const arena = generateUnderground('vitest')

  it('is deterministic per seed and differs across seeds', () => {
    expect(JSON.stringify(generateUnderground('vitest').buildings)).toBe(
      JSON.stringify(arena.buildings),
    )
    expect(JSON.stringify(generateUnderground('other').buildings)).not.toBe(
      JSON.stringify(arena.buildings),
    )
  })

  it('declares the cavern and a wall that rises to meet the dome edge', () => {
    expect(arena.cavern).not.toBeNull()
    expect(arena.cavern!.centerY).toBe(UG_CEILING_CENTER_Y)
    expect(arena.wallHeight).toBe(UG_CEILING_EDGE_Y)
    expect(arena.wallRadius).toBe(UG_WALL_RADIUS)
    expect(arena.cavern!.shafts.length).toBeGreaterThanOrEqual(2)
  })

  it('keeps every roof under the rock and pillars exactly on it', () => {
    for (const b of arena.buildings) {
      const ceiling = ceilingHeightAt(arena, b.x, b.z)
      if (b.kind === 'pillar') {
        expect(b.shape).toBe('cyl')
        expect(b.h).toBeCloseTo(ceiling, 6)
      } else if (b.kind === 'stalactite') {
        expect(b.shape).toBe('cyl')
        expect(b.h).toBeCloseTo(ceiling, 6)
        expect(b.y0).toBeGreaterThanOrEqual(18)
      } else {
        expect(b.h).toBeLessThanOrEqual(ceiling - 2)
      }
    }
  })

  it('grows a real cavern: pillars, towers and a dense lamplit bowl', () => {
    const kinds = new Map<string, number>()
    for (const b of arena.buildings) kinds.set(b.kind, (kinds.get(b.kind) ?? 0) + 1)
    expect(kinds.get('pillar')!).toBeGreaterThanOrEqual(8)
    expect(kinds.get('stalactite') ?? 0).toBeGreaterThanOrEqual(4)
    expect(kinds.get('tower')).toBe(9)
    expect(kinds.get('house')!).toBeGreaterThan(300)
    expect(kinds.get('chimney')!).toBeGreaterThan(60)
  })

  it('keeps the plaza spawn open and every cylinder round (w === d)', () => {
    expect(insideBuildingXZ(arena, 0, 8)).toBe(false)
    for (const b of arena.buildings) {
      if (b.shape === 'cyl') expect(b.w).toBe(b.d)
    }
  })

  it('stations sit on open ground', () => {
    expect(arena.stations.length).toBeGreaterThanOrEqual(2)
    for (const s of arena.stations) {
      expect(insideBuildingXZ(arena, s.x, s.z, 2)).toBe(false)
    }
  })

  it('the street net stays walkable and connected from the plaza', () => {
    const nav = buildNavGrid(arena)
    expect(isWalkable(nav, 0, 8)).toBe(true)
    let open = 0
    for (const cell of nav.walkable) open += cell
    // pruneUnreachable keeps only the plaza's component: a healthy share must survive
    expect(open / nav.walkable.length).toBeGreaterThan(0.2)
    // a far corner of the bowl routes back to the plaza street net
    const [fx, fz] = nearestWalkable(nav, 150, 150)
    expect(Math.hypot(fx - 150, fz - 150)).toBeLessThan(30)
  })
})

describe('map registry', () => {
  it('falls back to the district and knows which maps host which modes', () => {
    expect(getMap('underground').id).toBe('underground')
    expect(getMap('nope').id).toBe('district')
    expect(getMap(null).id).toBe('district')
    expect(mapsForMode('race').map((m) => m.id)).toEqual(['district', 'underground'])
    expect(mapsForMode('waves').map((m) => m.id)).toEqual(['district'])
  })

  it('scopes trial keys per map, leaving the district scope untouched', () => {
    expect(mapScopedSeed('district', 'wall-2026-7-13')).toBe('wall-2026-7-13')
    expect(mapScopedSeed('underground', 'wall-2026-7-13')).toBe('underground:wall-2026-7-13')
  })

  it('pins the underground clock to permanent night', () => {
    expect(getMap('underground').clockFraction).toBe(0)
    expect(getMap('district').clockFraction).toBeNull()
  })
})
