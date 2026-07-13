import type { Arena } from './city'
import { generateCity } from './citygen'
import { createRng, hashSeed } from './rng'
import { generateUnderground } from './undergroundgen'

/**
 * Arena archetypes. A map owns what a seed generates: the district under an open sky,
 * the cavern city, later the forest. The map joins the replay identity next to the seed
 * (`?map=` URL param, run save, trial scopes) — same seed + same map replays bit-for-bit;
 * a different map is honestly a different course. New maps append here and the Signal Run
 * map selector picks them up from the registry.
 */
export interface GameMap {
  id: string
  name: string
  desc: string
  /** Mode ids this map can host; the selector only appears where there is a choice. */
  modes: string[]
  /** Pinned day/night clock fraction (0 = midnight), or null for the seeded cycle. */
  clockFraction: number | null
  generate(seed: string): Arena
}

export const DEFAULT_MAP_ID = 'district'

export const GAME_MAPS: GameMap[] = [
  {
    id: 'district',
    name: 'The District',
    desc: 'The walled surface district — rooftops, boulevards and the canal under an open sky.',
    modes: ['waves', 'race', 'hunt'],
    clockFraction: null,
    // the exact pre-maps rng stream: existing ?seed= URLs must replay unchanged
    generate: (seed) => generateCity(createRng(hashSeed(`${seed}:city`))),
  },
  {
    id: 'underground',
    name: 'The Underground',
    desc: 'The cavern city beneath the capital — lamplit streets, rock pillars, and a ceiling to swing from.',
    modes: ['race'],
    clockFraction: 0, // midnight forever: the cavern never sees the sun
    generate: generateUnderground,
  },
]

export function getMap(id: string | null | undefined): GameMap {
  return GAME_MAPS.find((m) => m.id === id) ?? GAME_MAPS[0]!
}

/** Maps offered for a mode; the picker only shows when there is more than one. */
export function mapsForMode(modeId: string): GameMap[] {
  return GAME_MAPS.filter((m) => m.modes.includes(modeId))
}

/**
 * The scope string keying trial PBs and leaderboard rows. The district keeps the bare
 * seed (existing rows and local PBs stand); other maps prefix it, so times on different
 * arenas never contest one board.
 */
export function mapScopedSeed(mapId: string, seed: string): string {
  return mapId === DEFAULT_MAP_ID ? seed : `${mapId}:${seed}`
}
