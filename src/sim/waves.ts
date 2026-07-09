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

export function waveComposition(wave: number, rng: () => number, countScale = 1): TitanSpawn[] {
  const count = Math.min(Math.round(Math.min(4 + (wave - 1) * 2, 18) * countScale), 40)
  const abnormalChance = Math.min(0.06 + (wave - 1) * 0.07, 0.5)
  const spawns: TitanSpawn[] = []
  for (let i = 0; i < count; i++) {
    const kind: TitanKind = rng() < abnormalChance ? 'abnormal' : 'normal'
    const height = Math.min(27, 8 + rng() * 8 + (wave - 1) * 0.9)
    const angle = rng() * Math.PI * 2
    const radius = 90 + rng() * 60
    spawns.push({ kind, height, x: Math.cos(angle) * radius, z: Math.sin(angle) * radius })
  }
  if (isMatchday(wave)) {
    // the duo arrives on top of the horde, at their signature stature
    for (const kind of ['striker', 'captain'] as const) {
      const height = 13 + rng() * 3
      const angle = rng() * Math.PI * 2
      const radius = 90 + rng() * 60
      spawns.push({ kind, height, x: Math.cos(angle) * radius, z: Math.sin(angle) * radius })
    }
  }
  return spawns
}
