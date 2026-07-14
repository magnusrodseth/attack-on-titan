import { Vector3 } from 'three'
import type { Arena } from './city'
import { baseGroundY } from './city'
import type { NavGrid } from './nav'
import { isWalkable, nearestWalkable } from './nav'
import type { Rng } from './rng'
import type { TitanState } from './titan'
import { grabHoldPoint } from './grab'

/**
 * The people in the streets.
 *
 * The district was scenery, and the only thing at stake in a wave was your own hearts. Now
 * every titan that is not hunting a soldier is hunting someone who cannot fight back, and a
 * titan that catches one **stands still to eat**, which makes it the easiest nape in the
 * game. That is the bargain this whole system exists to create: letting a titan feed is
 * tactically correct and morally awful, and nothing here is allowed to resolve that for the
 * player.
 *
 * The one rule that makes it bite (user ruling, 2026-07-14): a terrified civilian runs
 * **toward the nearest soldier**, because a soldier is safety. So every rescue drags a
 * screaming crowd onto your position, and the titans follow them in. The safest place to
 * stand is wherever nobody needs you.
 */

export type CivilianState =
  /** Going about their day: door to plaza to market and back. */
  | 'walk'
  /** A titan is close: running at the nearest soldier, because that is where safety is. */
  | 'flee'
  /** In a fist, lifted to nape height, with a few seconds left. */
  | 'held'
  /** Calm again, and carrying what they have to the nearest station. */
  | 'delivering'
  /** Reached a station: off the streets, and their supply is on the rack. */
  | 'safe'
  | 'dead'

export interface Civilian {
  id: number
  pos: Vector3
  facing: number
  state: CivilianState
  /** Where they are walking; regenerated when reached. */
  goal: [number, number] | null
  /** The titan whose fist has them, and the seconds left before the bite. */
  heldBy: number | null
  window: number
  /** Seconds since a titan was last close enough to panic them. */
  calm: number
  /** Which station they are carrying to (index into arena.stations). */
  station: number | null
}

/** A stroll. They are not in a hurry until they are. */
export const FOLK_WALK_SPEED = 1.1
/**
 * A terrified sprint, and it is not enough — deliberately. A titan chases at
 * `height x walk x 1.35`: about 4 m/s for a 15 m pure, and 2.3 m/s even for the smallest
 * one in the roster. A crowd that could outrun that would save itself, and a soldier who is
 * not needed is not in a game about being needed.
 *
 * So they lose ground, always. They are not athletes; they are bakers and children carrying
 * other children. The only thing in the district that can outrun a titan is you.
 */
export const FOLK_FLEE_SPEED = 2.1
/** A titan inside this radius panics them. */
export const FOLK_PANIC_RADIUS = 55
/** No titan near for this long and they collect themselves and make for a station. */
export const FOLK_CALM_SECONDS = 5
/** Close enough to a station to hand over what they carry. */
export const FOLK_DELIVER_RADIUS = 7
/**
 * The window. From the fist closing to the bite. Long enough to fly in from across a block,
 * short enough that you cannot save everyone, which is the entire design.
 */
export const DEVOUR_SECONDS = 3.6
/** How close a titan's swat has to land to catch someone. */
export const FOLK_CATCH_RADIUS = 4.5

export function createCivilian(id: number, x: number, z: number): Civilian {
  return {
    id,
    pos: new Vector3(x, 0, z),
    facing: 0,
    state: 'walk',
    goal: null,
    heldBy: null,
    window: 0,
    calm: FOLK_CALM_SECONDS,
    station: null,
  }
}

/** Alive and on the streets: the ones a titan can still reach. */
export function isStanding(c: Civilian): boolean {
  return c.state === 'walk' || c.state === 'flee' || c.state === 'delivering'
}

/** Everyone still breathing, including the one currently in a fist. */
export function isAlive(c: Civilian): boolean {
  return c.state !== 'dead' && c.state !== 'safe'
}

