import { describe, expect, it } from 'vitest'
import { createRng } from './rng'
import { waveComposition } from './waves'

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

  it('spawns on a ring outside the city core with sane heights', () => {
    for (const spawn of waveComposition(5, createRng(2))) {
      const dist = Math.hypot(spawn.x, spawn.z)
      expect(dist).toBeGreaterThanOrEqual(90)
      expect(dist).toBeLessThanOrEqual(150)
      expect(spawn.height).toBeGreaterThanOrEqual(8)
      expect(spawn.height).toBeLessThanOrEqual(27)
    }
  })
})
