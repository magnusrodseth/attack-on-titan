import { describe, expect, it } from 'vitest'
import { createRng } from './rng'
import { matchdayComposition, waveComposition } from './waves'

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

  it('every 3rd wave is matchday: Haaland and Kane join on top of the horde', () => {
    const matchday = waveComposition(3, createRng(7))
    expect(matchday.filter((s) => s.kind === 'striker')).toHaveLength(1)
    expect(matchday.filter((s) => s.kind === 'captain')).toHaveLength(1)
    expect(matchday).toHaveLength(8 + 2) // the usual wave-3 horde, plus the duo

    const offday = waveComposition(4, createRng(7))
    expect(offday.some((s) => s.kind === 'striker' || s.kind === 'captain')).toBe(false)
  })

  it('footballers arrive at their signature height, 13 to 16 m', () => {
    for (const wave of [3, 6, 9]) {
      const stars = waveComposition(wave, createRng(wave)).filter(
        (s) => s.kind === 'striker' || s.kind === 'captain',
      )
      expect(stars).toHaveLength(2)
      for (const s of stars) {
        expect(s.height).toBeGreaterThanOrEqual(13)
        expect(s.height).toBeLessThanOrEqual(16)
      }
    }
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

describe('matchdayComposition', () => {
  it('fields only footballers, at their signature height, on the spawn ring', () => {
    for (const wave of [1, 4, 7]) {
      const roster = matchdayComposition(wave, createRng(wave))
      expect(roster.length).toBeGreaterThan(0)
      for (const s of roster) {
        expect(['striker', 'captain']).toContain(s.kind)
        expect(s.height).toBeGreaterThanOrEqual(13)
        expect(s.height).toBeLessThanOrEqual(16)
        const dist = Math.hypot(s.x, s.z)
        expect(dist).toBeGreaterThanOrEqual(90)
        expect(dist).toBeLessThanOrEqual(150)
      }
    }
  })

  it('fields both stars and escalates the roster like the waves mode', () => {
    const roster = matchdayComposition(5, createRng(9))
    expect(roster.some((s) => s.kind === 'striker')).toBe(true)
    expect(roster.some((s) => s.kind === 'captain')).toBe(true)
    expect(matchdayComposition(6, createRng(1)).length).toBeGreaterThan(
      matchdayComposition(1, createRng(1)).length,
    )
  })
})
