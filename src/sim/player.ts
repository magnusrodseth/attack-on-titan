import { Vector3 } from 'three'
import type { Arena } from './city'
import { clampToWall, groundHeightAt, resolveBuildingCollision } from './city'
import { EYE_HEIGHT, GRAVITY } from './constants'
import type { Hook } from './rope'
import { applyRopeConstraint, createHook, reelHook } from './rope'

export interface PlayerConfig {
  maxGas: number
  gasCanisters: number
  gasThrust: number
  gasBurn: number
  airBoostThrust: number
  runSpeed: number
  runAccel: number
  airControl: number
  jumpSpeed: number
  drag: number
  reelSpeed: number
  hookRange: number
  minRopeLength: number
  bladePairs: number
  bladeDurability: number
  killSpeed: number
  slashRange: number
  slashCooldown: number
  maxHp: number
  gasKillRefund: number
  speedCap: number
}

export const DEFAULT_PLAYER_CONFIG: PlayerConfig = {
  maxGas: 100,
  gasCanisters: 3,
  gasThrust: 40,
  gasBurn: 22,
  airBoostThrust: 24,
  runSpeed: 8,
  runAccel: 40,
  airControl: 14,
  jumpSpeed: 9,
  drag: 0.04,
  reelSpeed: 14,
  hookRange: 90,
  minRopeLength: 3,
  bladePairs: 4,
  bladeDurability: 6,
  killSpeed: 22,
  slashRange: 6,
  slashCooldown: 0.45,
  maxHp: 3,
  gasKillRefund: 0,
  speedCap: 75,
}

export interface InputState {
  move: Vector3
  lookDir: Vector3
  gas: boolean
  jump: boolean
  slash: boolean
  hookL: boolean
  hookR: boolean
  resupply: boolean
}

export function neutralInput(): InputState {
  return {
    move: new Vector3(),
    lookDir: new Vector3(0, 0, -1),
    gas: false,
    jump: false,
    slash: false,
    hookL: false,
    hookR: false,
    resupply: false,
  }
}

export interface PlayerState {
  pos: Vector3
  vel: Vector3
  hooks: [Hook, Hook]
  gas: number
  canisters: number
  blades: number
  bladeHp: number
  hp: number
  onGround: boolean
  slashTimer: number
  invulnTimer: number
  airTime: number
  config: PlayerConfig
}

export function createPlayer(config: PlayerConfig = { ...DEFAULT_PLAYER_CONFIG }): PlayerState {
  return {
    pos: new Vector3(0, EYE_HEIGHT, 26),
    vel: new Vector3(),
    hooks: [createHook(), createHook()],
    gas: config.maxGas,
    canisters: config.gasCanisters,
    blades: config.bladePairs,
    bladeHp: config.bladeDurability,
    hp: config.maxHp,
    onGround: true,
    slashTimer: 0,
    invulnTimer: 0,
    airTime: 0,
    config,
  }
}

export function attachedHooks(p: PlayerState): Hook[] {
  return p.hooks.filter((h) => h.state === 'attached')
}

/**
 * Rotates horizontal velocity toward a desired direction without changing its magnitude —
 * directional authority is what makes momentum movement feel controllable instead of slippery.
 */
function steerHorizontal(vel: Vector3, dir: Vector3, maxAngle: number): void {
  const speed = Math.hypot(vel.x, vel.z)
  if (speed < 0.5 || dir.lengthSq() === 0) return
  const current = Math.atan2(vel.z, vel.x)
  const target = Math.atan2(dir.z, dir.x)
  let delta = target - current
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  const turn = Math.max(-maxAngle, Math.min(maxAngle, delta))
  const angle = current + turn
  vel.x = Math.cos(angle) * speed
  vel.z = Math.sin(angle) * speed
}

