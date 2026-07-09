import { Vector3 } from 'three'
import { GRAVITY } from './constants'

export type TitanKind = 'normal' | 'abnormal'
export type TitanBehavior = 'wander' | 'chase' | 'attack' | 'leap' | 'dead'

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
}

export interface TitanEvent {
  type: 'swat'
  titanId: number
  pos: Vector3
  radius: number
}

export const SWAT_WINDUP = 0.45

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
    leapCooldown: opts.kind === 'abnormal' ? 2 : 0,
    wanderTimer: 0,
  }
}

export function forwardOf(t: TitanState): Vector3 {
  return new Vector3(Math.sin(t.facing), 0, Math.cos(t.facing))
}

export function napeCenter(t: TitanState): Vector3 {
  return t.pos
    .clone()
    .add(new Vector3(0, t.height * 0.82, 0))
    .addScaledVector(forwardOf(t), -t.height * 0.09)
}

export function bodyCenter(t: TitanState): Vector3 {
  return t.pos.clone().add(new Vector3(0, t.height * 0.55, 0))
}

export function stepTitan(
  t: TitanState,
  playerPos: Vector3,
  dt: number,
  rng: () => number,
): TitanEvent[] {
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

  const dx = playerPos.x - t.pos.x
  const dz = playerPos.z - t.pos.z
  const horizDist = Math.hypot(dx, dz)
  const aggro = t.kind === 'abnormal' ? 130 : 55
  const reach = t.height * 0.5
  const walkSpeed = t.height * (t.kind === 'abnormal' ? 0.5 : 0.28)

  switch (t.state) {
    case 'wander': {
      t.wanderTimer -= dt
      if (t.wanderTimer <= 0) {
        t.facing = rng() * Math.PI * 2
        t.wanderTimer = 2 + rng() * 4
      }
      t.pos.addScaledVector(forwardOf(t), walkSpeed * 0.5 * dt)
      if (horizDist < aggro) {
        t.state = 'chase'
        t.stateTime = 0
      }
      break
    }
    case 'chase': {
      t.facing = Math.atan2(dx, dz)
      if (t.kind === 'abnormal' && t.leapCooldown <= 0 && horizDist > 12 && horizDist < 80) {
        t.state = 'leap'
        t.stateTime = 0
        const inv = 1 / horizDist
        const speed = Math.min(35, horizDist * 1.2)
        t.vel.set(dx * inv * speed, 13, dz * inv * speed)
        t.leapCooldown = 3 + rng() * 2
        break
      }
      if (horizDist < reach && playerPos.y < t.height * 1.15 && t.attackCooldown <= 0) {
        t.state = 'attack'
        t.stateTime = 0
        break
      }
      if (horizDist > reach * 0.6) {
        t.pos.addScaledVector(forwardOf(t), walkSpeed * 1.6 * dt)
      }
      if (horizDist > aggro * 1.5) t.state = 'wander'
      break
    }
    case 'attack': {
      t.facing = Math.atan2(dx, dz)
      if (t.stateTime >= SWAT_WINDUP) {
        const swatPos = t.pos
          .clone()
          .addScaledVector(forwardOf(t), reach * 0.6)
          .add(new Vector3(0, t.height * 0.3, 0))
        events.push({ type: 'swat', titanId: t.id, pos: swatPos, radius: t.height * 0.35 })
        t.attackCooldown = t.kind === 'abnormal' ? 1.2 : 2.2
        t.state = 'chase'
        t.stateTime = 0
      }
      break
    }
    case 'leap': {
      t.vel.y += GRAVITY * dt
      t.pos.addScaledVector(t.vel, dt)
      if (t.pos.y <= 0) {
        t.pos.y = 0
        t.vel.set(0, 0, 0)
        t.state = 'chase'
        t.stateTime = 0
      }
      break
    }
    case 'dead':
      break
  }
  return events
}
