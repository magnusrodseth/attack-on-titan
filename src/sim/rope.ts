import { Vector3 } from 'three'

export interface Hook {
  state: 'none' | 'attached'
  anchor: Vector3
  length: number
}

export function createHook(): Hook {
  return { state: 'none', anchor: new Vector3(), length: 0 }
}

export function attachHook(hook: Hook, anchor: Vector3, playerPos: Vector3): void {
  hook.state = 'attached'
  hook.anchor.copy(anchor)
  hook.length = anchor.distanceTo(playerPos)
}

export function releaseHook(hook: Hook): void {
  hook.state = 'none'
}

/**
 * Position-based taut-rope constraint. Clamps to the rope sphere and removes only the
 * outward radial velocity component; tangential momentum passes through untouched, which
 * is what makes the swing feel like a pendulum instead of a parachute.
 */
export function applyRopeConstraint(pos: Vector3, vel: Vector3, hook: Hook): void {
  if (hook.state !== 'attached') return
  const radial = pos.clone().sub(hook.anchor)
  const dist = radial.length()
  if (dist <= hook.length || dist === 0) return
  radial.divideScalar(dist)
  pos.copy(hook.anchor).addScaledVector(radial, hook.length)
  const outwardSpeed = vel.dot(radial)
  if (outwardSpeed > 0) vel.addScaledVector(radial, -outwardSpeed)
}

export function reelHook(hook: Hook, amount: number, minLength: number): void {
  if (hook.state !== 'attached') return
  hook.length = Math.max(minLength, hook.length - amount)
}
