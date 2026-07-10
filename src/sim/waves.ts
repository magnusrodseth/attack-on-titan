import type { TitanKind } from './titan'

export interface TitanSpawn {
  kind: TitanKind
  height: number
  x: number
  z: number
}

/** Every 3rd wave is matchday: Haaland and Kane walk, guaranteed (user decision, 2026-07-09). */
export function isMatchday(wave: number): boolean {
  return wave > 0 && wave % 3 === 0
}

/** The v2 district has ~2.3x the area of the original; the horde grows to fill it. */
export const TITAN_DENSITY = 2
const COUNT_CAP = 64

/** Spawn ring: deep in the district but clear of the plaza, scaled to the wall. */
function spawnRing(rng: () => number, wallRadius: number): number {
  return wallRadius * (0.5 + rng() * 0.35)
}

export function waveComposition(
  wave: number,
  rng: () => number,
  countScale = 1,
  wallRadius = 260,
): TitanSpawn[] {
  const count = Math.min(
    Math.round(Math.min(4 + (wave - 1) * 2, 18) * TITAN_DENSITY * countScale),
    COUNT_CAP,
  )
  const abnormalChance = Math.min(0.06 + (wave - 1) * 0.07, 0.5)
  const spawns: TitanSpawn[] = []
  for (let i = 0; i < count; i++) {
    const kind: TitanKind = rng() < abnormalChance ? 'abnormal' : 'normal'
    const height = Math.min(27, 8 + rng() * 8 + (wave - 1) * 0.9)
    const angle = rng() * Math.PI * 2
    const radius = spawnRing(rng, wallRadius)
    spawns.push({ kind, height, x: Math.cos(angle) * radius, z: Math.sin(angle) * radius })
  }
  if (isMatchday(wave)) {
    // the duo arrives on top of the horde, at their signature stature
    for (const kind of ['striker', 'captain'] as const) {
      spawns.push(footballerSpawn(kind, rng, wallRadius))
    }
  }
  return spawns
}

function footballerSpawn(
  kind: 'striker' | 'captain',
  rng: () => number,
  wallRadius: number,
): TitanSpawn {
  const height = 13 + rng() * 3 // signature stature: always imposing, never a skyscraper
  const angle = rng() * Math.PI * 2
  const radius = spawnRing(rng, wallRadius)
  return { kind, height, x: Math.cos(angle) * radius, z: Math.sin(angle) * radius }
}

/** The Matchday mode roster: every titan on the pitch is a footballer. */
export function matchdayComposition(
  wave: number,
  rng: () => number,
  countScale = 1,
  wallRadius = 260,
): TitanSpawn[] {
  const count = Math.min(
    Math.round(Math.min(4 + (wave - 1) * 2, 18) * TITAN_DENSITY * countScale),
    COUNT_CAP,
  )
  const spawns: TitanSpawn[] = []
  for (let i = 0; i < count; i++) {
    spawns.push(footballerSpawn(rng() < 0.5 ? 'striker' : 'captain', rng, wallRadius))
  }
  return spawns
}
