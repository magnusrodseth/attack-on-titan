import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { eaveHeight, groundHeightAt, insideBuildingXZ, raycastHookTarget } from './city'
import {
  FOREST_CANOPY_Y,
  FOREST_CLEARING_RADIUS,
  FOREST_WALL_RADIUS,
  generateForest,
} from './forestgen'
import { getMap, mapsForMode } from './maps'
import { buildNavGrid, isWalkable, nearestWalkable } from './nav'

describe('generateForest', () => {
  const arena = generateForest('vitest')
  const giants = arena.buildings.filter((b) => b.kind === 'trunk')
  const branches = arena.buildings.filter((b) => b.kind === 'branch')

  it('is deterministic per seed and differs across seeds', () => {
    expect(JSON.stringify(generateForest('vitest').buildings)).toBe(
      JSON.stringify(arena.buildings),
    )
    expect(JSON.stringify(generateForest('other').buildings)).not.toBe(
      JSON.stringify(arena.buildings),
    )
  })

  it('declares the forest, an open sky, and no wall to hook', () => {
    expect(arena.forest).not.toBeNull()
    expect(arena.forest!.canopyY).toBe(FOREST_CANOPY_Y)
    expect(arena.cavern).toBeNull()
    expect(arena.wallHeight).toBe(0) // there is no wall out here, so none can be hooked
    expect(arena.wallRadius).toBe(FOREST_WALL_RADIUS)
    expect(arena.forest!.rays.length).toBeGreaterThanOrEqual(2)
  })

  it('grows giants at canon scale, round, and never crowding each other', () => {
    expect(giants.length).toBeGreaterThan(90)
    for (const g of giants) {
      expect(g.shape).toBe('cyl')
      expect(g.w).toBe(g.d)
      expect(g.h).toBeGreaterThanOrEqual(62) // the canon 80m, with a spread
      expect(g.h).toBeLessThanOrEqual(88)
      expect(g.w / 2).toBeGreaterThanOrEqual(5) // trunks are cliffs, not poles
    }
    // the swing between them has to breathe: no two giants closer than the gap
    for (let i = 0; i < giants.length; i++) {
      for (let j = i + 1; j < giants.length; j++) {
        const a = giants[i]!
        const b = giants[j]!
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(a.w / 2 + b.w / 2)
      }
    }
  })

  it('hangs standable limbs off every giant, spread up the trunk', () => {
    expect(branches.length).toBeGreaterThanOrEqual(giants.length * 2)
    for (const b of branches) {
      expect(b.y0).toBeGreaterThan(0) // an elevated one-way platform, not a fence
      expect(b.h).toBeGreaterThan(b.y0)
      expect(b.h).toBeLessThanOrEqual(FOREST_CANOPY_Y + 12)
      // a limb is a surface you can stand on: its top IS its eave (flat, no roof slope)
      expect(eaveHeight(b)).toBe(b.h)
    }
    // and they reach both the mid-story and the crown
    expect(branches.some((b) => b.h < 30)).toBe(true)
    expect(branches.some((b) => b.h > 55)).toBe(true)
  })

  it('a limb is a platform: you stand ON it, and pass under it freely', () => {
    const limb = branches.find((b) => b.y0 > 20)!
    // feet below its base: the ground is still the forest floor
    expect(groundHeightAt(arena, limb.x, limb.z, 2)).toBe(0)
    // feet at its level: it catches you
    expect(groundHeightAt(arena, limb.x, limb.z, limb.y0 + 0.2)).toBeCloseTo(limb.h)
  })

  it('hooks bite into bark: a giant catches the grapple on its flank', () => {
    const giant = giants[0]!
    const from = new Vector3(giant.x - giant.w / 2 - 40, 20, giant.z)
    const hit = raycastHookTarget(arena, from, new Vector3(1, 0, 0), 90)
    expect(hit).not.toBeNull()
    expect(hit!.x).toBeCloseTo(giant.x - giant.w / 2, 4) // the anchor sits on the bark
  })

  it('keeps the clearing open and grows the mid-story that sells the scale', () => {
    expect(insideBuildingXZ(arena, 0, 0, 6)).toBe(false)
    const saplings = arena.buildings.filter((b) => b.kind === 'sapling')
    expect(saplings.length).toBeGreaterThan(300)
    for (const s of saplings) {
      expect(s.h).toBeLessThan(23) // an ordinary tree: underbrush beside a giant
      expect(Math.hypot(s.x, s.z)).toBeGreaterThan(FOREST_CLEARING_RADIUS)
    }
    expect(arena.buildings.some((b) => b.kind === 'cabin')).toBe(true)
  })

  it('stations stand on open floor', () => {
    expect(arena.stations.length).toBeGreaterThanOrEqual(2)
    for (const s of arena.stations) expect(insideBuildingXZ(arena, s.x, s.z, 2)).toBe(false)
  })

  it('the forest floor stays walkable and connected', () => {
    const nav = buildNavGrid(arena)
    expect(isWalkable(nav, 0, 6)).toBe(true)
    let open = 0
    for (const cell of nav.walkable) open += cell
    expect(open / nav.walkable.length).toBeGreaterThan(0.3) // trunks thin it, not seal it
    const [fx, fz] = nearestWalkable(nav, 180, 180)
    expect(Math.hypot(fx - 180, fz - 180)).toBeLessThan(30)
  })

  it('joins the map registry and offers itself to every mode', () => {
    expect(getMap('forest').id).toBe('forest')
    expect(mapsForMode('race').map((m) => m.id)).toEqual(['district', 'underground', 'forest'])
    for (const mode of ['waves', 'bossrush', 'hunt']) {
      expect(mapsForMode(mode).map((m) => m.id)).toContain('forest')
    }
  })
})
