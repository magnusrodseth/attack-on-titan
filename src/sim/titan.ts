import { Vector3 } from 'three'
import type { Arena } from './city'
import {
  TITAN_HEADROOM,
  baseGroundY,
  clampTitanToArena,
  clampToCeiling,
  insideBuildingXZ,
  resolveBuildingCollision,
} from './city'
import { GRAVITY } from './constants'
import type { NavGrid } from './nav'
import { findPath, lineWalkable, nearestWalkable } from './nav'
import type { CoopStance } from './stance'

export type TitanKind = 'normal' | 'abnormal' | 'shifter'

export type TitanBehavior = 'wander' | 'chase' | 'attack' | 'leap' | 'crippled' | 'staggered' | 'dead'

export const CRIPPLE_DURATION = 60 // seconds on its knees before it regenerates and rises
export const STAGGER_DURATION = 3 // seconds frozen by a spear blast; wounds are kept

export interface TitanState {
  id: number
  kind: TitanKind
  pos: Vector3 // feet
  vel: Vector3
  facing: number // yaw, forward = (sin, 0, cos)
  height: number
  hp: number
  maxHp: number
  state: TitanBehavior
  stateTime: number
  attackCooldown: number
  leapCooldown: number
  wanderTimer: number
  ankles: [boolean, boolean]
  crippleTimer: number
  staggerTimer: number
  avoidTimer: number
  /**
   * The civilian this titan is hunting, or null when it is hunting a soldier (or nobody).
   * It lives here rather than in a side table because a chase is titan state: the run save
   * carries it, and the soldier's chase-token pool has to know that a titan already stalking
   * someone in the street is NOT engaged with you — otherwise it gets handed a token, turns
   * around, and the district is never in any danger at all.
   */
  prey: number | null
  /** Seconds of heavy-lidded quiet after a meal, during which it hunts nobody. */
  satiated: number
  /** Street-grid waypoints toward the player while chasing (world x/z pairs). */
  path: [number, number][] | null
  pathIndex: number
  repathTimer: number
}

/** The stat block the titan state machine runs on; bosses override it per BossSpec. */
export interface KindStats {
  aggro: number
  turn: number
  walk: number
  swatRest: number
  leaps: boolean
  leapY: number
}

/**
 * The titan kinds, as a registry rather than a bare table: a kind is content, so it must
 * say what it does in multiplayer like every other piece of content (stance.ts, ADR 0003).
 * The shifter entry's stats are a baseline — each boss passes its own into stepTitan.
 */
export interface TitanKindSpec {
  id: TitanKind
  name: string
  stats: KindStats
  coop: CoopStance
}

export const TITAN_KINDS: TitanKindSpec[] = [
  {
    id: 'normal',
    name: 'Pure Titan',
    stats: { aggro: 55, turn: 1.4, walk: 0.2, swatRest: 2.2, leaps: false, leapY: 13 },
    coop: { kind: 'shared', note: 'Hunts its nearest soldier; chase tokens are per-soldier.' },
  },
  {
    id: 'abnormal',
    name: 'Aberrant',
    stats: { aggro: 130, turn: 2.2, walk: 0.38, swatRest: 1.2, leaps: true, leapY: 13 },
    coop: { kind: 'shared', note: 'Same, with the longer aggro leash and the leap.' },
  },
  {
    id: 'shifter',
    name: 'Shifter',
    stats: { aggro: 10000, turn: 1.8, walk: 0.24, swatRest: 1.8, leaps: false, leapY: 13 },
    coop: {
      kind: 'adapted',
      note: 'A Shifter never yields its chase token, and its part pools scale with the squad (rosterHpScale) so a four-hand fight lasts a fight. Its abilities target the nearest soldier and wound every soldier in the radius.',
    },
  },
]

export const KIND_STATS: Record<TitanKind, KindStats> = Object.fromEntries(
  TITAN_KINDS.map((k) => [k.id, k.stats]),
) as Record<TitanKind, KindStats>

export function aggroRange(kind: TitanKind): number {
  return KIND_STATS[kind].aggro
}

export interface TitanEvent {
  type: 'swat'
  titanId: number
  pos: Vector3
  radius: number
}

export const SWAT_WINDUP = 0.45
export const TURN_RATE = { normal: 1.4, abnormal: 2.2 } // rad/s: titans commit to turns

