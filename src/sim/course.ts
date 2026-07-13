import type { Arena } from './city'
import { ceilingHeightAt, groundHeightAt } from './city'
import type { NavGrid } from './nav'
import { nearestWalkable } from './nav'
import { createRng, hashSeed, shuffle } from './rng'

/**
 * Signal Run course generator (wayfinder tt-002): a seeded point-to-point line of gates
 * laid across the city. Same seed + same map, same course; times only compare within both.
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

export const MIN_GATES = 13
export const MAX_GATES = 19
export const MIN_GATE_SPACING = 35
export const MAX_GATE_SPACING = 70
/** Gates keep this far inside the wall so rings never hang in the no-fly ring. */
export const COURSE_WALL_MARGIN = 12

/**
 * Height bands over the street the gate hangs above. Street rings are run or swung
 * through; canyon rings sit between the eaves and demand a hook or a boost; rooftop
 * rings ride the local skyline (the v2 districts vary block heights, so canyon and
 * rooftop bands are derived from the roofs actually near the gate — these constants
 * are the floors and the pass radii). Tighter rings where the streets crowd you.
 */
export const GATE_TIERS: Record<GateTier, { minY: number; maxY: number; radius: number }> = {
  street: { minY: 4, maxY: 7, radius: 4 },
  canyon: { minY: 9, maxY: 16, radius: 5 },
  rooftop: { minY: 18, maxY: 26, radius: 6 },
}

/**
 * Under the giants the same three tiers re-band entirely: floor, trunk, canopy. The forest's
 * vertical envelope is triple the city's (the crowns sit around 72 m against the district's
 * 26 m rooftops), and a course that ignored that would be a city course laid on grass. The
 * rings are wider up top, where you arrive fast and off a long swing.
 */
export const FOREST_TIERS: Record<GateTier, { minY: number; maxY: number; radius: number }> = {
  street: { minY: 4, maxY: 8, radius: 4.5 }, // the fern floor
  canyon: { minY: 20, maxY: 38, radius: 6 }, // mid-trunk, in among the limbs
  rooftop: { minY: 50, maxY: 66, radius: 7.5 }, // the crown
}

export function tiersFor(arena: Arena): Record<GateTier, { minY: number; maxY: number; radius: number }> {
  return arena.forest ? FOREST_TIERS : GATE_TIERS
}

/** Tallest roof sampled around a point; 0 over open squares and the canal. */
function localSkyline(arena: Arena, x: number, z: number): number {
  let top = 0
  for (const [ox, oz] of [
    [0, 0],
    [9, 0],
    [-9, 0],
    [0, 9],
    [0, -9],
  ] as const) {
    top = Math.max(top, groundHeightAt(arena, x + ox, z + oz, Infinity))
  }
  return top
}

/** The gate's hang height: street is fixed, canyon and rooftop follow the skyline. */
function gateHeight(
  arena: Arena,
  tier: GateTier,
  x: number,
  z: number,
  roll: number,
): number {
  const band = tiersFor(arena)[tier]
  // in the forest the bands are absolute heights, not skyline-derived: the "local skyline"
  // beside a giant IS the giant, and reading it would hang every ring inside the bark
  if (arena.forest) return band.minY + roll * (band.maxY - band.minY)
  if (tier === 'street') return band.minY + roll * (band.maxY - band.minY)
  // clamp to the house/warehouse band: gates hug rooftops, never tower spires
  const roof = Math.min(localSkyline(arena, x, z), 32)
  if (tier === 'rooftop') {
    const lo = Math.max(band.minY, roof + 3)
    return lo + roll * 6
  }
  // canyon: between the street and the local eaves, hugging taller districts higher
  const lo = Math.max(band.minY, roof * 0.45)
  const hi = Math.max(lo + 3, Math.min(roof - 2, band.maxY + 8))
  return lo + roll * (hi - lo)
}

const MEAN_SPACING = (MIN_GATE_SPACING + MAX_GATE_SPACING) / 2
const PLACEMENT_ATTEMPTS = 140

/** A shuffled cycle of tiers: every course mixes all three, in a seed-specific order. */
function tierSequence(rng: () => number, count: number): GateTier[] {
  const cycle: GateTier[] = ['street', 'canyon', 'rooftop']
  const tiers: GateTier[] = []
  for (let i = 0; i < count; i++) tiers.push(cycle[i % cycle.length]!)
  return shuffle(rng, tiers)
}

/** Rounds of whole-course regeneration before settling for the least-violating one. */
const COURSE_ROUNDS = 10

