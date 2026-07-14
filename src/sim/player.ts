import { Vector3 } from 'three'
import type { Arena } from './city'
import { clampToCeiling, clampToWall, groundHeightAt, resolveBuildingCollision } from './city'
import {
  DEFAULT_BLAST_RADIUS,
  DEFAULT_GRAB_ESCAPE_PRESSES,
  EYE_HEIGHT,
  GRAVITY,
} from './constants'
import { LAMP_BATTERY_SECONDS } from './flashlight'
import type { Hook } from './rope'
import { applyRopeConstraint, createHook, reelHook } from './rope'

export interface PlayerConfig {
  maxGas: number
  gasCanisters: number
  /** Speed the Shift dash adds along the look direction. */
  boostImpulse: number
  runSpeed: number
  runAccel: number
  airControl: number
  /** Air input only ADDS speed below this; above it, steering redirects and nothing more. */
  airControlCeiling: number
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
  spearCapacity: number
  /** Blast radius of this soldier's thunder spears; captured onto the spear when it is fired. */
  blastRadius: number
  /** Mashes it takes to tear out of a titan's fist (grab.ts). Fewer is better. */
  grabEscapePresses: number
  /** Field kits carried per wave: a full restock with no station in sight. Zero by default. */
  fieldKits: number
}

// Balance anchored in swing physics (see docs/research/odm-mechanics.md): a natural
// pendulum bottoms out near 11 m/s, nape strikes need ~17 m/s, and sustained thrust
// beyond ~3g is blackout territory — so speed must be earned over several seconds.
export const DEFAULT_PLAYER_CONFIG: PlayerConfig = {
  maxGas: 100,
  gasCanisters: 3,
  boostImpulse: 13,
  runSpeed: 8,
  runAccel: 40,
  airControl: 14,
  airControlCeiling: 12,
  jumpSpeed: 9,
  drag: 0.05,
  reelSpeed: 10,
  hookRange: 90,
  minRopeLength: 3,
  bladePairs: 4,
  bladeDurability: 6,
  killSpeed: 17,
  slashRange: 6,
  slashCooldown: 0.45,
  maxHp: 5,
  gasKillRefund: 0,
  speedCap: 40,
  spearCapacity: 2, // two thunder spears, one per arm mount, like the source material
  blastRadius: DEFAULT_BLAST_RADIUS,
  grabEscapePresses: DEFAULT_GRAB_ESCAPE_PRESSES,
  fieldKits: 0, // earned, never issued: a stock soldier walks to a station like everyone else
}

export interface InputState {
  move: Vector3
  lookDir: Vector3
  gas: boolean
  jump: boolean
  focus: boolean
  slash: boolean
  fire: boolean
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
    focus: false,
    slash: false,
    fire: false,
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
  spears: number
  /** Flashlight battery, in seconds of night light; recharges only at resupply. */
  lamp: number
  /** Field kits still in the pouch this wave; refilled to config.fieldKits when a wave turns. */
  kits: number
  onGround: boolean
  slashTimer: number
  /** Seconds a pressed swing stays live waiting for a titan to arrive (see combat.ts). */
  slashBuffer: number
  fireTimer: number
  invulnTimer: number
  boostCooldown: number
  airTime: number
  /** Horizontal speed remembered at a tethered touchdown, returned on liftoff. */
  bankedSpeed: number
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
    spears: config.spearCapacity,
    lamp: LAMP_BATTERY_SECONDS,
    kits: config.fieldKits,
    onGround: true,
    slashTimer: 0,
    slashBuffer: 0,
    fireTimer: 0,
    invulnTimer: 0,
    boostCooldown: 0,
    airTime: 0,
    bankedSpeed: 0,
    config,
  }
}

export const BOOST_COST = 14 // the HUD segments the gas bar into taps of this size
const BOOST_COOLDOWN = 0.5