export function stepPlayer(p: PlayerState, input: InputState, dt: number, arena: Arena): void {
  const cfg = p.config
  p.slashTimer = Math.max(0, p.slashTimer - dt)
  p.invulnTimer = Math.max(0, p.invulnTimer - dt)
  const wasOnGround = p.onGround
  const anchors = attachedHooks(p)

  p.vel.y += GRAVITY * dt

  // a dry tank swaps in a spare canister automatically; refills only at resupply
  if (p.gas <= 0 && p.canisters > 0) {
    p.canisters -= 1
    p.gas = cfg.maxGas
  }

  if (input.jump && wasOnGround) {
    p.vel.y = cfg.jumpSpeed
    p.onGround = false
  }

  const boosting = input.gas && p.gas > 0
  if (boosting) {
    const dir = new Vector3(input.move.x, 0, input.move.z)
    if (dir.lengthSq() === 0) dir.set(input.lookDir.x, 0, input.lookDir.z)
    if (dir.lengthSq() > 0) {
      dir.normalize()
      if (wasOnGround && anchors.length > 0) {
        // ODM launch: pop off the ground so the rope takes over from run friction
        p.vel.y = Math.max(p.vel.y, cfg.jumpSpeed * 0.7)
        p.onGround = false
      }
      p.vel.addScaledVector(dir, cfg.gasThrust * dt)
      p.gas = Math.max(0, p.gas - cfg.gasBurn * dt)
    }
  }

  const move = new Vector3(input.move.x, 0, input.move.z)
  if (move.lengthSq() > 0) move.normalize()
  if (wasOnGround && !boosting) {
    const horizSpeed = Math.hypot(p.vel.x, p.vel.z)
    if (move.lengthSq() > 0 && horizSpeed <= cfg.runSpeed + 1) {
      const target = move.clone().multiplyScalar(cfg.runSpeed)
      const delta = new Vector3(target.x - p.vel.x, 0, target.z - p.vel.z)
      const maxStep = cfg.runAccel * dt
      if (delta.length() > maxStep) delta.setLength(maxStep)
      p.vel.x += delta.x
      p.vel.z += delta.z
    } else {
      // above run speed (or idle) the ground is a skid, not a brake: momentum survives
      const decel = (move.lengthSq() > 0 ? 8 : 12) * dt
      const newSpeed = Math.max(0, horizSpeed - decel)
      if (horizSpeed > 1e-6) {
        const scale = newSpeed / horizSpeed
        p.vel.x *= scale
        p.vel.z *= scale
      }
      if (move.lengthSq() > 0) {
        steerHorizontal(p.vel, move, 2.4 * dt)
        p.vel.x += move.x * 24 * dt
        p.vel.z += move.z * 24 * dt
      }
    }
  } else if (move.lengthSq() > 0) {
    steerHorizontal(p.vel, move, 1.5 * dt)
    p.vel.addScaledVector(move, cfg.airControl * dt)
  }

  if (!wasOnGround) {
    p.vel.multiplyScalar(Math.max(0, 1 - cfg.drag * dt))
  }

  // the winch is automatic: slack ratchets up instantly, and the rope winds in at a
  // rate that grows with speed — holding a hook IS reeling; releasing it lets go
  const speedNow = p.vel.length()
  for (const hook of anchors) {
    const dist = p.pos.distanceTo(hook.anchor)
    if (dist < hook.length) hook.length = Math.max(cfg.minRopeLength, dist)
    const rate = cfg.reelSpeed * Math.min(1, (1.5 + speedNow * 0.18) / 14)
    reelHook(hook, rate * dt, cfg.minRopeLength)
  }

  if (p.vel.length() > cfg.speedCap) p.vel.setLength(cfg.speedCap)

  p.pos.addScaledVector(p.vel, dt)

  for (const hook of p.hooks) applyRopeConstraint(p.pos, p.vel, hook)
  resolveBuildingCollision(arena, p.pos, p.vel, 0.5)
  clampToWall(arena, p.pos, p.vel, 1)

  const ground = groundHeightAt(arena, p.pos.x, p.pos.z) + EYE_HEIGHT
  if (p.pos.y <= ground) {
    p.pos.y = ground
    if (p.vel.y < 0) p.vel.y = 0
    p.onGround = true
    p.airTime = 0
  } else {
    p.onGround = false
    p.airTime += dt
  }
}