function turnToward(t: TitanState, targetYaw: number, dt: number, rate: number): void {
  let delta = targetYaw - t.facing
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  t.facing += Math.max(-rate * dt, Math.min(rate * dt, delta))
}

export function createTitan(opts: {
  id: number
  kind: TitanKind
  height: number
  x: number
  z: number
}): TitanState {
  return {
    id: opts.id,
    kind: opts.kind,
    pos: new Vector3(opts.x, 0, opts.z),
    vel: new Vector3(),
    facing: Math.atan2(-opts.x, -opts.z), // face the city center on spawn
    height: opts.height,
    hp: 100,
    maxHp: 100,
    state: 'wander',
    stateTime: 0,
    attackCooldown: 0,
    leapCooldown: KIND_STATS[opts.kind].leaps ? 2 : 0,
    wanderTimer: 0,
    ankles: [false, false],
    crippleTimer: 0,
    staggerTimer: 0,
    avoidTimer: 0,
    prey: null,
    satiated: 0,
    path: null,
    pathIndex: 0,
    repathTimer: 0,
  }
}

export function forwardOf(t: TitanState): Vector3 {
  return new Vector3(Math.sin(t.facing), 0, Math.cos(t.facing))
}

export function napeCenter(t: TitanState): Vector3 {
  const napeHeight = t.state === 'crippled' ? 0.6 : 0.82 // kneeling drops the nape into reach
  return t.pos
    .clone()
    .add(new Vector3(0, t.height * napeHeight, 0))
    .addScaledVector(forwardOf(t), -t.height * 0.09)
}

/** World position of an ankle (side 0 = left, 1 = right). */
export function anklePos(t: TitanState, side: 0 | 1): Vector3 {
  const lateral = (side === 0 ? -1 : 1) * t.height * 0.12
  const fwd = forwardOf(t)
  return new Vector3(
    t.pos.x + fwd.z * lateral,
    t.pos.y + t.height * 0.06,
    t.pos.z - fwd.x * lateral,
  )
}

/** Both ankles cut: down it goes. Returns true if this call crippled it. */
export function crippleTitan(t: TitanState): boolean {
  if (t.state === 'crippled' || t.hp <= 0) return false
  if (!(t.ankles[0] && t.ankles[1])) return false
  t.state = 'crippled'
  t.stateTime = 0
  t.crippleTimer = CRIPPLE_DURATION
  t.vel.set(0, 0, 0)
  return true
}

export function bodyCenter(t: TitanState): Vector3 {
  return t.pos.clone().add(new Vector3(0, t.height * 0.55, 0))
}

/**
 * A spear blast freezes a titan without the cripple's heal-on-rise. Kneeling, leaping and
 * dead titans are exempt: cripple already has the titan helpless (and rising would erase
 * it), and freezing a leap would leave the titan hanging mid-air. A second blast refreshes
 * the timer but reports false so callers do not double-announce it.
 */
export function staggerTitan(t: TitanState): boolean {
  if (t.hp <= 0 || t.state === 'crippled' || t.state === 'leap' || t.state === 'dead') return false
  const already = t.state === 'staggered'
  t.state = 'staggered'
  t.staggerTimer = STAGGER_DURATION
  t.stateTime = 0
  t.vel.set(0, 0, 0)
  t.path = null
  return !already
}

/** How wide a titan is at the ankles, for everything that has to push it out of a solid. */
export function titanRadius(t: Pick<TitanState, 'height'>): number {
  return Math.min(2.6, Math.max(1, t.height * 0.12))
}

/** Walks the titan forward and slides it out of any building it hits; corridors only. */
function walkTitan(t: TitanState, distance: number, arena: Arena | undefined, rng: () => number): void {
  const before = t.pos.clone()
  t.pos.addScaledVector(forwardOf(t), distance)
  if (!arena || t.pos.y > 0.1) return
  const radius = titanRadius(t)
  resolveBuildingCollision(arena, t.pos, t.vel, radius, true)
  // and keep it on ground it fits on: inside the wall, and under rock tall enough for it
  clampTitanToArena(arena, t.pos, t.vel, t.height)
  if (t.pos.distanceTo(before) < distance * 0.4 && t.avoidTimer <= 0) {
    // pinned against a wall: commit to a sidestep for a moment instead of grinding
    t.avoidTimer = 0.5 + rng() * 0.5
    t.facing += (rng() < 0.5 ? 1 : -1) * (0.7 + rng() * 0.7)
  }
}

