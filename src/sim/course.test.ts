import { describe, expect, it } from 'vitest'
import { ceilingHeightAt } from './city'
import { generateCity } from './citygen'
import { generateUnderground } from './undergroundgen'
import {
  COURSE_WALL_MARGIN,
  GATE_TIERS,
  MAX_GATES,
  MAX_GATE_SPACING,
  MIN_GATES,
  MIN_GATE_SPACING,
  generateCourse,
} from './course'
import { buildNavGrid, findPath, isWalkable } from './nav'
import { createRng, hashSeed } from './rng'

// A spread of real cities: course invariants must hold on whatever the seed builds.
const SEEDS = ['trost', 'shiganshina', 'wall-rose', 'aurora', 'levi', 'petra', 'hange', 'erwin']

function setup(seed: string) {
  const arena = generateCity(createRng(hashSeed(`${seed}:city`)))
  const nav = buildNavGrid(arena)
  return { arena, nav, course: generateCourse(seed, arena, nav) }
}

describe('generateCourse', () => {
  it('yields the identical course for the same seed', () => {
    const a = setup('trost')
    const b = setup('trost')
    expect(b.course).toEqual(a.course)
  })

  it('yields a different course for a different seed', () => {
    const a = setup('trost')
    const b = setup('shiganshina')
    expect(b.course.gates).not.toEqual(a.course.gates)
  })

  it('lays a start plus a bounded count of ordered gates', () => {
    for (const seed of SEEDS) {
      const { course } = setup(seed)
      expect(course.gates.length).toBeGreaterThanOrEqual(MIN_GATES)
      expect(course.gates.length).toBeLessThanOrEqual(MAX_GATES)
    }
  })

  it('keeps every consecutive spacing within bounds, start to first gate included', () => {
    for (const seed of SEEDS) {
      const { course } = setup(seed)
      let prev = { x: course.start.x, z: course.start.z }
      for (const gate of course.gates) {
        const d = Math.hypot(gate.x - prev.x, gate.z - prev.z)
        expect(d).toBeGreaterThanOrEqual(MIN_GATE_SPACING)
        expect(d).toBeLessThanOrEqual(MAX_GATE_SPACING)
        prev = gate
      }
    }
  })

  it('lands the start and every gate on walkable streets inside the wall', () => {
    for (const seed of SEEDS) {
      const { arena, nav, course } = setup(seed)
      expect(isWalkable(nav, course.start.x, course.start.z)).toBe(true)
      for (const gate of course.gates) {
        expect(isWalkable(nav, gate.x, gate.z)).toBe(true)
        expect(Math.hypot(gate.x, gate.z)).toBeLessThanOrEqual(arena.wallRadius - COURSE_WALL_MARGIN)
      }
    }
  })

  it('street-connects every consecutive pair of gates', () => {
    const { nav, course } = setup('trost')
    let prev = { x: course.start.x, z: course.start.z }
    for (const gate of course.gates) {
      expect(findPath(nav, prev.x, prev.z, gate.x, gate.z)).not.toBeNull()
      prev = gate
    }
  })

  it('mixes all three height tiers; canyon and rooftop ride the local skyline', () => {
    for (const seed of SEEDS) {
      const { arena, course } = setup(seed)
      const seen = new Set<string>()
      for (const gate of course.gates) {
        const band = GATE_TIERS[gate.tier]
        expect(gate.y).toBeGreaterThanOrEqual(band.minY)
        if (gate.tier === 'street') expect(gate.y).toBeLessThanOrEqual(band.maxY)
        // skyline-derived tiers stay well under the towers and the wall
        expect(gate.y).toBeLessThanOrEqual(arena.wallHeight)
        expect(gate.radius).toBe(band.radius)
        seen.add(gate.tier)
      }
      expect(seen.size).toBe(3)
    }
  })

  it('spans the city point-to-point, not a local loop', () => {
    for (const seed of SEEDS) {
      const { arena, course } = setup(seed)
      const finish = course.gates[course.gates.length - 1]!
      const span = Math.hypot(finish.x - course.start.x, finish.z - course.start.z)
      expect(span).toBeGreaterThanOrEqual(arena.wallRadius)
    }
  })
})

describe('generateCourse under the cavern (the Underground)', () => {
  it('holds every course invariant with no ring hanging in the rock', () => {
    for (const seed of SEEDS.slice(0, 4)) {
      const arena = generateUnderground(seed)
      const nav = buildNavGrid(arena)
      const course = generateCourse(seed, arena, nav)

      expect(course.gates.length).toBeGreaterThanOrEqual(MIN_GATES)
      expect(course.gates.length).toBeLessThanOrEqual(MAX_GATES)
      expect(isWalkable(nav, course.start.x, course.start.z)).toBe(true)

      let prev = { x: course.start.x, z: course.start.z }
      const seen = new Set<string>()
      for (const gate of course.gates) {
        const d = Math.hypot(gate.x - prev.x, gate.z - prev.z)
        expect(d).toBeGreaterThanOrEqual(MIN_GATE_SPACING)
        expect(d).toBeLessThanOrEqual(MAX_GATE_SPACING)
        expect(isWalkable(nav, gate.x, gate.z)).toBe(true)
        expect(Math.hypot(gate.x, gate.z)).toBeLessThanOrEqual(arena.wallRadius - COURSE_WALL_MARGIN)
        // the whole ring clears the dome, not just its center
        expect(gate.y + gate.radius).toBeLessThanOrEqual(ceilingHeightAt(arena, gate.x, gate.z) - 1)
        expect(gate.y).toBeGreaterThanOrEqual(GATE_TIERS[gate.tier].minY)
        seen.add(gate.tier)
        prev = gate
      }
      expect(seen.size).toBe(3)

      const finish = course.gates[course.gates.length - 1]!
      const span = Math.hypot(finish.x - course.start.x, finish.z - course.start.z)
      expect(span).toBeGreaterThanOrEqual(arena.wallRadius)
    }
  })
})
