import { describe, expect, it } from 'vitest'
import {
  DAILY_MAP_IDS,
  DAILY_MODE_IDS,
  dailyCourseSeed,
  dailyDate,
  dailyRoll,
  dayIndex,
} from './daily'
import { GAME_MAPS } from './maps'
import { GAME_MODES } from './modes'

const DAY_MS = 86_400_000

describe('the daily date is UTC', () => {
  it('rolls over at UTC midnight, not the player local midnight', () => {
    // 23:30 on the 14th in New York is already the 15th in UTC. Two players either side of
    // a timezone must be on the SAME expedition, which is exactly what the old local-time
    // dailySeed() got wrong.
    expect(dailyDate(Date.UTC(2026, 6, 15, 3, 30))).toBe('2026-07-15')
    expect(dailyDate(Date.UTC(2026, 6, 14, 23, 59, 59))).toBe('2026-07-14')
    expect(dailyDate(Date.UTC(2026, 6, 15, 0, 0, 0))).toBe('2026-07-15')
  })

  it('counts whole days from the epoch', () => {
    expect(dayIndex('2026-01-01')).toBe(0)
    expect(dayIndex('2026-01-02')).toBe(1)
    expect(dayIndex(dailyDate(Date.UTC(2026, 0, 1) + 40 * DAY_MS))).toBe(40)
  })
})

describe('the roll', () => {
  it('is a pure function of the date', () => {
    expect(dailyRoll('2026-07-14')).toEqual(dailyRoll('2026-07-14'))
    expect(dailyRoll('2026-07-14')).not.toEqual(dailyRoll('2026-07-15'))
  })

  it('never hands you Bossrush — the worst mode to lose a single attempt to', () => {
    for (let d = 0; d < 400; d++) {
      const date = dailyDate(Date.UTC(2026, 0, 1) + d * DAY_MS)
      expect(dailyRoll(date).modeId).not.toBe('bossrush')
    }
  })

  it('never repeats yesterday mode OR map, across a whole year', () => {
    let prev = dailyRoll(dailyDate(Date.UTC(2026, 0, 1)))
    for (let d = 1; d < 400; d++) {
      const today = dailyRoll(dailyDate(Date.UTC(2026, 0, 1) + d * DAY_MS))
      expect(today.modeId).not.toBe(prev.modeId)
      expect(today.mapId).not.toBe(prev.mapId)
      prev = today
    }
  })

  it('covers every mode × map pairing exactly once per cycle, so nothing is starved', () => {
    const cycle = DAILY_MODE_IDS.length * DAILY_MAP_IDS.length
    for (const start of [0, cycle, 5 * cycle]) {
      const seen = new Set<string>()
      for (let d = start; d < start + cycle; d++) {
        const { modeId, mapId } = dailyRoll(dailyDate(Date.UTC(2026, 0, 1) + d * DAY_MS))
        seen.add(`${modeId}:${mapId}`)
      }
      expect(seen.size).toBe(cycle)
    }
  })
})

describe('the sealed course seed', () => {
  it('is stable per (secret, date) so the worker can re-derive it without storing it', () => {
    expect(dailyCourseSeed('s3cret', '2026-07-14')).toBe(dailyCourseSeed('s3cret', '2026-07-14'))
  })

  it('cannot be guessed from the date alone — a different secret is a different course', () => {
    expect(dailyCourseSeed('s3cret', '2026-07-14')).not.toBe(dailyCourseSeed('other', '2026-07-14'))
    expect(dailyCourseSeed('s3cret', '2026-07-14')).not.toBe(dailyCourseSeed('s3cret', '2026-07-15'))
  })
})

// --- the guard ---------------------------------------------------------------
//
// daily.ts deliberately does NOT import the registries: the Worker imports it, and pulling
// GAME_MAPS in would drag every arena generator into the Worker bundle. The ids are data
// there — so this is where they are held to the registries. If a map or mode is ever added,
// renamed or removed, this fails loudly and whoever did it has to come back to the daily.
describe('the daily pool matches the registries', () => {
  it('names only modes that exist, and excludes Bossrush by choice', () => {
    const modeIds = GAME_MODES.map((m) => m.id)
    for (const id of DAILY_MODE_IDS) expect(modeIds).toContain(id)
    expect(DAILY_MODE_IDS).not.toContain('bossrush')
  })

  it('names every map in the registry — a new arena must be let into the daily on purpose', () => {
    expect([...DAILY_MAP_IDS].sort()).toEqual(GAME_MAPS.map((m) => m.id).sort())
  })

  it('only pairs modes with maps that can host them', () => {
    for (const map of GAME_MAPS) {
      for (const modeId of DAILY_MODE_IDS) {
        expect(map.modes).toContain(modeId)
      }
    }
  })

  it('holds the preconditions the no-repeat walk depends on', () => {
    // mode differs day to day because there is more than one mode; the map step is 1 or 2, so
    // it can only be guaranteed non-zero mod N when there are at least three maps. Drop to two
    // and the map would silently start repeating — hence this assertion rather than a comment.
    expect(DAILY_MODE_IDS.length).toBeGreaterThanOrEqual(2)
    expect(DAILY_MAP_IDS.length).toBeGreaterThanOrEqual(3)
  })
})
