import { Vector3 } from 'three'
import type { Arena } from './city'
import { clampToWall, groundHeightAt, resolveBuildingCollision } from './city'
import { EYE_HEIGHT, GRAVITY } from './constants'
import type { Hook } from './rope'
import { applyRopeConstraint, createHook, reelHook } from './rope'

export interface PlayerConfig {
  maxGas: number
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
  gasThrust: 40,
  gasBurn: 22,
  airBoostThrust: 24,
  runSpeed: 8,
  runAccel: 40,
  airControl: 10,
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
  reel: boolean
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
    reel: false,
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

export function stepPlayer(p: PlayerState, input: InputState, dt: number, arena: Arena): void {
  const cfg = p.config
  p.slashTimer = Math.max(0, p.slashTimer - dt)
  p.invulnTimer = Math.max(0, p.invulnTimer - dt)
  const wasOnGround = p.onGround
  const anchors = attachedHooks(p)

  p.vel.y += GRAVITY * dt

  const hookedGas = input.gas && anchors.length > 0 && p.gas > 0
  if (input.gas) {
    if (wasOnGround && anchors.length === 0) {
      p.vel.y = cfg.jumpSpeed
      p.onGround = false
    } else if (p.gas > 0) {
      if (anchors.length > 0) {
        if (wasOnGround) {
          // ODM launch: pop off the ground so the rope takes over from run friction
          p.vel.y = Math.max(p.vel.y, cfg.jumpSpeed * 0.7)
          p.onGround = false
        }
        const pull = new Vector3()
        for (const hook of anchors) {
          pull.add(hook.anchor.clone().sub(p.pos).normalize())
        }
        if (pull.lengthSq() > 0) {
          pull.normalize()
          p.vel.addScaledVector(pull, cfg.gasThrust * dt)
        }
        p.gas = Math.max(0, p.gas - cfg.gasBurn * dt)
      } else if (!wasOnGround) {
        p.vel.addScaledVector(input.lookDir, cfg.airBoostThrust * dt)
        p.gas = Math.max(0, p.gas - cfg.gasBurn * 0.7 * dt)
      }
    }
  }

  const move = new Vector3(input.move.x, 0, input.move.z)
  if (move.lengthSq() > 0) move.normalize()
  if (wasOnGround && !hookedGas) {
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
        p.vel.x += move.x * 15 * dt
        p.vel.z += move.z * 15 * dt
      }
    }
  } else if (move.lengthSq() > 0) {
    p.vel.addScaledVector(move, cfg.airControl * dt)
  }

  if (!wasOnGround) {
    p.vel.multiplyScalar(Math.max(0, 1 - cfg.drag * dt))
  }

  if (input.reel) {
    for (const hook of anchors) reelHook(hook, cfg.reelSpeed * dt, cfg.minRopeLength)
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
