import { describe, expect, it } from 'vitest'
import { maxTitanHeightAt, titanRoamRadius } from './city'
import { GAME_MODES } from './modes'
import { DEFAULT_MAP_ID, GAME_MAPS, getMap, mapScopedSeed, mapsForMode } from './maps'
import { buildNavGrid, isWalkable, nearestWalkable } from './nav'
import { waveComposition } from './waves'
import { createRng, hashSeed } from './rng'

/**
 * Parity: every map hosts every mode. The Underground and the Forest were time-trial-only
 * because the titan systems had never been asked to work under a rock roof or among 80 m
 * trunks; once they were, the gate had nothing left to protect.
 */
describe('map/mode parity', () => {
  it('offers every mode on every map', () => {
    for (const mode of GAME_MODES) {
      const maps = mapsForMode(mode.id)
      expect(maps.map((m) => m.id).sort()).toEqual(GAME_MAPS.map((m) => m.id).sort())
    }
  })

  it('gives the map picker something to pick for every mode', () => {
    for (const mode of GAME_MODES) {
      expect(mapsForMode(mode.id).length).toBeGreaterThan(1)
    }
  })

  it('keeps the district as the fallback for an unknown map', () => {
    expect(getMap('nonsense').id).toBe(DEFAULT_MAP_ID)
    expect(getMap(null).id).toBe(DEFAULT_MAP_ID)
  })

  it('keeps every map on its own leaderboard', () => {
    expect(mapScopedSeed('district', 'abc')).toBe('abc') // old rows stand
    const scopes = GAME_MAPS.map((m) => mapScopedSeed(m.id, 'abc'))
    expect(new Set(scopes).size).toBe(GAME_MAPS.length)
  })
})

/**
 * A wave has to be survivable on every map: the titans must land on ground they can stand
 * on, and (under a roof) be short enough that their napes are not inside rock.
 */
describe('a wave on every map', () => {
  for (const map of GAME_MAPS) {
    describe(map.name, () => {
      const arena = map.generate('parity')
      const nav = buildNavGrid(arena)

      it('spawns a late wave on walkable ground, under whatever is overhead', () => {
        const rng = createRng(hashSeed('parity:wave:20'))
        const spawns = waveComposition(20, rng, 1, arena.wallRadius)
        expect(spawns.length).toBeGreaterThan(0)

        for (const s of spawns) {
          const [x, z] = nearestWalkable(nav, s.x, s.z)
          expect(isWalkable(nav, x, z)).toBe(true)

          const height = Math.min(s.height, maxTitanHeightAt(arena, x, z))
          expect(height).toBeGreaterThan(5) // still a titan, not a doll
          // it fits where it stands, and it is allowed to stand where it spawned
          expect(Math.hypot(x, z)).toBeLessThanOrEqual(titanRoamRadius(arena, height) + 1e-6)
        }
      })
    })
  }
})
