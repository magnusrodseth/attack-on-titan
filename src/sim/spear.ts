import { Vector3 } from 'three'
import type { Arena } from './city'
import { groundHeightAt, raycastHookTarget } from './city'
import type { NavGrid } from './nav'
import { nearestWalkable } from './nav'
import type { PlayerState } from './player'
import { createRng, hashSeed } from './rng'
import { titanLocalToWorld, worldToTitanLocal } from './rope'
import type { TitanKind, TitanState } from './titan'
import { napeCenter, raycastTitan, staggerTitan } from './titan'

// A rocket, not a lob: fast enough to feel explosive, slow enough to watch fly.
export const SPEAR_SPEED = 60
export const SPEAR_RANGE = 120 // past this a miss fizzles; no mid-air detonation
export const SPEAR_FUSE = 2.5 // seconds of rising beeps between sticking and the blast
export const BLAST_RADIUS = 5
export const BLAST_DAMAGE = 60 // non-nape hit: heavy but survivable (titans have 100)
export const FIRE_COOLDOWN = 0.6 // a nervous double-tap must not dump the whole rack
export const PICKUPS_PER_WAVE = 3
export const PICKUP_RADIUS = 3 // fly-through collect, like threading a ring
const PICKUP_HEIGHT = 1 // rack center above the street, for the collect distance check

export interface SpearState {
  id: number
  phase: 'flying' | 'stuck'
  pos: Vector3
  vel: Vector3
  traveled: number
  /** Set when stuck in a titan; the spear rides the body part via `local`. */
  titanId: number | null
  local: Vector3
  fuse: number
}

/** A per-wave street cache holding one spear; uncollected racks despawn with the wave. */
export interface SpearPickup {
  id: number
  x: number
  z: number
  taken: boolean
}

/** Launches from the arm mount along the crosshair. Returns null when dry or still cooling. */
export function fireSpear(p: PlayerState, id: number, lookDir: Vector3): SpearState | null {
  if (p.spears <= 0 || p.fireTimer > 0) return null
  const dir = lookDir.clone()
  if (dir.lengthSq() === 0) return null
  dir.normalize()
  p.spears -= 1
  p.fireTimer = FIRE_COOLDOWN
  return {
    id,
    phase: 'flying',
    pos: p.pos.clone().addScaledVector(dir, 1),
    vel: dir.multiplyScalar(SPEAR_SPEED),
    traveled: 0,
    titanId: null,
    local: new Vector3(),
    fuse: SPEAR_FUSE,
  }
}

export interface BlastResult {
  spearId: number
  pos: Vector3
  kills: { titanId: number; kind: TitanKind }[]
  staggered: number[]
  playerInBlast: boolean
}

export interface SpearStepResult {
  stuck: { id: number; titanId: number | null }[]
  fizzled: number[]
  blasts: BlastResult[]
}

/**
 * Advances every spear one tick: flight with per-step raycasts (titans, buildings, wall,
 * street), stick-and-ride on titan hits, fuse countdown, and blast resolution. Mutates
 * the spears array (exploded and fizzled spears are removed) and titan hp/behavior.
 */
