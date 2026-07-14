import type { Arena } from './city'
import type { CoopStance } from './stance'
import { generateCity } from './citygen'
import { createRng, hashSeed } from './rng'
import { generateForest } from './forestgen'
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
  /** What this arena does in multiplayer. Required, like every other piece of content. */
  coop: CoopStance
  /** Pinned day/night clock fraction (0 = midnight), or null for the seeded cycle. */
  clockFraction: number | null
  generate(seed: string): Arena
}

export const DEFAULT_MAP_ID = 'district'

/**
 * Every mode, on every map. The two new arenas shipped time-trial-only because the titan
 * systems had only ever been asked to work in the district: a leap had no ceiling to duck
 * and no trunk to hit, and a 60 m Colossal under a 44 m dome kept its nape inside the rock.
 * Those are fixed at the source (see city.ts headroom, titan.ts leap, Arena.bossEntry), so
 * the roster is no longer a per-map question.
 */
const ALL_MODES = ['waves', 'bossrush', 'race', 'hunt']

export const GAME_MAPS: GameMap[] = [
  {
    id: 'district',
    name: 'The District',
    desc: 'The walled surface district — rooftops, boulevards and the canal under an open sky.',
    modes: ALL_MODES,
    coop: { kind: 'shared' },
    clockFraction: null,
    // the exact pre-maps rng stream: existing ?seed= URLs must replay unchanged
    generate: (seed) => generateCity(createRng(hashSeed(`${seed}:city`))),
  },
  {
    id: 'underground',
    name: 'The Underground',
    desc: 'The cavern city beneath the capital — torchlit streets, rock pillars, and a ceiling to swing from. Daylight falls through holes worn in the rock.',
    modes: ALL_MODES,
    coop: {
      kind: 'shared',
      note: 'The world ducks every spawn under the rock it stands beneath (maxTitanHeightAt), and the Colossal is dropped from the cavern ladder rather than shrunk to fit.',
    },
    // the shafts are open to the surface, so the cavern keeps the seeded day/night cycle:
    // sun through the holes by day, stars by night, torches burning through both
    clockFraction: null,
    generate: generateUnderground,
  },
  {
    id: 'forest',
    name: 'The Forest of Giant Trees',
    desc: 'Eighty metres of bark in every direction — swing the giants, rest on their limbs, and run the crown line. The definitive ODM playground.',
    modes: ALL_MODES,
    coop: { kind: 'shared' },
    clockFraction: null,
    generate: generateForest,
  },
]

export function getMap(id: string | null | undefined): GameMap {
  return GAME_MAPS.find((m) => m.id === id) ?? GAME_MAPS[0]!
}

/** Maps offered for a mode; the picker only shows when there is more than one. */
export function mapsForMode(modeId: string): GameMap[] {
  return GAME_MAPS.filter((m) => m.modes.includes(modeId))
}

/** The arenas a co-op lobby may pick: the ones whose stance says they hold a squad. */
export function coopMaps(): GameMap[] {
  return GAME_MAPS.filter((m) => m.coop.kind !== 'soloOnly')
}

/**
 * The scope string keying trial PBs and leaderboard rows. The district keeps the bare
 * seed (existing rows and local PBs stand); other maps prefix it, so times on different
 * arenas never contest one board.
 */
export function mapScopedSeed(mapId: string, seed: string): string {
  return mapId === DEFAULT_MAP_ID ? seed : `${mapId}:${seed}`
}
