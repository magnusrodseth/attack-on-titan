import { Vector3 } from 'three'
import { getMap, DEFAULT_MAP_ID } from './maps'
import { getMode, DEFAULT_MODE_ID } from './modes'
import { createPlayer } from './player'
import type { TitanBehavior, TitanKind, TitanState } from './titan'
import type { MatchResults, Soldier, World, WorldEvent } from './world'
import {
  MAX_CHASERS,
  PICK_SECONDS,
  WAVE_BONUS,
  COOP_SCALE_PER_PLAYER,
  createSoldier,
  createWorld,
  musterPos,
  removeSoldier,
  soldierById,
  spawnWave,
  stepWorld,
  worldFire,
  worldResupply,
  worldSlash,
} from './world'

/**
 * The co-op driver: the shared world (world.ts) with N soldiers, a wire, and the things
 * only a server needs — lag compensation, position reports, and the snapshot.
 *
 * Everything that *is* the game — titans, waves, Shifters, spears, upgrades, the grab —
 * lives in the world and is the very same code the solo driver runs. That is the whole
 * point (ADR 0003): a new map, mode, kind or boss cannot arrive in singleplayer and quietly
 * miss multiplayer, because there is only one place for it to arrive.
 *
 * Focus (bullet time) is the one thing a shared world cannot have: it never reaches here,
 * because the solo driver applies it to dt before the world is ever called.
 */

export type CoopPhase = 'playing' | 'upgrading' | 'ended'

export const CHASERS_PER_PLAYER = MAX_CHASERS // solo's tokens, granted per hunted soldier
export { PICK_SECONDS, WAVE_BONUS, COOP_SCALE_PER_PLAYER, musterPos }
export type { MatchResults }
/** The world's soldier, seen from the server. */
export type CoopPlayer = Soldier
/** One event union for both drivers; co-op simply always reads `playerId`. */
export type CoopEvent = WorldEvent

const MAX_REPORTED_SPEED = 60 // sanity clamp: past any legit boost chain
export const HISTORY_INTERVAL = 1 / 30
const HISTORY_MAX = 10 // ~300 ms of titan pose history for lag compensation
export const SLASH_REWIND = 0.1 // seconds of rewind: interp delay + half a friend-ping

export interface HookAnchor {
  x: number
  y: number
  z: number
}

/** Cosmetic pose relayed to teammates; the server never acts on it. */
export interface PlayerPose {
  yaw: number
  pitch: number
  hooks: [HookAnchor | null, HookAnchor | null]
}

export interface PlayerUpdate {
  pos: Vector3
  vel: Vector3
  onGround: boolean
  pose?: PlayerPose
}

interface TitanSample {
  pos: Vector3
  facing: number
  state: TitanBehavior
}

/** The world a room runs, plus the wire's own bookkeeping. */
export interface CoopWorld extends World {
  /** Soldiers by handle; the same objects as `soldiers`, indexed for the room's lookups. */
  players: Map<string, Soldier>
  history: Map<number, TitanSample[]>
  historyTimer: number
}

/**
 * citySeed defaults to seed but may be pinned separately: a room keeps one city across
 * rematches (clients pre-build it from the room code) while waves/offers vary per match.
 * mapId and modeId come from the lobby — both are on the wire, so every client generates
 * the same arena and the server runs the mode they actually chose.
 */
export function createCoopWorld(
  seed: string,
  playerIds: string[],
  citySeed = seed,
  mapId: string = DEFAULT_MAP_ID,
  modeId: string = DEFAULT_MODE_ID,
): CoopWorld {
  const soldiers = playerIds.map((id, i) => {
    const body = createPlayer()
    body.pos.copy(musterPos(i, playerIds.length))
    return createSoldier(id, body)
  })
  const base = createWorld({
    seed,
    citySeed,
    map: getMap(mapId),
    mode: getMode(modeId),
    soldiers,
    storage: null,
    coop: true,
  })
  const w: CoopWorld = Object.assign(base, {
    players: new Map(soldiers.map((s) => [s.id, s])),
    history: new Map<number, TitanSample[]>(),
    historyTimer: 0,
  })
  // the mode seeds the run exactly as it does in solo: the wave, the roster, the Shifter
  w.phase = 'playing'
  w.wave = 1
  w.mode.start(w)
  if (w.titans.length === 0) spawnWave(w) // a mode whose start() spawned nothing still fights
  return w
}

