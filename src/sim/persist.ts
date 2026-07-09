import { Vector3 } from 'three'
import { LAMP_BATTERY_SECONDS } from './flashlight'
import type { GamePhase, GameState } from './game'
import type { PlayerConfig } from './player'
import { neutralInput } from './player'
import { resumeRng } from './rng'
import type { ScoreState } from './score'
import type { TitanState } from './titan'
import type { Upgrade } from './upgrades'
import { UPGRADE_POOL } from './upgrades'

/**
 * Refresh-proof run persistence: a pure snapshot of everything a run needs to continue
 * bit-for-bit after a page reload. The arena is NOT saved — it re-derives from the seed —
 * and the live rng stream is captured by its internal state, so a restored run replays
 * exactly like one that was never interrupted (pinned by the divergence test).
 */
export const SAVE_VERSION = 1

type V3 = [number, number, number]

const v3 = (v: Vector3): V3 => [v.x, v.y, v.z]

interface SavedHook {
  state: 'none' | 'attached'
  anchor: V3
  length: number
  titanId: number | null
  local: V3
}

type SavedTitan = Omit<TitanState, 'pos' | 'vel'> & { pos: V3; vel: V3 }

interface SavedPlayer {
  pos: V3
  vel: V3
  hooks: [SavedHook, SavedHook]
  gas: number
  canisters: number
  blades: number
  bladeHp: number
  hp: number
  lamp?: number // absent in saves from before the flashlight existed
  onGround: boolean
  slashTimer: number
  invulnTimer: number
  boostCooldown: number
  airTime: number
  bankedSpeed: number
  config: PlayerConfig
}

export interface SavedRun {
  v: number
  seed: string
  modeId: string
  phase: GamePhase
  wave: number
  time: number
  focus: number
  focusActive: boolean
  nextTitanId: number
  rngLiveState: number
  score: ScoreState
  offerIds: string[]
  player: SavedPlayer
  titans: SavedTitan[]
  view?: { yaw: number; pitch: number }
}

export function serializeRun(g: GameState, view?: { yaw: number; pitch: number }): SavedRun {
  const p = g.player
  return {
    v: SAVE_VERSION,
    seed: g.seed,
    modeId: g.mode.id,
    phase: g.phase,
    wave: g.wave,
    time: g.time,
    focus: g.focus,
    focusActive: g.focusActive,
    nextTitanId: g.nextTitanId,
    rngLiveState: g.rngLive.state(),
    score: { ...g.score },
    offerIds: g.offers.map((o) => o.id),
    player: {
      pos: v3(p.pos),
      vel: v3(p.vel),
      hooks: [serializeHook(p.hooks[0]), serializeHook(p.hooks[1])],
      gas: p.gas,
      canisters: p.canisters,
      blades: p.blades,
      bladeHp: p.bladeHp,
      hp: p.hp,
      lamp: p.lamp,
      onGround: p.onGround,
      slashTimer: p.slashTimer,
      invulnTimer: p.invulnTimer,
      boostCooldown: p.boostCooldown,
      airTime: p.airTime,
      bankedSpeed: p.bankedSpeed,
      config: { ...p.config },
    },
    titans: g.titans.map((t) => ({ ...t, pos: v3(t.pos), vel: v3(t.vel), ankles: [...t.ankles] as [boolean, boolean] })),
    ...(view ? { view: { ...view } } : {}),
  }
}

function serializeHook(hook: GameState['player']['hooks'][0]): SavedHook {
  return {
    state: hook.state,
    anchor: v3(hook.anchor),
    length: hook.length,
    titanId: hook.titanId,
    local: v3(hook.local),
  }
}

/**
 * Hydrates a freshly created game (same seed and mode) from a save. Validates before
 * touching anything; on any mismatch the game is left untouched and false is returned.
 */
export function restoreRun(save: SavedRun | null | undefined, g: GameState): boolean {
  if (!save || save.v !== SAVE_VERSION) return false
  if (save.seed !== g.seed || save.modeId !== g.mode.id) return false

  g.phase = save.phase
  g.wave = save.wave
  g.time = save.time
  g.focus = save.focus
  g.focusActive = save.focusActive
  g.nextTitanId = save.nextTitanId
  g.rngLive = resumeRng(save.rngLiveState)
  g.score = { ...save.score }
  g.offers = save.offerIds
    .map((id) => UPGRADE_POOL.find((u) => u.id === id))
    .filter((u): u is Upgrade => u !== undefined)
  g.events = []
  g.prevInput = neutralInput()

  const p = g.player
  const sp = save.player
  p.pos.set(...sp.pos)
  p.vel.set(...sp.vel)
  for (const [i, savedHook] of sp.hooks.entries()) {
    const hook = p.hooks[i]!
    hook.state = savedHook.state
    hook.anchor.set(...savedHook.anchor)
    hook.length = savedHook.length
    hook.titanId = savedHook.titanId
    hook.local.set(...savedHook.local)
  }
  p.gas = sp.gas
  p.canisters = sp.canisters
  p.blades = sp.blades
  p.bladeHp = sp.bladeHp
  p.hp = sp.hp
  p.lamp = sp.lamp ?? LAMP_BATTERY_SECONDS
  p.onGround = sp.onGround
  p.slashTimer = sp.slashTimer
  p.invulnTimer = sp.invulnTimer
  p.boostCooldown = sp.boostCooldown
  p.airTime = sp.airTime
  p.bankedSpeed = sp.bankedSpeed
  p.config = { ...sp.config }

  g.titans = save.titans.map((t) => ({
    ...t,
    pos: new Vector3(...t.pos),
    vel: new Vector3(...t.vel),
    ankles: [t.ankles[0], t.ankles[1]] as [boolean, boolean],
  }))
  return true
}