export function stepTitan(
  t: TitanState,
  playerPos: Vector3,
  dt: number,
  rng: () => number,
  arena?: Arena,
  nav?: NavGrid,
  allowChase = true,
  relentless = false,
  stats?: KindStats,
): TitanEvent[] {
  const S = stats ?? KIND_STATS[t.kind]
  if (t.hp <= 0) {
    if (t.state !== 'dead') {
      t.state = 'dead'
      t.stateTime = 0
    }
    t.stateTime += dt
    return []
  }

  const events: TitanEvent[] = []
  t.stateTime += dt
  t.attackCooldown = Math.max(0, t.attackCooldown - dt)
  t.leapCooldown = Math.max(0, t.leapCooldown - dt)
  t.avoidTimer = Math.max(0, t.avoidTimer - dt)

  // grounded titans track the terrain base, so canal waders sink to the bed instead
  // of hovering over the water (leaps own their own vertical arc)
  if (arena && t.state !== 'leap' && t.pos.y <= 0.1) {
    const baseY = baseGroundY(arena, t.pos.x, t.pos.z)
    t.pos.y += (baseY - t.pos.y) * Math.min(1, dt * 4)
  }

  const dx = playerPos.x - t.pos.x
  const dz = playerPos.z - t.pos.z
  const horizDist = Math.hypot(dx, dz)
  const aggro = S.aggro
  const reach = t.height * 0.5
  const walkSpeed = t.height * S.walk

  // deeply embedded in a building (bad spawn, old save): wade straight out. This must
  // check the PHYSICAL footprint, not nav walkability — clearance cells near corners are
  // unwalkable but legitimate to brush, and wading there would fight the path steering.
  if (
    nav &&
    arena &&
    t.pos.y <= 0.1 &&
    (t.state === 'wander' || t.state === 'chase') &&
    insideBuildingXZ(arena, t.pos.x, t.pos.z, -0.3)
  ) {
    const [wx, wz] = nearestWalkable(nav, t.pos.x, t.pos.z)
    const yaw = Math.atan2(wx - t.pos.x, wz - t.pos.z)
    turnToward(t, yaw, dt * 4, S.turn)
    t.pos.x += Math.sin(yaw) * walkSpeed * dt
    t.pos.z += Math.cos(yaw) * walkSpeed * dt
    return events
  }

  switch (t.state) {
    case 'wander': {
      t.wanderTimer -= dt
      if (t.wanderTimer <= 0) {
        t.facing = rng() * Math.PI * 2
        t.wanderTimer = 2 + rng() * 4
      }
      walkTitan(t, walkSpeed * 0.5 * dt, arena, rng)
      // relentless (The Culling): the aggro range is the whole map
      if ((horizDist < aggro || relentless) && allowChase) {
        t.state = 'chase'
        t.stateTime = 0
        t.path = null
        t.repathTimer = 0
      }
      break
    }
    case 'chase': {
      if (!allowChase) {
        // the chase token went to a closer titan: fall back to wandering
        t.state = 'wander'
        t.stateTime = 0
        t.path = null
        break
      }
      // steer along the street grid when the direct line is blocked
      let steerX = dx
      let steerZ = dz
      if (nav) {
        t.repathTimer -= dt
        if (!t.path || t.repathTimer <= 0) {
          t.path = lineWalkable(nav, t.pos.x, t.pos.z, playerPos.x, playerPos.z)
            ? null // clear line of sight: walk straight at the player
            : findPath(nav, t.pos.x, t.pos.z, playerPos.x, playerPos.z)
          t.pathIndex = 0
          t.repathTimer = 1.25
        }
        if (t.path) {
          while (
            t.pathIndex < t.path.length &&
            Math.hypot(t.path[t.pathIndex]![0] - t.pos.x, t.path[t.pathIndex]![1] - t.pos.z) < 3.5
          ) {
            t.pathIndex++
          }
          const waypoint = t.path[t.pathIndex]
          if (waypoint) {
            steerX = waypoint[0] - t.pos.x
            steerZ = waypoint[1] - t.pos.z
          }
        }
      }
      if (t.avoidTimer <= 0) turnToward(t, Math.atan2(steerX, steerZ), dt, S.turn)
      if (S.leaps && t.leapCooldown <= 0 && horizDist > 12 && horizDist < 80) {
        t.state = 'leap'
        t.stateTime = 0
        const inv = 1 / horizDist
        const speed = Math.min(35, horizDist * 1.2)
        t.vel.set(dx * inv * speed, S.leapY, dz * inv * speed)
        t.leapCooldown = 3 + rng() * 2
        break
      }
      if (horizDist < reach && playerPos.y < t.height * 1.15 && t.attackCooldown <= 0) {
        t.state = 'attack'
        t.stateTime = 0
        break
      }
      if (horizDist > reach * 0.6) {
        walkTitan(t, walkSpeed * 1.35 * dt, arena, rng)
      }
      // relentless titans never abandon a chase, however far the soldier runs
      if (!relentless && horizDist > aggro * 1.5) {
        t.state = 'wander'
        t.path = null
      }
      break
    }
    case 'attack': {
      turnToward(t, Math.atan2(dx, dz), dt, S.turn)
      if (t.stateTime >= SWAT_WINDUP) {
        const swatPos = t.pos
          .clone()
          .addScaledVector(forwardOf(t), reach * 0.6)
          .add(new Vector3(0, t.height * 0.3, 0))
        events.push({ type: 'swat', titanId: t.id, pos: swatPos, radius: t.height * 0.35 })
        t.attackCooldown = S.swatRest
        t.state = 'chase'
        t.stateTime = 0
      }
      break
    }
    case 'leap': {
      t.vel.y += GRAVITY * dt
      t.pos.addScaledVector(t.vel, dt)
      if (arena) {
        // a leap owns its arc, but not the world: airborne it still has to get past the
        // bark and the rock like everything else. The ceiling margin is the titan's own
        // height, because pos.y is its feet and it is the head that hits the roof.
        resolveBuildingCollision(arena, t.pos, t.vel, titanRadius(t), true)
        clampToCeiling(arena, t.pos, t.vel, t.height + TITAN_HEADROOM)
        clampTitanToArena(arena, t.pos, t.vel, t.height)
      }
      if (t.pos.y <= 0) {
        t.pos.y = 0
        t.vel.set(0, 0, 0)
        t.state = 'chase'
        t.stateTime = 0
      }
      break
    }
    case 'staggered': {
      // blast-frozen: no movement, no attacks; hp stays wherever the blast left it
      t.staggerTimer -= dt
      if (t.staggerTimer <= 0) {
        t.state = 'chase'
        t.stateTime = 0
        t.repathTimer = 0
        t.attackCooldown = Math.max(t.attackCooldown, 0.5)
      }
      break
    }
    case 'crippled': {
      // helpless on its knees; heals and rises if the nape isn't taken in time
      t.crippleTimer -= dt
      if (t.crippleTimer <= 0) {
        t.hp = t.maxHp
        t.ankles = [false, false]
        t.state = 'chase'
        t.stateTime = 0
        t.attackCooldown = 1
      }
      break
    }
    case 'dead':
      break
  }
  return events
}

