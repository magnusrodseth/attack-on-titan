import type { Arena } from './city'
import type { NavGrid } from './nav'
import { nearestWalkable } from './nav'
import { createRng, hashSeed, shuffle } from './rng'

/**
 * Signal Run course generator (wayfinder tt-002): a seeded point-to-point line of gates
 * laid across the city. Same seed, same course — times are only comparable per seed.
 */
export type GateTier = 'street' | 'canyon' | 'rooftop'

export interface Gate {
  x: number
  y: number
  z: number
  /** Pass tolerance: entering this sphere counts the gate (and refills gas). */
  radius: number
  tier: GateTier
}

export interface Course {
  /** Street-level spawn; the timer arms here and starts on first input. */
  start: { x: number; z: number }
  /** Ordered rings to pass; the last one is the finish. */
  gates: Gate[]
}

export const MIN_GATES = 10
export const MAX_GATES = 15
export const MIN_GATE_SPACING = 35
export const MAX_GATE_SPACING = 70
/** Gates keep this far inside the wall so rings never hang in the no-fly ring. */
export const COURSE_WALL_MARGIN = 12

/**
 * Height bands over the street the gate hangs above. Street rings are run or swung
 * through; canyon rings sit between the eaves and demand a hook or a boost; rooftop
 * rings clear the house ridges (14-22m) but stay under the towers and the wall. Tighter
 * rings where the streets crowd you, wider ones out in the open air.
 */
export const GATE_TIERS: Record<GateTier, { minY: number; maxY: number; radius: number }> = {
  street: { minY: 4, maxY: 7, radius: 4 },
  canyon: { minY: 10, maxY: 16, radius: 5 },
  rooftop: { minY: 20, maxY: 28, radius: 6 },
}

const MEAN_SPACING = (MIN_GATE_SPACING + MAX_GATE_SPACING) / 2
const PLACEMENT_ATTEMPTS = 60

/** A shuffled cycle of tiers: every course mixes all three, in a seed-specific order. */
function tierSequence(rng: () => number, count: number): GateTier[] {
  const cycle: GateTier[] = ['street', 'canyon', 'rooftop']
  const tiers: GateTier[] = []
  for (let i = 0; i < count; i++) tiers.push(cycle[i % cycle.length]!)
  return shuffle(rng, tiers)
}

export function generateCourse(seed: string, arena: Arena, nav: NavGrid): Course {
  const rng = createRng(hashSeed(`${seed}:course:0`))
  const count = MIN_GATES + Math.floor(rng() * (MAX_GATES - MIN_GATES + 1))

  // the course crosses the city: start deep on one side, finish deep on the other
  const theta = rng() * Math.PI * 2
  const reach = arena.wallRadius * 0.78
  const [startX, startZ] = nearestWalkable(nav, -Math.cos(theta) * reach, -Math.sin(theta) * reach)
  const targetX = Math.cos(theta) * reach
  const targetZ = Math.sin(theta) * reach
  const limit = arena.wallRadius - COURSE_WALL_MARGIN

  // the vertical profile rides its own stream so retuning it never reshuffles the route
  const vertical = createRng(hashSeed(`${seed}:course:1`))
  const tiers = tierSequence(vertical, count)

  const gates: Gate[] = []
  let prevX = startX
  let prevZ = startZ
  for (let i = 0; i < count; i++) {
    // spare path budget over the beeline decides how far the bearing may wander:
    // plenty of budget weaves through side streets, a tight budget homes on the target
    const straight = Math.max(Math.hypot(targetX - prevX, targetZ - prevZ), 1)
    const slack = ((count - i) * MEAN_SPACING) / straight
    const jitterAmp = Math.min(Math.max((slack - 1) * 1.2, 0.25), 1.3)
    const baseBearing = Math.atan2(targetZ - prevZ, targetX - prevX)

    let x = prevX
    let z = prevZ
    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
      const bearing = baseBearing + (rng() * 2 - 1) * jitterAmp
      const d = MIN_GATE_SPACING + rng() * (MAX_GATE_SPACING - MIN_GATE_SPACING)
      const [sx, sz] = nearestWalkable(
        nav,
        prevX + Math.cos(bearing) * d,
        prevZ + Math.sin(bearing) * d,
      )
      x = sx
      z = sz
      if (Math.hypot(sx, sz) > limit) continue
      const spacing = Math.hypot(sx - prevX, sz - prevZ)
      if (spacing < MIN_GATE_SPACING || spacing > MAX_GATE_SPACING) continue
      break // snapped placement honours spacing and the wall margin
    }
    const tier = tiers[i]!
    const band = GATE_TIERS[tier]
    gates.push({ x, y: band.minY + vertical() * (band.maxY - band.minY), z, radius: band.radius, tier })
    prevX = x
    prevZ = z
  }
  return { start: { x: startX, z: startZ }, gates }
}
