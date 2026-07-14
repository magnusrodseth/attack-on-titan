import { Vector3 } from 'three'
import type { PlayerState } from './player'
import type { TitanState } from './titan'
import { forwardOf } from './titan'
import { DEFAULT_GRAB_ESCAPE_PRESSES } from './constants'

// The grab: loiter slow or still inside a grounded titan's reach — on the street at its
// feet or hanging off its flank — and it plucks you into its fist. Escape is a mash QTE:
// fill the radial bar with GRAB_ESCAPE_PRESSES presses before the timer empties, or the
// squeeze costs GRAB_HP_COST hearts.

/** Seconds of slow loitering inside a titan's reach before the fist closes. */
export const GRAB_LINGER_SECONDS = 2.5
/** Speeds above this (m/s) read as flight, not loitering; the linger resets. */
export const GRAB_SPEED_LIMIT = 2.5
/** Fresh key presses needed to break the grip. */
export const GRAB_ESCAPE_PRESSES = DEFAULT_GRAB_ESCAPE_PRESSES
/** Seconds the fist gives you to mash before it squeezes. */
export const GRAB_ESCAPE_SECONDS = 3
/** Hearts the squeeze takes when the timer empties. */
export const GRAB_HP_COST = 2
/** Grace after any grab ends before loitering starts counting again. */
export const GRAB_REGRAB_COOLDOWN = 4

export interface GrabState {
  titanId: number
  presses: number
  timeLeft: number
}

/** Pre-grab bookkeeping: how long the soldier has loitered, and the post-grab grace. */
export interface GrabWatch {
  linger: number
  cooldown: number
}

export function createGrabWatch(): GrabWatch {
  return { linger: 0, cooldown: 0 }
}

/** Horizontal radius that counts as "in the titan's area". */
export function grabReach(t: TitanState): number {
  return Math.max(4, t.height * 0.5)
}

/** Grounded and able to act; a downed, frozen, dead or airborne titan has no free fist. */
function canGrab(t: TitanState): boolean {
  if (t.hp <= 0) return false
  if (t.kind === 'shifter') return false // bosses pressure through abilities, not the QTE
  return t.state === 'wander' || t.state === 'chase' || t.state === 'attack'
}

function inGrabZone(t: TitanState, pos: Vector3): boolean {
  if (Math.hypot(pos.x - t.pos.x, pos.z - t.pos.z) > grabReach(t)) return false
  const rel = pos.y - t.pos.y
  return rel >= 0 && rel <= t.height * 1.05
}

/**
 * Every titan whose reach a catchable (slow) soldier is idling in; empty while moving
 * fast. Game.ts holds ALL of their swats while the linger fills — titans reach for a
 * catchable soldier, they do not slap one (any slap would fling the soldier away and
 * the grab could never fire, least of all with several titans converging).
 */
export function findGrabCandidates(p: PlayerState, titans: TitanState[]): TitanState[] {
  if (p.vel.length() > GRAB_SPEED_LIMIT) return []
  return titans.filter((t) => canGrab(t) && inGrabZone(t, p.pos))
}

/** The titan whose fist closes when the linger fills: the nearest candidate. */
export function findGrabCandidate(p: PlayerState, titans: TitanState[]): TitanState | null {
  let nearest: TitanState | null = null
  let nearestDist = Infinity
  for (const t of findGrabCandidates(p, titans)) {
    const dist = Math.hypot(p.pos.x - t.pos.x, p.pos.z - t.pos.z)
    if (dist < nearestDist) {
      nearest = t
      nearestDist = dist
    }
  }
  return nearest
}

/**
 * Accrues loiter time while the soldier idles inside some titan's reach and returns the
 * grabbing titan the tick the linger fills. `blocked` ticks (invulnerable, mid-strike)
 * reset the clock, as does moving fast or stepping out of every titan's reach.
 */
export function updateGrabWatch(
  watch: GrabWatch,
  p: PlayerState,
  titans: TitanState[],
  dt: number,
  blocked: boolean,
): TitanState | null {
  if (watch.cooldown > 0) {
    watch.cooldown = Math.max(0, watch.cooldown - dt)
    watch.linger = 0
    return null
  }
  if (blocked) {
    watch.linger = 0
    return null
  }
  const nearest = findGrabCandidate(p, titans)
  if (!nearest) {
    watch.linger = 0
    return null
  }
  watch.linger += dt
  if (watch.linger < GRAB_LINGER_SECONDS) return null
  watch.linger = 0
  return nearest
}

export function startGrab(titan: TitanState): GrabState {
  return { titanId: titan.id, presses: 0, timeLeft: GRAB_ESCAPE_SECONDS }
}

/** Where the fist holds the soldier: chest height, out in front of the titan. */
export function grabHoldPoint(t: TitanState): Vector3 {
  return t.pos
    .clone()
    .addScaledVector(forwardOf(t), t.height * 0.22)
    .add(new Vector3(0, t.height * 0.62, 0))
}

/**
 * One held tick: a fresh press fills the bar, the timer drains. The press is counted
 * before the timer so the final mash on the last tick still breaks free.
 */
export function stepGrab(
  grab: GrabState,
  mashPressed: boolean,
  dt: number,
  escapePresses: number = GRAB_ESCAPE_PRESSES,
): 'held' | 'escaped' | 'failed' {
  if (mashPressed) grab.presses += 1
  if (grab.presses >= escapePresses) return 'escaped'
  grab.timeLeft -= dt
  if (grab.timeLeft <= 0) return 'failed'
  return 'held'
}