/** Click-burst dash along the look direction (full 3D). Airborne only. */
export function tryBoost(p: PlayerState, lookDir: Vector3): boolean {
  if (p.onGround || p.boostCooldown > 0) return false
  if (p.gas < BOOST_COST) {
    // a low tank swaps to the next canister instead of leaving boost dead
    if (p.canisters <= 0) return false
    p.canisters -= 1
    p.gas = p.config.maxGas
  }
  const dir = lookDir.clone()
  if (dir.lengthSq() === 0) return false
  dir.normalize()
  p.vel.addScaledVector(dir, p.config.boostImpulse)
  p.gas -= BOOST_COST
  p.boostCooldown = BOOST_COOLDOWN
  return true
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
  p.fireTimer = Math.max(0, p.fireTimer - dt)
  p.invulnTimer = Math.max(0, p.invulnTimer - dt)
  p.boostCooldown = Math.max(0, p.boostCooldown - dt)
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

  const move = new Vector3(input.move.x, 0, input.move.z)
  if (move.lengthSq() > 0) move.normalize()
  if (wasOnGround) {
    const horizSpeed = Math.hypot(p.vel.x, p.vel.z)
    if (move.lengthSq() > 0 && horizSpeed <= cfg.runSpeed + 1) {
      const target = move.clone().multiplyScalar(cfg.runSpeed)
      const delta = new Vector3(target.x - p.vel.x, 0, target.z - p.vel.z)
      const maxStep = cfg.runAccel * dt
      if (delta.length() > maxStep) delta.setLength(maxStep)
      p.vel.x += delta.x
      p.vel.z += delta.z
    } else {
      // above run speed the ground is a skid: steer and bleed, never add — legs can't
      // outrun momentum; real speed comes from swinging, not from holding W.
      // Exception: with a hook attached the rope is doing the work, so a tethered graze
      // costs nothing, and legs pumping WITH the swing add speed on top — sprinting the
      // arc bottom is how you bank extra velocity. Releasing on the ground hands the
      // speed back to the skid.
      const tethered = anchors.length > 0
      const friction = tethered ? 0 : move.lengthSq() > 0 ? 8 : 12
      const decel = friction * dt
      const newSpeed = Math.max(0, horizSpeed - decel)
      if (horizSpeed > 1e-6) {
        const scale = newSpeed / horizSpeed
        p.vel.x *= scale
        p.vel.z *= scale
      }
      if (move.lengthSq() > 0) steerHorizontal(p.vel, move, 2.4 * dt)
      if (tethered && move.lengthSq() > 0 && horizSpeed > 1e-6) {
        const boosted = (horizSpeed + 6 * dt) / horizSpeed
        p.vel.x *= boosted
        p.vel.z *= boosted
      }
    }
  } else if (move.lengthSq() > 0) {
    steerHorizontal(p.vel, move, 1.5 * dt)
    // air input adds speed only at low speeds; past that it purely redirects
    if (Math.hypot(p.vel.x, p.vel.z) < cfg.airControlCeiling) {
      p.vel.addScaledVector(move, cfg.airControl * dt)
    }
  }

  if (!wasOnGround) {
    // mild aero drag: the burst-based boost no longer needs a heavy soft ceiling, and a
    // swing must carry its speed through to the next hook instead of bleeding out
    const speed = p.vel.length()
    p.vel.multiplyScalar(Math.max(0, 1 - (cfg.drag + 0.0045 * speed) * dt))
  }

  // the winch is automatic: slack ratchets up instantly, and the rope winds in at a
  // rate that grows with speed — holding a hook IS reeling; releasing it lets go
  const speedNow = p.vel.length()
  for (const hook of anchors) {
    const dist = p.pos.distanceTo(hook.anchor)
    if (dist < hook.length) hook.length = Math.max(cfg.minRopeLength, dist)
    // stronger low-speed winch: climbing early in a swing banks the height that the
    // next pendulum converts back into speed
    const rate = cfg.reelSpeed * Math.min(1, (4 + speedNow * 0.24) / 14)
    reelHook(hook, rate * dt, cfg.minRopeLength)
  }

  if (p.vel.length() > cfg.speedCap) p.vel.setLength(cfg.speedCap)

  p.pos.addScaledVector(p.vel, dt)

  for (const hook of p.hooks) applyRopeConstraint(p.pos, p.vel, hook)
  resolveBuildingCollision(arena, p.pos, p.vel, 0.5)
  clampToWall(arena, p.pos, p.vel, 1)
  clampToCeiling(arena, p.pos, p.vel, 0.9)

  // the canal: tethered, the rope carries you — skimming the water costs a whisper,
  // like a tethered ground graze, and the banked swing survives. Untethered you are
  // wading, and the water eats your run. That asymmetry IS the risk gap.
  const canal = arena.canal
  if (
    canal &&
    p.pos.y - EYE_HEIGHT < canal.waterY &&
    Math.abs(p.pos.x - canal.x) < canal.halfWidth
  ) {
    const tethered = anchors.length > 0
    const soak = Math.max(0, 1 - (tethered ? 0.3 : 2.5) * dt)
    p.vel.x *= soak
    p.vel.z *= soak
    if (!tethered) p.bankedSpeed = 0
  }

  // feet-relative ground: an elevated deck is a one-way platform — pass under it
  // freely, land on it from above (or pop onto it as your feet clear its base)
  const ground = groundHeightAt(arena, p.pos.x, p.pos.z, p.pos.y - EYE_HEIGHT) + EYE_HEIGHT
  if (p.pos.y <= ground) {
    p.pos.y = ground
    if (p.vel.y < 0) p.vel.y = 0
    if (!wasOnGround && anchors.length > 0) {
      // tethered touchdown: bank the swing's speed so liftoff can never hand back less
      // than the runner arrived with (the graze itself is free)
      p.bankedSpeed = Math.hypot(p.vel.x, p.vel.z)
    }
    if (anchors.length === 0) p.bankedSpeed = 0 // let go on the ground: the bank is gone
    p.onGround = true
    p.airTime = 0
  } else {
    if (wasOnGround && anchors.length > 0 && p.bankedSpeed > 0) {
      const horiz = Math.hypot(p.vel.x, p.vel.z)
      if (horiz > 1e-6 && p.bankedSpeed > horiz) {
        const scale = p.bankedSpeed / horiz
        p.vel.x *= scale
        p.vel.z *= scale
      }
    }
    p.bankedSpeed = 0
    p.onGround = false
    p.airTime += dt
  }
}
