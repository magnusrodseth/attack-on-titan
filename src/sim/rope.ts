import { Vector3 } from 'three'

export interface Hook {
  state: 'none' | 'attached'
  anchor: Vector3
  length: number
  /** When set, the anchor tracks this titan (see updateTitanAnchor). */
  titanId: number | null
  local: Vector3
}

/** The shape rope needs from a titan; avoids importing the full titan module. */
export interface TitanAnchorTarget {
  id: number
  pos: Vector3
  facing: number
}

export function createHook(): Hook {
  return { state: 'none', anchor: new Vector3(), length: 0, titanId: null, local: new Vector3() }
}

export function attachHook(hook: Hook, anchor: Vector3, playerPos: Vector3): void {
  hook.state = 'attached'
  hook.anchor.copy(anchor)
  hook.length = anchor.distanceTo(playerPos)
  hook.titanId = null
}

/** Expresses a world point in the titan's local frame (position + facing), for anchors that ride it. */
export function worldToTitanLocal(titan: TitanAnchorTarget, point: Vector3, out: Vector3): Vector3 {
  const rel = point.clone().sub(titan.pos)
  const cos = Math.cos(-titan.facing)
  const sin = Math.sin(-titan.facing)
  return out.set(cos * rel.x + sin * rel.z, rel.y, -sin * rel.x + cos * rel.z)
}

/** Re-derives the world position of a titan-local point from the titan's current pose. */
export function titanLocalToWorld(titan: TitanAnchorTarget, local: Vector3, out: Vector3): Vector3 {
  const cos = Math.cos(titan.facing)
  const sin = Math.sin(titan.facing)
  return out.set(
    titan.pos.x + cos * local.x + sin * local.z,
    titan.pos.y + local.y,
    titan.pos.z - sin * local.x + cos * local.z,
  )
}

export function attachHookToTitan(
  hook: Hook,
  titan: TitanAnchorTarget,
  point: Vector3,
  playerPos: Vector3,
): void {
  attachHook(hook, point, playerPos)
  hook.titanId = titan.id
  worldToTitanLocal(titan, point, hook.local)
}

/** Re-derives the world anchor from the titan's current position and facing. */
export function updateTitanAnchor(hook: Hook, titan: TitanAnchorTarget): void {
  titanLocalToWorld(titan, hook.local, hook.anchor)
}

export function releaseHook(hook: Hook): void {
  hook.state = 'none'
  hook.titanId = null
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
