import type { TitanKind } from './titan'

export interface TitanSpawn {
  kind: TitanKind
  height: number
  x: number
  z: number
}

export function waveComposition(wave: number, rng: () => number): TitanSpawn[] {
  const count = Math.min(4 + (wave - 1) * 2, 18)
  const abnormalChance = Math.min(0.06 + (wave - 1) * 0.07, 0.5)
  const spawns: TitanSpawn[] = []
  for (let i = 0; i < count; i++) {
    const kind: TitanKind = rng() < abnormalChance ? 'abnormal' : 'normal'
    const height = Math.min(27, 8 + rng() * 8 + (wave - 1) * 0.9)
    const angle = rng() * Math.PI * 2
    const radius = 90 + rng() * 60
    spawns.push({ kind, height, x: Math.cos(angle) * radius, z: Math.sin(angle) * radius })
  }
  return spawns
}
