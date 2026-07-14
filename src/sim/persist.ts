import { Vector3 } from 'three'
import type { BossState } from './boss'
import { BOSS_LADDER } from './boss'
import { LAMP_BATTERY_SECONDS } from './flashlight'
import type { GamePhase, GameState } from './game'
import { loadHuntBest } from './hunt'
import { DEFAULT_MAP_ID, mapScopedSeed } from './maps'
import type { PlayerConfig } from './player'
import { neutralInput } from './player'
import { resumeRng } from './rng'
import type { ScoreState } from './score'
import type { SpearPickup, SpearState } from './spear'
import type { TitanState } from './titan'
import type { Upgrade } from './upgrades'
import { UPGRADE_POOL } from './upgrades'

/**
 * Refresh-proof run persistence: a pure snapshot of everything a run needs to continue
 * bit-for-bit after a page reload. The arena is NOT saved — it re-derives from the seed —
 * and the live rng stream is captured by its internal state, so a restored run replays
 * exactly like one that was never interrupted (pinned by the divergence test).
 *
 * v2 (thunder spears): rack count, fire cooldown, live/stuck spears with fuses and
 * titan-local anchors, and the wave's pickups. v1 saves are discarded, not migrated.
 *
 * v2 addendum (kill-charged focus): focusCharge joined the shape additively. Saves from
 * before it load with an empty meter (nobody spawns pre-charged); an in-flight strike dash
 * is never saved — a restore lands you wherever the dash had gotten to, in normal flight.
 *
 * v3 (footballer removal, 2026-07-13): the matchday mode and the striker/captain titan
 * kinds no longer exist, so any v2 save could reference them; old runs are discarded.
 *
 * v5 (five new upgrades, 2026-07-14): PlayerConfig grew blastRadius, grabEscapePresses and
 * fieldKits, PlayerState grew kits, and SpearState grew blastRadius. A v4 save would restore a
 * soldier whose config has no blastRadius, and every spear fired from it would then test its
 * blast against `distance <= undefined` — false for every titan, so the spear would flash and
 * kill nothing, silently. Discarded rather than migrated.
 */
export const SAVE_VERSION = 5

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

/** The Shifter fight is plain data apart from projectile vectors, which flatten to V3. */
type SavedBoss = Omit<BossState, 'projectiles'> & {
  projectiles: { id: number; pos: V3; vel: V3 }[]
}

type SavedSpear = Omit<SpearState, 'pos' | 'vel' | 'local'> & { pos: V3; vel: V3; local: V3 }

interface SavedPlayer {
  pos: V3
  vel: V3
  hooks: [SavedHook, SavedHook]
  gas: number
  canisters: number
  blades: number
  bladeHp: number
  hp: number
  spears: number
  lamp?: number // absent in saves from before the flashlight existed
  kits: number
  onGround: boolean
  slashTimer: number
  fireTimer: number
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
  /** Arena archetype; absent in saves from before maps existed (those are the district). */
  mapId?: string
  phase: GamePhase
  wave: number
  time: number
  focus: number
  focusActive: boolean
  /** Absent in saves from before the kill-charged focus meter. */
  focusCharge?: number
  nextTitanId: number
  nextSpearId: number
  rngLiveState: number
  score: ScoreState
  offerIds: string[]
  player: SavedPlayer
  titans: SavedTitan[]
  spears: SavedSpear[]
  pickups: SpearPickup[]
  /** Boss-wave cache restocking; absent in saves from before it existed (wave restart = round 0). */
  pickupRound?: number
  pickupRespawnTimer?: number
  /**
   * The Shifter fight on a boss wave; absent everywhere else and in pre-boss saves
   * (which cannot contain shifter titans, so absence is only invalid alongside one).
   */
  boss?: SavedBoss
  view?: { yaw: number; pitch: number }
  /**
   * The Culling's countdown, carried across a refresh so reloading never resets the
   * clock. Absent in other modes and in older saves (the mode then rebuilds a full
   * clock). Signal Run deliberately saves nothing: a timed run restarts, never resumes.
   */
  hunt?: { timeLeft: number; budget: number; urgencyFired: boolean }
}