export function applyPlayerUpdate(w: CoopWorld, playerId: string, update: PlayerUpdate): void {
  const s = w.players.get(playerId)
  if (!s || !s.connected) return
  // NaN/Infinity pass range clamps (NaN > x is false) and would poison every snapshot and
  // titan target in the shared world: reject the report outright
  const parts = [update.pos.x, update.pos.y, update.pos.z, update.vel.x, update.vel.y, update.vel.z]
  if (!parts.every(Number.isFinite)) return
  // a held soldier does not fly: the fist owns their position, not their client
  if (s.grab) {
    if (update.pose) s.pose = update.pose
    return
  }
  const pos = update.pos.clone()
  const radial = Math.hypot(pos.x, pos.z)
  const maxRadial = w.arena.wallRadius + 60
  if (radial > maxRadial) {
    pos.x *= maxRadial / radial
    pos.z *= maxRadial / radial
  }
  pos.y = Math.min(400, Math.max(0, pos.y))
  const vel = update.vel.clone()
  if (vel.length() > MAX_REPORTED_SPEED) vel.setLength(MAX_REPORTED_SPEED)
  s.body.pos.copy(pos)
  s.body.vel.copy(vel)
  s.body.onGround = update.onGround
  s.onGround = update.onGround
  if (update.pose) s.pose = update.pose
}

function sampleHistory(w: CoopWorld): void {
  for (const t of w.titans) {
    let ring = w.history.get(t.id)
    if (!ring) w.history.set(t.id, (ring = []))
    ring.push({ pos: t.pos.clone(), facing: t.facing, state: t.state })
    if (ring.length > HISTORY_MAX) ring.shift()
  }
}

export function coopStep(w: CoopWorld, dt: number): CoopEvent[] {
  if (w.phase === 'ended') return []
  w.events = []
  const wave = w.wave
  w.historyTimer += dt
  if (w.historyTimer >= HISTORY_INTERVAL) {
    w.historyTimer -= HISTORY_INTERVAL
    sampleHistory(w)
  }
  stepWorld(w, dt)
  if (w.wave !== wave) w.history.clear() // a new roster invalidates the rewind buffer
  return w.events
}

/** Rewinds titan poses for validation; hp/ankle mutations land on the live titans. */
function rewindTitans(w: CoopWorld, rewindS: number): () => void {
  const steps = Math.max(0, Math.min(HISTORY_MAX - 1, Math.round(rewindS / HISTORY_INTERVAL)))
  const saved: {
    t: TitanState
    pos: Vector3
    facing: number
    state: TitanBehavior
    rewound: TitanBehavior
  }[] = []
  for (const t of w.titans) {
    const ring = w.history.get(t.id)
    const sample = ring && ring.length > steps ? ring[ring.length - 1 - steps] : undefined
    if (!sample) continue
    saved.push({ t, pos: t.pos.clone(), facing: t.facing, state: t.state, rewound: sample.state })
    t.pos.copy(sample.pos)
    t.facing = sample.facing
    t.state = sample.state
  }
  return () => {
    for (const s of saved) {
      s.t.pos.copy(s.pos)
      s.t.facing = s.facing
      // keep state transitions the slash itself caused (cripple); otherwise restore live state
      if (s.t.state === s.rewound) s.t.state = s.state
    }
  }
}

/**
 * A client's slash intent, judged against where the titans were when they swung. The
 * Shifter's parts rewind with the body they hang off, so a boss part is hit exactly like a
 * nape: the pose is rewound, the pools are not.
 */
export function coopSlash(
  w: CoopWorld,
  playerId: string,
  aim: Vector3 | null,
  rewindS = SLASH_REWIND,
): CoopEvent[] {
  w.events = []
  const s = w.players.get(playerId)
  if (!s) return []
  const restore = rewindS > 0 ? rewindTitans(w, rewindS) : () => {}
  worldSlash(w, s, aim)
  restore()
  return w.events
}

/** A client's fire intent: server-authoritative launch along the client-owned aim. */
export function coopFire(w: CoopWorld, playerId: string, look: Vector3): CoopEvent[] {
  w.events = []
  const s = w.players.get(playerId)
  if (!s) return []
  worldFire(w, s, look)
  return w.events
}

export function coopPickUpgrade(w: CoopWorld, playerId: string, upgradeId: string): CoopEvent[] {
  w.events = []
  if (w.phase !== 'upgrading') return []
  const s = w.players.get(playerId)
  if (!s) return []
  w.mode.chooseUpgrade?.(w, playerId, upgradeId)
  return w.events
}

export function coopResupply(w: CoopWorld, playerId: string): CoopEvent[] {
  w.events = []
  const s = w.players.get(playerId)
  if (!s) return []
  worldResupply(w, s)
  return w.events
}

/** A mash press from a soldier in a fist; the world spends it on the escape bar. */
export function coopMash(w: CoopWorld, playerId: string): CoopEvent[] {
  const s = w.players.get(playerId)
  if (!s || !s.grab) return []
  s.mash += 1
  return []
}

export function removePlayer(w: CoopWorld, playerId: string): CoopEvent[] {
  w.events = []
  removeSoldier(w, playerId)
  return w.events
}

