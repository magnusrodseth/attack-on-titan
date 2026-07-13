import { Vector3 } from 'three'
import type { Arena } from './city'
import { groundHeightAt, raycastHookTarget } from './city'
import { EYE_HEIGHT } from './constants'
import type { PlayerState } from './player'
import type { TitanState } from './titan'
import { napeCenter } from './titan'

/**
 * Focus strike: spending a full focus charge on slow-mo offers one guaranteed hyper-dash.
 * While focus is active, a nape inside a generous aim cone with a clear line of sight
 * becomes a lock; firing rockets the soldier along a path that re-aims at the nape every
 * step (a spent 3-kill charge must never whiff on titan AI), kills on passage, and carries
 * on out the far side with swing-worthy momentum.
 */

export const STRIKE_CONE_DEG = 4
const STRIKE_CONE_COS = Math.cos((STRIKE_CONE_DEG * Math.PI) / 180)
export const STRIKE_RANGE = 60
/** Below this the nape is already in slash range; the dash would be a camera hiccup. */
const STRIKE_MIN_RANGE = 3
export const STRIKE_SPEED = 130 // m/s: the whole dash is over in about a quarter second
export const STRIKE_EXIT_DIST = 10
export const STRIKE_EXIT_SPEED = 26

export interface StrikeState {
  titanId: number
  phase: 'approach' | 'exit'
  /** Travel direction; re-aimed at the nape every step while approaching. */
  dir: Vector3
  exitRemaining: number
}

/**
 * The titan whose nape the crosshair is locked onto, or null. A lock needs the nape within
 * range, inside the aim cone, and unobstructed — line of sight doubles as the guarantee
 * that the dash path is clear of buildings.
 */
export function findStrikeTarget(
  pos: Vector3,
  lookDir: Vector3,
  titans: TitanState[],
  arena: Arena,
): number | null {
  if (lookDir.lengthSq() === 0) return null
  const aim = lookDir.clone().normalize()
  let bestId: number | null = null
  let bestCos = STRIKE_CONE_COS
  for (const t of titans) {
    // a Shifter's nape only exists as its final Weak Point; a guaranteed-kill dash would
    // bypass the whole part model (ADR 0002), so the lock never offers one
    if (t.hp <= 0 || t.kind === 'shifter') continue
    const to = napeCenter(t).sub(pos)
    const dist = to.length()
    if (dist < STRIKE_MIN_RANGE || dist > STRIKE_RANGE) continue
    to.divideScalar(dist)
    const cos = to.dot(aim)
    if (cos < bestCos) continue
    if (raycastHookTarget(arena, pos, to, dist - 0.5)) continue // something in the way
    bestCos = cos
    bestId = t.id
  }
  return bestId
}

export function createStrike(titan: TitanState, playerPos: Vector3): StrikeState {
  const dir = napeCenter(titan).sub(playerPos)
  if (dir.lengthSq() === 0) dir.set(0, 0, 1)
  return { titanId: titan.id, phase: 'approach', dir: dir.normalize(), exitRemaining: 0 }
}

export interface StrikeStepResult {
  /** Titan cut this step; the caller scores it and emits the kill event. */
  killed: TitanState | null
  oneCut: boolean
  /** True when the exit run finished and normal movement should resume. */
  done: boolean
}

/**
 * Advances the dash one tick, owning the player's position and velocity for its duration.
 * Approach homes on the (possibly moving) nape; passage kills and flips to a straight exit
 * run pre-clipped against buildings and ended early rather than tunneling into the ground.
 */
export function stepStrike(
  strike: StrikeState,
  p: PlayerState,
  titans: TitanState[],
  arena: Arena,
  dt: number,
): StrikeStepResult {
  const step = STRIKE_SPEED * dt
  const result: StrikeStepResult = { killed: null, oneCut: false, done: false }

  if (strike.phase === 'approach') {
    const titan = titans.find((t) => t.id === strike.titanId)
    if (!titan || titan.hp <= 0) {
      // the target died under the dash (a spear blast can do that): coast out with momentum
      strike.phase = 'exit'
      strike.exitRemaining = clipExit(strike, p.pos, arena)
    } else {
      const nape = napeCenter(titan)
      const to = nape.clone().sub(p.pos)
      const dist = to.length()
      if (dist > 1e-6) strike.dir.copy(to).divideScalar(dist)
      if (dist <= step) {
        result.killed = titan
        result.oneCut = titan.hp === titan.maxHp
        titan.hp = 0
        p.pos.copy(nape)
        strike.phase = 'exit'
        strike.exitRemaining = clipExit(strike, nape, arena)
      } else {
        p.pos.addScaledVector(strike.dir, step)
      }
    }
    p.vel.copy(strike.dir).multiplyScalar(STRIKE_SPEED)
    p.onGround = false
    return result
  }

  const move = Math.min(step, strike.exitRemaining)
  p.pos.addScaledVector(strike.dir, move)
  strike.exitRemaining -= move
  const ground = groundHeightAt(arena, p.pos.x, p.pos.z, p.pos.y - EYE_HEIGHT) + EYE_HEIGHT
  if (p.pos.y < ground) {
    p.pos.y = ground
    strike.exitRemaining = 0
  }
  if (strike.exitRemaining <= 0) {
    result.done = true
    p.vel.copy(strike.dir).multiplyScalar(STRIKE_EXIT_SPEED)
  } else {
    p.vel.copy(strike.dir).multiplyScalar(STRIKE_SPEED)
  }
  return result
}

/** Exit distance clipped a meter short of the first building (or the wall) in the way. */
function clipExit(strike: StrikeState, from: Vector3, arena: Arena): number {
  const hit = raycastHookTarget(arena, from, strike.dir, STRIKE_EXIT_DIST + 1)
  if (!hit) return STRIKE_EXIT_DIST
  return Math.max(0, from.distanceTo(hit) - 1)
}