/**
 * Seeds a district's population on walkable street cells, spread across the whole city so no
 * quarter is empty and no quarter is a crowd. Deterministic: the same seed populates the same
 * streets with the same people, which means a replay kills the same people. The fiction makes
 * that grim and it stays that way.
 */
export function populate(count: number, arena: Arena, nav: NavGrid, rng: Rng): Civilian[] {
  const folk: Civilian[] = []
  const radius = arena.wallRadius * 0.88
  for (let i = 0; folk.length < count && i < count * 12; i++) {
    const angle = rng() * Math.PI * 2
    // sqrt keeps them evenly spread by area rather than bunched at the plaza
    const dist = Math.sqrt(rng()) * radius
    const [x, z] = nearestWalkable(nav, Math.cos(angle) * dist, Math.sin(angle) * dist)
    if (!isWalkable(nav, x, z)) continue
    folk.push(createCivilian(folk.length + 1, x, z))
  }
  return folk
}

/** A fresh errand somewhere on the street grid. */
function newGoal(c: Civilian, nav: NavGrid, rng: Rng): void {
  const angle = rng() * Math.PI * 2
  const dist = 18 + rng() * 55
  const [x, z] = nearestWalkable(nav, c.pos.x + Math.cos(angle) * dist, c.pos.z + Math.sin(angle) * dist)
  c.goal = [x, z]
}

/** Steps a civilian toward a point and returns true when they are basically on it. */
function moveToward(
  c: Civilian,
  x: number,
  z: number,
  speed: number,
  dt: number,
  arena: Arena,
  nav: NavGrid,
): boolean {
  const dx = x - c.pos.x
  const dz = z - c.pos.z
  const dist = Math.hypot(dx, dz)
  if (dist < 0.6) return true
  const step = Math.min(dist, speed * dt)
  const nx = c.pos.x + (dx / dist) * step
  const nz = c.pos.z + (dz / dist) * step
  // they keep to the streets: a civilian never walks through a wall, and a panicking one
  // slides along it rather than sticking to it
  if (isWalkable(nav, nx, nz)) {
    c.pos.x = nx
    c.pos.z = nz
  } else if (isWalkable(nav, nx, c.pos.z)) {
    c.pos.x = nx
  } else if (isWalkable(nav, c.pos.x, nz)) {
    c.pos.z = nz
  }
  c.pos.y = baseGroundY(arena, c.pos.x, c.pos.z)
  c.facing = Math.atan2(dx, dz)
  return false
}

export interface FolkStepContext {
  dt: number
  arena: Arena
  nav: NavGrid
  rng: Rng
  titans: TitanState[]
  /** Where safety is: the living soldiers. A terrified civilian runs at the nearest one. */
  soldiers: Vector3[]
  stations: Vector3[]
}

export interface FolkStepResult {
  /** Civilians who reached a station this tick, with the station they stocked. */
  delivered: { civilianId: number; station: number }[]
  /** Civilians whose window ran out this tick. */
  devoured: { civilianId: number; titanId: number }[]
}

/**
 * One tick of the crowd. Held civilians burn their window; everyone else walks, panics, runs
 * at the nearest soldier, or carries their supply home.
 */
