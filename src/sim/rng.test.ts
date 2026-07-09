import { describe, expect, it } from 'vitest'
import { createRng, hashSeed, resumeRng } from './rng'

describe('createRng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRng(42)
    const b = createRng(42)
    for (let i = 0; i < 20; i++) {
      expect(a()).toBe(b())
    }
  })

  it('produces different sequences for different seeds', () => {
    const a = createRng(1)
    const b = createRng(2)
    const seqA = Array.from({ length: 5 }, () => a())
    const seqB = Array.from({ length: 5 }, () => b())
    expect(seqA).not.toEqual(seqB)
  })

  it('stays in [0, 1)', () => {
    const rng = createRng(7)
    for (let i = 0; i < 1000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('resumes a stream mid-flight from its captured state', () => {
    const original = createRng(42)
    for (let i = 0; i < 137; i++) original()
    const resumed = resumeRng(original.state())
    for (let i = 0; i < 50; i++) {
      expect(resumed()).toBe(original())
    }
  })
})

describe('hashSeed', () => {
  it('is stable for the same string and differs across strings', () => {
    expect(hashSeed('shiganshina')).toBe(hashSeed('shiganshina'))
    expect(hashSeed('wall-rose')).not.toBe(hashSeed('wall-maria'))
  })
})
