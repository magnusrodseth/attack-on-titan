import { describe, expect, it } from 'vitest'
import { generateCity } from './city'
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

  it('lays a start plus 10-15 ordered gates', () => {
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

  it('mixes all three height tiers, each gate inside its band with its radius', () => {
    for (const seed of SEEDS) {
      const { course } = setup(seed)
      const seen = new Set<string>()
      for (const gate of course.gates) {
        const band = GATE_TIERS[gate.tier]
        expect(gate.y).toBeGreaterThanOrEqual(band.minY)
        expect(gate.y).toBeLessThanOrEqual(band.maxY)
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