export function stepSpears(
  spears: SpearState[],
  titans: TitanState[],
  playerPos: Vector3 | null, // null in co-op: the caller checks every soldier against the blast
  arena: Arena,
  dt: number,
): SpearStepResult {
  const result: SpearStepResult = { stuck: [], fizzled: [], blasts: [] }

  for (let i = spears.length - 1; i >= 0; i--) {
    const spear = spears[i]!
    if (spear.phase === 'flying') {
      const step = spear.vel.length() * dt
      const dir = spear.vel.clone().normalize()

      let bestDist = Infinity
      let hitTitan: TitanState | null = null
      for (const t of titans) {
        const dist = raycastTitan(t, spear.pos, dir, step)
        if (dist !== null && dist < bestDist) {
          bestDist = dist
          hitTitan = t
        }
      }
      const cityPoint = raycastHookTarget(arena, spear.pos, dir, step)
      const cityDist = cityPoint ? spear.pos.distanceTo(cityPoint) : Infinity

      if (hitTitan && bestDist < cityDist) {
        spear.pos.addScaledVector(dir, bestDist)
        spear.phase = 'stuck'
        spear.titanId = hitTitan.id
        worldToTitanLocal(hitTitan, spear.pos, spear.local)
        result.stuck.push({ id: spear.id, titanId: hitTitan.id })
        continue
      }
      if (cityPoint) {
        spear.pos.copy(cityPoint)
        spear.phase = 'stuck'
        result.stuck.push({ id: spear.id, titanId: null })
        continue
      }

      spear.pos.addScaledVector(dir, step)
      spear.traveled += step
      const ground = groundHeightAt(arena, spear.pos.x, spear.pos.z, spear.pos.y)
      if (spear.pos.y <= ground) {
        spear.pos.y = ground
        spear.phase = 'stuck'
        result.stuck.push({ id: spear.id, titanId: null })
        continue
      }
      if (spear.traveled >= SPEAR_RANGE) {
        result.fizzled.push(spear.id)
        spears.splice(i, 1)
      }
      continue
    }

    // stuck: ride the titan (a corpse no longer moves, so a stale pose is still right)
    if (spear.titanId !== null) {
      const titan = titans.find((t) => t.id === spear.titanId)
      if (titan) titanLocalToWorld(titan, spear.local, spear.pos)
    }
    spear.fuse -= dt
    if (spear.fuse <= 0) {
      result.blasts.push(detonate(spear, titans, playerPos))
      spears.splice(i, 1)
    }
  }

  return result
}

function detonate(spear: SpearState, titans: TitanState[], playerPos: Vector3 | null): BlastResult {
  const blast: BlastResult = {
    spearId: spear.id,
    pos: spear.pos.clone(),
    kills: [],
    staggered: [],
    playerInBlast: playerPos !== null && playerPos.distanceTo(spear.pos) <= BLAST_RADIUS,
  }
  for (const t of titans) {
    if (t.hp <= 0) continue
    if (napeCenter(t).distanceTo(blast.pos) <= BLAST_RADIUS) {
      // on or near the nape: the kill needs no speed — that is the whole point of the spear
      t.hp = 0
      blast.kills.push({ titanId: t.id, kind: t.kind })
      continue
    }
    if (blastDistanceToTitan(t, blast.pos) <= BLAST_RADIUS) {
      t.hp = Math.max(0, t.hp - BLAST_DAMAGE)
      if (t.hp <= 0) blast.kills.push({ titanId: t.id, kind: t.kind })
      else if (staggerTitan(t)) blast.staggered.push(t.id)
    }
  }
  return blast
}

/**
 * Distance from a point to the titan's body cylinder (the same solid raycastTitan uses),
 * so a blast at an ankle still counts as hitting a 15m titan whose center is far above.
 */
function blastDistanceToTitan(t: TitanState, point: Vector3): number {
  const radius = Math.max(0.8, t.height * 0.14)
  const clampedY = Math.min(Math.max(point.y, t.pos.y), t.pos.y + t.height * 0.92)
  const horiz = Math.hypot(point.x - t.pos.x, point.z - t.pos.z)
  return Math.hypot(Math.max(0, horiz - radius), point.y - clampedY)
}

/** The wave's spear caches, seeded from `seed:spears:wave` and snapped to walkable streets. */
export function spawnPickups(seed: string, wave: number, nav: NavGrid, count = PICKUPS_PER_WAVE): SpearPickup[] {
  const rng = createRng(hashSeed(`${seed}:spears:${wave}`))
  const pickups: SpearPickup[] = []
  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2
    const radius = 20 + rng() * 90 // inside the district, never against the wall
    const [x, z] = nearestWalkable(nav, Math.cos(angle) * radius, Math.sin(angle) * radius)
    pickups.push({ id: i + 1, x, z, taken: false })
  }
  return pickups
}

/** Fly-by collection: +1 spear per rack, skipped while the inventory is full. */
export function collectPickups(pickups: SpearPickup[], p: PlayerState): number[] {
  const collected: number[] = []
  for (const pickup of pickups) {
    if (pickup.taken || p.spears >= p.config.spearCapacity) continue
    const dx = p.pos.x - pickup.x
    const dy = p.pos.y - PICKUP_HEIGHT
    const dz = p.pos.z - pickup.z
    if (Math.hypot(dx, dy, dz) <= PICKUP_RADIUS) {
      pickup.taken = true
      p.spears += 1
      collected.push(pickup.id)
    }
  }
  return collected
}