/** The body cylinder hooks can anchor to; exported so the dev hitbox overlay draws it. */
export function hookBody(t: TitanState): { radius: number; top: number } {
  return { radius: Math.max(0.8, t.height * 0.14), top: t.height * 0.92 }
}

/** Ray vs the titan's body cylinder; returns hit distance or null. Lets hooks anchor to titans. */
export function raycastTitan(
  t: TitanState,
  origin: Vector3,
  dir: Vector3,
  maxRange: number,
): number | null {
  if (t.hp <= 0) return null
  const { radius, top } = hookBody(t)
  const ox = origin.x - t.pos.x
  const oz = origin.z - t.pos.z
  const a = dir.x * dir.x + dir.z * dir.z
  if (a < 1e-9) return null
  const b = 2 * (ox * dir.x + oz * dir.z)
  const c = ox * ox + oz * oz - radius * radius
  const disc = b * b - 4 * a * c
  if (disc < 0) return null
  const sqrtDisc = Math.sqrt(disc)
  for (const hit of [(-b - sqrtDisc) / (2 * a), (-b + sqrtDisc) / (2 * a)]) {
    if (hit <= 0.01 || hit > maxRange) continue
    const y = origin.y + dir.y * hit
    if (y >= t.pos.y && y <= t.pos.y + top) return hit
  }
  return null
}