export function stepFolk(folk: Civilian[], ctx: FolkStepContext): FolkStepResult {
  const out: FolkStepResult = { delivered: [], devoured: [] }
  const { dt, arena, nav, rng, titans, soldiers, stations } = ctx

  for (const c of folk) {
    if (c.state === 'dead' || c.state === 'safe') continue

    if (c.state === 'held') {
      const holder = titans.find((t) => t.id === c.heldBy)
      if (!holder || holder.hp <= 0) continue // the world resolves the rescue, not us
      c.pos.copy(grabHoldPoint(holder))
      c.facing = holder.facing + Math.PI
      c.window -= dt
      if (c.window <= 0) {
        c.state = 'dead'
        out.devoured.push({ civilianId: c.id, titanId: holder.id })
      }
      continue
    }

    // how close the nearest titan is decides everything else
    let threat = Infinity
    for (const t of titans) {
      if (t.hp <= 0 || t.state === 'dead') continue
      const d = Math.hypot(t.pos.x - c.pos.x, t.pos.z - c.pos.z)
      if (d < threat) threat = d
    }
    if (threat <= FOLK_PANIC_RADIUS) {
      c.calm = 0
      if (c.state !== 'flee') {
        c.state = 'flee'
        c.station = null
      }
    } else {
      c.calm += dt
    }

    if (c.state === 'flee') {
      // toward the nearest soldier, because a soldier is safety. This is why saving people
      // is dangerous: they bring the titans to you.
      let best: Vector3 | null = null
      let bestDist = Infinity
      for (const s of soldiers) {
        const d = Math.hypot(s.x - c.pos.x, s.z - c.pos.z)
        if (d < bestDist) {
          best = s
          bestDist = d
        }
      }
      if (best && bestDist > 4) {
        moveToward(c, best.x, best.z, FOLK_FLEE_SPEED, dt, arena, nav)
      } else if (!best) {
        // nobody left to run to: scatter away from the nearest titan instead
        const away = nearestTitanAway(c, titans)
        if (away) moveToward(c, away[0], away[1], FOLK_FLEE_SPEED, dt, arena, nav)
      }
      if (c.calm >= FOLK_CALM_SECONDS) {
        c.state = 'delivering'
        c.station = nearestStationIndex(c, stations)
      }
      continue
    }

    if (c.state === 'delivering') {
      const index = c.station ?? nearestStationIndex(c, stations)
      c.station = index
      const station = stations[index]
      if (!station) {
        c.state = 'walk'
        continue
      }
      moveToward(c, station.x, station.z, FOLK_WALK_SPEED * 1.8, dt, arena, nav)
      if (Math.hypot(station.x - c.pos.x, station.z - c.pos.z) <= FOLK_DELIVER_RADIUS) {
        c.state = 'safe'
        out.delivered.push({ civilianId: c.id, station: index })
      }
      continue
    }

    // walk: an ordinary day in a city with a wall around it
    if (!c.goal) newGoal(c, nav, rng)
    if (c.goal && moveToward(c, c.goal[0], c.goal[1], FOLK_WALK_SPEED, dt, arena, nav)) {
      c.goal = null
    }
  }

  return out
}

function nearestStationIndex(c: Civilian, stations: Vector3[]): number {
  let best = 0
  let bestDist = Infinity
  for (const [i, s] of stations.entries()) {
    const d = Math.hypot(s.x - c.pos.x, s.z - c.pos.z)
    if (d < bestDist) {
      best = i
      bestDist = d
    }
  }
  return best
}

/** A point directly away from the nearest titan, for when there is no soldier left to reach. */
function nearestTitanAway(c: Civilian, titans: TitanState[]): [number, number] | null {
  let nearest: TitanState | null = null
  let bestDist = Infinity
  for (const t of titans) {
    if (t.hp <= 0) continue
    const d = Math.hypot(t.pos.x - c.pos.x, t.pos.z - c.pos.z)
    if (d < bestDist) {
      nearest = t
      bestDist = d
    }
  }
  if (!nearest) return null
  const dx = c.pos.x - nearest.pos.x
  const dz = c.pos.z - nearest.pos.z
  const len = Math.hypot(dx, dz) || 1
  return [c.pos.x + (dx / len) * 30, c.pos.z + (dz / len) * 30]
}

/** The fist closes. */
export function seize(c: Civilian, titan: TitanState): void {
  c.state = 'held'
  c.heldBy = titan.id
  c.window = DEVOUR_SECONDS
  c.pos.copy(grabHoldPoint(titan))
}

/** Cut loose: dropped, terrified, and already running for the nearest soldier. */
export function release(c: Civilian): void {
  c.state = 'flee'
  c.heldBy = null
  c.window = 0
  c.calm = 0
}