export function serializeRun(g: GameState, view?: { yaw: number; pitch: number }): SavedRun {
  const p = g.player
  return {
    v: SAVE_VERSION,
    seed: g.seed,
    modeId: g.mode.id,
    mapId: g.map.id,
    phase: g.phase,
    wave: g.wave,
    time: g.time,
    focus: g.focus,
    focusActive: g.focusActive,
    focusCharge: g.focusCharge,
    nextTitanId: g.nextTitanId,
    nextSpearId: g.nextSpearId,
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
      spears: p.spears,
      lamp: p.lamp,
      kits: p.kits,
      onGround: p.onGround,
      slashTimer: p.slashTimer,
      fireTimer: p.fireTimer,
      invulnTimer: p.invulnTimer,
      boostCooldown: p.boostCooldown,
      airTime: p.airTime,
      bankedSpeed: p.bankedSpeed,
      config: { ...p.config },
    },
    titans: g.titans.map((t) => ({ ...t, pos: v3(t.pos), vel: v3(t.vel), ankles: [...t.ankles] as [boolean, boolean] })),
    spears: g.spears.map((s) => ({ ...s, pos: v3(s.pos), vel: v3(s.vel), local: v3(s.local) })),
    pickups: g.pickups.map((pk) => ({ ...pk })),
    pickupRound: g.pickupRound,
    pickupRespawnTimer: g.pickupRespawnTimer,
    ...(g.boss
      ? {
          boss: {
            ...g.boss.state,
            parts: g.boss.state.parts.map((p) => ({ ...p })),
            cooldowns: { ...g.boss.state.cooldowns },
            pendingSpikes: g.boss.state.pendingSpikes.map((s) => ({ ...s })),
            summonIds: [...g.boss.state.summonIds],
            projectiles: g.boss.state.projectiles.map((p) => ({
              id: p.id,
              pos: v3(p.pos),
              vel: v3(p.vel),
            })),
          },
        }
      : {}),
    ...(view ? { view: { ...view } } : {}),
    ...(g.hunt
      ? { hunt: { timeLeft: g.hunt.timeLeft, budget: g.hunt.budget, urgencyFired: g.hunt.urgencyFired } }
      : {}),
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
  // the arena re-derives from seed + map: restoring into another map's geometry is never valid
  if ((save.mapId ?? DEFAULT_MAP_ID) !== g.map.id) return false
  // a shifter on the roster demands its fight state; a dangling boss payload is fine to drop
  if (save.titans.some((t) => t.kind === 'shifter')) {
    if (!save.boss) return false
    const boss = save.boss
    if (!BOSS_LADDER.some((spec) => spec.id === boss.specId)) return false
    if (!save.titans.some((t) => t.id === boss.titanId)) return false
  }

  g.phase = save.phase
  g.wave = save.wave
  g.time = save.time
  if (save.focusCharge === undefined) {
    // a save from the regen-meter era: the kill-charged meter starts over empty
    g.focus = 0
    g.focusActive = false
    g.focusCharge = 0
  } else {
    g.focus = save.focus
    g.focusActive = save.focusActive
    g.focusCharge = save.focusCharge
  }
  g.strike = null
  g.strikeTargetId = null
  g.nextTitanId = save.nextTitanId
  g.nextSpearId = save.nextSpearId
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
  p.spears = sp.spears
  p.lamp = sp.lamp ?? LAMP_BATTERY_SECONDS
  p.kits = sp.kits
  p.onGround = sp.onGround
  p.slashTimer = sp.slashTimer
  p.fireTimer = sp.fireTimer
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
  g.spears = save.spears.map((s) => ({
    ...s,
    pos: new Vector3(...s.pos),
    vel: new Vector3(...s.vel),
    local: new Vector3(...s.local),
  }))
  g.pickups = save.pickups.map((pk) => ({ ...pk }))
  g.pickupRound = save.pickupRound ?? 0
  g.pickupRespawnTimer = save.pickupRespawnTimer ?? 0

  const savedBoss = save.boss
  const bossTitan = savedBoss ? g.titans.find((t) => t.id === savedBoss.titanId) : undefined
  const bossSpec = savedBoss ? BOSS_LADDER.find((spec) => spec.id === savedBoss.specId) : undefined
  g.boss =
    savedBoss && bossTitan && bossSpec
      ? {
          spec: bossSpec,
          titan: bossTitan, // the SAME object as the roster entry, so hooks and AI agree
          state: {
            ...savedBoss,
            parts: savedBoss.parts.map((p) => ({ ...p })),
            cooldowns: { ...savedBoss.cooldowns },
            pendingSpikes: savedBoss.pendingSpikes.map((s) => ({ ...s })),
            summonIds: [...savedBoss.summonIds],
            projectiles: savedBoss.projectiles.map((p) => ({
              id: p.id,
              pos: new Vector3(...p.pos),
              vel: new Vector3(...p.vel),
            })),
          },
        }
      : null

  // mode state: the relentless rule is The Culling's, and its clock rides the save
  g.relentless = g.mode.id === 'hunt'
  g.hunt = save.hunt ? { ...save.hunt, best: loadHuntBest(g.storage, mapScopedSeed(g.map.id, g.seed)) } : null
  g.race = null // Signal Run self-heals: a restored race relights the line
  return true
}