/**
 * Snapping every gate onto walkable streets means a single greedy pass cannot
 * guarantee the course invariants on every seed — so roll complete courses on
 * derived substreams and keep the first that validates cleanly.
 */
export function generateCourse(seed: string, arena: Arena, nav: NavGrid): Course {
  let best: Course | null = null
  let bestViolation = Infinity
  for (let round = 0; round < COURSE_ROUNDS; round++) {
    const course = generateCourseRound(`${seed}:course:${round}`, arena, nav)
    const violation = courseViolation(course, arena)
    if (violation < bestViolation) {
      bestViolation = violation
      best = course
      if (violation === 0) break
    }
  }
  return best!
}

/** Total invariant violation in meters; 0 means the course honours every promise. */
function courseViolation(course: Course, arena: Arena): number {
  const limit = arena.wallRadius - COURSE_WALL_MARGIN
  let debt = 0
  let prevX = course.start.x
  let prevZ = course.start.z
  for (const gate of course.gates) {
    const spacing = Math.hypot(gate.x - prevX, gate.z - prevZ)
    debt += Math.max(0, MIN_GATE_SPACING - spacing)
    debt += Math.max(0, spacing - MAX_GATE_SPACING)
    debt += Math.max(0, Math.hypot(gate.x, gate.z) - limit)
    prevX = gate.x
    prevZ = gate.z
  }
  const finish = course.gates[course.gates.length - 1]!
  const span = Math.hypot(finish.x - course.start.x, finish.z - course.start.z)
  debt += Math.max(0, arena.wallRadius - span)
  return debt
}

function generateCourseRound(streamSeed: string, arena: Arena, nav: NavGrid): Course {
  const rng = createRng(hashSeed(`${streamSeed}:route`))
  const count = MIN_GATES + Math.floor(rng() * (MAX_GATES - MIN_GATES + 1))

  // the course crosses the city: start deep on one side, finish deep on the other
  const theta = rng() * Math.PI * 2
  const reach = arena.wallRadius * 0.78
  const [startX, startZ] = nearestWalkable(nav, -Math.cos(theta) * reach, -Math.sin(theta) * reach)
  const targetX = Math.cos(theta) * reach
  const targetZ = Math.sin(theta) * reach
  const limit = arena.wallRadius - COURSE_WALL_MARGIN

  // the vertical profile rides its own stream so retuning it never reshuffles the route
  const vertical = createRng(hashSeed(`${streamSeed}:vertical`))
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

    // keep the candidate that best honours spacing and the wall margin: nav snapping
    // in the dense v2 city can push every literal attempt slightly off, so the least
    // violating placement wins instead of whatever the last attempt happened to be
    let x = prevX
    let z = prevZ
    let bestPenalty = Infinity
    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
      // late attempts abandon the preferred cone: any direction beats a bad snap
      const amp = attempt < 60 ? jitterAmp : Math.PI
      const bearing = baseBearing + (rng() * 2 - 1) * amp
      const d = MIN_GATE_SPACING + rng() * (MAX_GATE_SPACING - MIN_GATE_SPACING)
      const [sx, sz] = nearestWalkable(
        nav,
        prevX + Math.cos(bearing) * d,
        prevZ + Math.sin(bearing) * d,
      )
      const spacing = Math.hypot(sx - prevX, sz - prevZ)
      // a candidate must leave the far-side target reachable with the gates still to
      // come, or the course stalls short of a true city crossing
      const reachDebt = Math.max(
        0,
        Math.hypot(targetX - sx, targetZ - sz) - (count - 1 - i) * MAX_GATE_SPACING,
      )
      // the 2m nav snap can shave ~1.4m off a drawn distance: demand a margin inside
      // the public bounds so quantization never leaks a violation
      const penalty =
        (Math.hypot(sx, sz) > limit ? 1000 : 0) +
        Math.max(0, MIN_GATE_SPACING + 2 - spacing) +
        Math.max(0, spacing - (MAX_GATE_SPACING - 2)) +
        reachDebt
      if (penalty < bestPenalty) {
        bestPenalty = penalty
        x = sx
        z = sz
      }
      if (penalty === 0) break
    }
    const tier = tiers[i]!
    const band = tiersFor(arena)[tier]
    let y = gateHeight(arena, tier, x, z, vertical())
    // under a cavern the vertical bands bow with the dome: rings never hang in the rock
    const ceiling = ceilingHeightAt(arena, x, z)
    if (ceiling !== Infinity) y = Math.min(y, ceiling - band.radius - 1.5)
    gates.push({ x, y, z, radius: band.radius, tier })
    prevX = x
    prevZ = z
  }
  return { start: { x: startX, z: startZ }, gates }
}
