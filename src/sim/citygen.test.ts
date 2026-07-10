import { describe, expect, it } from 'vitest'
import type { Building } from './city'
import { eaveHeight } from './city'
import {
  BOULEVARD_HALF,
  CANAL_HALF_WIDTH,
  CANAL_X,
  generateCity,
} from './citygen'
import { createRng } from './rng'

const arena = generateCity(createRng(5))
const byKind = (kind: Building['kind']): Building[] =>
  arena.buildings.filter((b) => b.kind === kind)

describe('generateCity v2', () => {
  it('is deterministic for the same seed', () => {
    const a = generateCity(createRng(9))
    const b = generateCity(createRng(9))
    expect(a.buildings.length).toBe(b.buildings.length)
    expect(a.buildings[0]).toEqual(b.buildings[0])
    expect(a.buildings[a.buildings.length - 1]).toEqual(b.buildings[b.buildings.length - 1])
  })

  it('keeps every building inside the wall ring', () => {
    for (const bld of arena.buildings) {
      const cornerDist = Math.hypot(Math.abs(bld.x) + bld.w / 2, Math.abs(bld.z) + bld.d / 2)
      expect(cornerDist).toBeLessThan(arena.wallRadius)
    }
  })

  it('leaves a clear plaza around the resupply station at the center', () => {
    for (const bld of arena.buildings) {
      const nearestX = Math.max(Math.abs(bld.x) - bld.w / 2, 0)
      const nearestZ = Math.max(Math.abs(bld.z) - bld.d / 2, 0)
      expect(Math.hypot(nearestX, nearestZ)).toBeGreaterThan(arena.plazaRadius - 1e-9)
    }
  })

  it('keeps both boulevards clear at ground level', () => {
    for (const b of arena.buildings) {
      if (b.y0 > 2) continue // elevated spans may cross overhead
      if (b.kind === 'pier' || b.kind === 'deck') continue // canal crossings
      if (b.kind === 'bastion' || b.kind === 'flagpole') continue // vista landmarks + their flags
      const inX = Math.abs(b.z) - b.d / 2 < BOULEVARD_HALF - 1.5
      const inZ = Math.abs(b.x) - b.w / 2 < BOULEVARD_HALF - 1.5
      expect(inX, `${b.kind} at ${b.x},${b.z} blocks the east-west avenue`).toBe(false)
      expect(inZ, `${b.kind} at ${b.x},${b.z} blocks the north-south avenue`).toBe(false)
    }
  })

  it('carves the canal clear of everything except bridge parts', () => {
    expect(arena.canal).not.toBeNull()
    for (const b of arena.buildings) {
      if (b.kind === 'pier' || b.kind === 'deck') continue
      expect(Math.abs(b.x - CANAL_X)).toBeGreaterThan(CANAL_HALF_WIDTH + b.w / 2)
    }
  })

  it('spans the canal with swing-under bridges', () => {
    const decks = byKind('deck').filter((b) => Math.abs(b.x - CANAL_X) < 1)
    expect(decks.length).toBeGreaterThanOrEqual(4)
    for (const deck of decks) {
      expect(deck.y0 - arena.canal!.waterY).toBeGreaterThanOrEqual(3) // room to swing under
      expect(deck.w).toBeGreaterThan(CANAL_HALF_WIDTH * 2) // reaches both banks
    }
  })

  it('climbs each bridge end by five snug, evenly rising steps', () => {
    const decks = byKind('deck').filter((b) => Math.abs(b.x - CANAL_X) < 1)
    for (const deck of decks) {
      for (const side of [-1, 1]) {
        const steps = byKind('pier')
          .filter((p) => p.z === deck.z && p.y0 === 0 && Math.sign(p.x - CANAL_X) === side)
          .sort((a, b) => a.h - b.h)
        expect(steps).toHaveLength(5)
        // top step lands flush against the deck edge, one riser below the walkway
        const top = steps[steps.length - 1]!
        expect(Math.abs(Math.abs(top.x - CANAL_X) - top.w / 2 - deck.w / 2)).toBeLessThan(1e-6)
        let prev = 0
        let prevOuter = Infinity
        for (const step of steps) {
          const rise = step.h - prev
          expect(rise).toBeGreaterThan(0.5)
          expect(rise).toBeLessThan(1.1) // an easy hop, never a wall
          prev = step.h
          // snug: each higher step sits exactly one tread depth closer to the canal
          const outer = Math.abs(step.x - CANAL_X) + step.w / 2
          if (prevOuter !== Infinity) expect(prevOuter - outer).toBeCloseTo(step.w, 6)
          prevOuter = outer
        }
        expect(deck.h - prev).toBeGreaterThan(0.5) // the last riser onto the walkway
        expect(deck.h - prev).toBeLessThan(1.1)
      }
    }
  })
})

