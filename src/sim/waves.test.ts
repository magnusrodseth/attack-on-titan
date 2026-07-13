import { describe, expect, it } from 'vitest'
import { createRng } from './rng'
import { waveComposition } from './waves'

// spawn ring bounds for the default 260m wall: [0.5, 0.85] of the radius
const RING_MIN = 260 * 0.5
const RING_MAX = 260 * 0.85

describe('waveComposition', () => {
  it('is deterministic for the same seed', () => {
    expect(waveComposition(3, createRng(11))).toEqual(waveComposition(3, createRng(11)))
  })

  it('grows the horde as waves progress', () => {
    const early = waveComposition(1, createRng(1)).length
    const late = waveComposition(6, createRng(1)).length
    expect(late).toBeGreaterThan(early)
  })

  it('mixes in more abnormals at higher waves', () => {
    const late = waveComposition(8, createRng(5))
    const abnormals = late.filter((s) => s.kind === 'abnormal').length
    expect(abnormals).toBeGreaterThanOrEqual(2)
  })

  it('fields only normals and abnormals: the horde has no special guests', () => {
    for (const wave of [3, 6, 9]) {
      for (const s of waveComposition(wave, createRng(wave))) {
        expect(['normal', 'abnormal']).toContain(s.kind)
      }
    }
  })

  it('spawns on a ring outside the city core with sane heights', () => {
    for (const spawn of waveComposition(5, createRng(2))) {
      const dist = Math.hypot(spawn.x, spawn.z)
      expect(dist).toBeGreaterThanOrEqual(RING_MIN)
      expect(dist).toBeLessThanOrEqual(RING_MAX)
      expect(spawn.height).toBeGreaterThanOrEqual(8)
      expect(spawn.height).toBeLessThanOrEqual(27)
    }
  })

  it('scales the spawn ring with the arena wall', () => {
    for (const spawn of waveComposition(5, createRng(2), 1, 170)) {
      const dist = Math.hypot(spawn.x, spawn.z)
      expect(dist).toBeGreaterThanOrEqual(170 * 0.5)
      expect(dist).toBeLessThanOrEqual(170 * 0.85)
    }
  })
})