export interface CoopSnapshot {
  tick: number
  phase: CoopPhase
  wave: number
  pickTimer: number
  titans: {
    id: number
    kind: TitanKind
    x: number
    y: number
    z: number
    facing: number
    height: number
    state: TitanBehavior
    hp: number
    maxHp: number
    ankles: [boolean, boolean]
  }[]
  /** The live Shifter, or null on an ordinary wave. Enough to render and fight it. */
  boss: {
    titanId: number
    specId: string
    /** Index of the lit Weak Point in the spec's part sequence. */
    phase: number
    parts: { hp: number; maxHp: number; broken: boolean; plated: boolean }[]
    engaged: boolean
    steamOn: boolean
    /** True while a throw is telegraphed: the render layer poses the windup off this. */
    windup: boolean
    projectiles: { id: number; x: number; y: number; z: number }[]
    spikes: { x: number; z: number; timer: number }[]
  } | null
  players: {
    id: string
    x: number
    y: number
    z: number
    vx: number
    vy: number
    vz: number
    onGround: boolean
    yaw: number
    pitch: number
    hooks: [HookAnchor | null, HookAnchor | null]
    hp: number
    maxHp: number
    alive: boolean
    connected: boolean
    score: number
    kills: number
    combo: number
    blades: number
    bladeHp: number
    spears: number
    picked: boolean
    /** The fist around this soldier: the QTE the client renders and mashes against. */
    grab: { titanId: number; presses: number; timeLeft: number } | null
  }[]
  spears: {
    id: number
    x: number
    y: number
    z: number
    phase: 'flying' | 'stuck'
    fuse: number
    titanId: number | null
  }[]
  pickups: { id: number; x: number; z: number; taken: boolean }[]
  results: MatchResults | null
}

const r2 = (v: number): number => Math.round(v * 100) / 100

export function coopSnapshot(w: CoopWorld): CoopSnapshot {
  const boss = w.boss
  return {
    tick: w.tick,
    phase: (w.phase === 'dead' ? 'ended' : w.phase) as CoopPhase,
    wave: w.wave,
    pickTimer: r2(w.pickTimer),
    titans: w.titans.map((t) => ({
      id: t.id,
      kind: t.kind,
      x: r2(t.pos.x),
      y: r2(t.pos.y),
      z: r2(t.pos.z),
      facing: r2(t.facing),
      height: r2(t.height),
      state: t.state,
      hp: Math.round(t.hp),
      maxHp: t.maxHp,
      ankles: [t.ankles[0], t.ankles[1]],
    })),
    boss: boss
      ? {
          titanId: boss.titan.id,
          specId: boss.spec.id,
          phase: boss.state.phase,
          parts: boss.state.parts.map((p) => ({
            hp: Math.round(p.hp),
            maxHp: p.maxHp,
            broken: p.broken,
            plated: p.plated,
          })),
          engaged: boss.state.engaged,
          steamOn: boss.state.steamOn,
          windup: boss.state.windup !== null,
          projectiles: boss.state.projectiles.map((p) => ({
            id: p.id,
            x: r2(p.pos.x),
            y: r2(p.pos.y),
            z: r2(p.pos.z),
          })),
          spikes: boss.state.pendingSpikes.map((s) => ({
            x: r2(s.x),
            z: r2(s.z),
            timer: r2(s.timer),
          })),
        }
      : null,
    players: w.soldiers.map((s) => ({
      id: s.id,
      x: r2(s.body.pos.x),
      y: r2(s.body.pos.y),
      z: r2(s.body.pos.z),
      vx: r2(s.body.vel.x),
      vy: r2(s.body.vel.y),
      vz: r2(s.body.vel.z),
      onGround: s.onGround,
      yaw: r2(s.pose.yaw),
      pitch: r2(s.pose.pitch),
      hooks: s.pose.hooks,
      hp: s.body.hp,
      maxHp: s.body.config.maxHp,
      alive: s.alive,
      connected: s.connected,
      score: s.score.score,
      kills: s.score.kills,
      combo: s.score.combo,
      blades: s.body.blades,
      bladeHp: s.body.bladeHp,
      spears: s.body.spears,
      picked: s.picked,
      grab: s.grab
        ? { titanId: s.grab.titanId, presses: s.grab.presses, timeLeft: r2(s.grab.timeLeft) }
        : null,
    })),
    spears: w.spears.map((s) => ({
      id: s.id,
      x: r2(s.pos.x),
      y: r2(s.pos.y),
      z: r2(s.pos.z),
      phase: s.phase,
      fuse: r2(s.fuse),
      titanId: s.titanId,
    })),
    pickups: w.pickups.map((p) => ({ id: p.id, x: r2(p.x), z: r2(p.z), taken: p.taken })),
    results: w.results,
  }
}

export { soldierById }