describe('generateCity — district variety (procgen audit 2026-07-10)', () => {
  it('is dense row-houses with height districts, not a flat skyline', () => {
    const houses = byKind('house')
    expect(houses.length).toBeGreaterThan(350)
    const heights = houses.map((b) => b.h).sort((a, b) => a - b)
    const median = heights[Math.floor(heights.length / 2)]!
    expect(median).toBeGreaterThanOrEqual(14)
    expect(median).toBeLessThanOrEqual(23)
    // districts: the spread between low and high quarters is real, not jitter
    const p10 = heights[Math.floor(heights.length * 0.1)]!
    const p90 = heights[Math.floor(heights.length * 0.9)]!
    expect(p90 - p10).toBeGreaterThan(6)
  })

  it('fills the dead band between rooftops and towers with warehouses', () => {
    const warehouses = byKind('warehouse')
    expect(warehouses.length).toBeGreaterThanOrEqual(5)
    for (const w of warehouses) {
      expect(w.h).toBeGreaterThanOrEqual(24)
      expect(w.h).toBeLessThanOrEqual(32)
    }
  })

  it('scatters church towers as high anchor points, each flying a flagpole', () => {
    const towers = byKind('tower')
    expect(towers.length).toBeGreaterThanOrEqual(10)
    for (const t of towers) expect(t.h).toBeGreaterThanOrEqual(32)
    expect(byKind('flagpole').length).toBeGreaterThanOrEqual(towers.length)
  })

  it('raises exactly one cathedral spire above every tower', () => {
    const cathedrals = byKind('cathedral')
    expect(cathedrals.length).toBe(1)
    const towers = byKind('tower')
    expect(cathedrals[0]!.h).toBeGreaterThan(Math.max(...towers.map((t) => t.h)))
  })

  it('gives a healthy share of houses a chimney perch above the ridge', () => {
    const houses = byKind('house')
    const chimneys = byKind('chimney')
    expect(chimneys.length).toBeGreaterThan(houses.length * 0.25)
    expect(chimneys.length).toBeLessThan(houses.length * 0.6)
    for (const c of chimneys) expect(c.h).toBeGreaterThan(12) // pokes above its roof
  })

  it('furnishes market squares and the plaza with wells, stalls and carts', () => {
    expect(byKind('well').length).toBeGreaterThanOrEqual(3)
    expect(byKind('stall').length).toBeGreaterThanOrEqual(6)
    expect(byKind('cart').length).toBeGreaterThanOrEqual(2)
  })

  it('pins the compass: a sealed gatehouse east, bastions at the other cardinals', () => {
    const gatehouses = byKind('gatehouse')
    expect(gatehouses.length).toBe(2)
    for (const g of gatehouses) {
      expect(g.x).toBeGreaterThan(arena.wallRadius - 20)
      expect(g.h).toBeGreaterThan(arena.wallHeight)
    }
    const bastions = byKind('bastion')
    expect(bastions.length).toBe(3)
    // the gate span is elevated high enough for the tallest titan to walk under
    const span = byKind('deck').find((b) => b.x > arena.wallRadius - 20)!
    expect(span.y0).toBeGreaterThanOrEqual(28)
    expect(eaveHeight(span)).toBe(span.h)
  })

  it('has an AoT-scale 50m wall around a bigger district', () => {
    expect(arena.wallHeight).toBe(50)
    expect(arena.wallRadius).toBeGreaterThanOrEqual(240)
  })
})
