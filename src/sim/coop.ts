import { Vector3 } from 'three'
import type { Arena } from './city'
import { generateCity } from './city'
import { EYE_HEIGHT } from './constants'
import { trySlash } from './combat'
import type { NavGrid } from './nav'
import { buildNavGrid, nearestWalkable } from './nav'
import type { PlayerState } from './player'
import { createPlayer } from './player'
import type { Rng } from './rng'
import { createRng, hashSeed } from './rng'
import type { ScoreState } from './score'
import { createScore, registerKill, stepScore } from './score'
import type { TitanBehavior, TitanKind, TitanState } from './titan'
import { aggroRange, createTitan, stepTitan } from './titan'
import type { Upgrade } from './upgrades'
import { applyUpgrade, offerUpgrades } from './upgrades'
import { waveComposition } from './waves'

/**
 * The shared co-op world: the server-side match sim. Titans, waves and scoring are
 * authoritative here; each soldier's movement is owned by their client and mirrored in
 * via applyPlayerUpdate. Slashes are validated with lag compensation against a short
 * history of titan poses. Pure and deterministic like the rest of src/sim — the Worker
 * imports this module unchanged. Focus (bullet time) does not exist in co-op: a shared
 * world cannot slow down for one soldier.
 */

export type CoopPhase = 'playing' | 'upgrading' | 'ended'

export const CHASERS_PER_PLAYER = 3 // solo's MAX_CHASERS, granted per hunted soldier
export const PICK_SECONDS = 15 // upgrade intermission timer; expiry auto-picks
export const WAVE_BONUS = 250 // per wave, credited to every soldier
export const COOP_SCALE_PER_PLAYER = 0.75 // extra titans per extra soldier
const RESUPPLY_RADIUS = 15 // solo uses 10; slack for report latency
const MAX_REPORTED_SPEED = 60 // sanity clamp: past any legit boost chain
const MUSTER = { x: 0, z: 8 } // run start plaza, same as solo
export const HISTORY_INTERVAL = 1 / 30
const HISTORY_MAX = 10 // ~300 ms of titan pose history for lag compensation
export const SLASH_REWIND = 0.1 // seconds of rewind: interp delay + half a friend-ping

export interface PlayerUpdate {
  pos: Vector3
  vel: Vector3
  onGround: boolean
}

export interface CoopPlayer {
  id: string
  /** Server copy of the soldier: hp/blades/config/timers are authoritative here; pos/vel mirror reports. */
  body: PlayerState
  onGround: boolean
  alive: boolean
  connected: boolean
  deaths: number
  score: ScoreState
  offers: Upgrade[]
  picked: boolean
}

export interface MatchResults {
  wavesCleared: number
  durationS: number
  players: { id: string; score: number; kills: number; deaths: number; mvp: boolean }[]
}

export type CoopEvent =
  | { type: 'slash'; playerId: string; hit: boolean; napeHit: boolean }
  | { type: 'bladeBroke'; playerId: string }
  | { type: 'ankleSliced'; playerId: string; titanId: number; remaining: number; side: 0 | 1 }
  | { type: 'crippled'; titanId: number }
  | {
      type: 'kill'
      playerId: string
      titanId: number
      points: number
      oneCut: boolean
      speed: number
      heartGained: boolean
      kind: TitanKind
    }
  | { type: 'playerHit'; playerId: string; hp: number; knockback: { x: number; y: number; z: number } }
  | { type: 'playerDied'; playerId: string }
  | { type: 'respawn'; playerId: string; pos: { x: number; y: number; z: number } }
  | { type: 'resupply'; playerId: string }
  | { type: 'waveClear'; wave: number; bonus: number }
  | { type: 'offers'; playerId: string; upgradeIds: string[] }
  | { type: 'upgradePicked'; playerId: string; upgradeId: string; auto: boolean }
  | { type: 'waveStart'; wave: number }
  | { type: 'teamWipe'; results: MatchResults }

interface TitanSample {
  pos: Vector3
  facing: number
  state: TitanBehavior
}

export interface CoopWorld {
  seed: string
  phase: CoopPhase
  wave: number
  time: number
  tick: number
  players: Map<string, CoopPlayer>
  titans: TitanState[]
  arena: Arena
  nav: NavGrid
  rngLive: Rng
  nextTitanId: number
  pickTimer: number
  history: Map<number, TitanSample[]>
  historyTimer: number
  results: MatchResults | null
}

function musterPos(index: number, count: number): Vector3 {
  return new Vector3(MUSTER.x + (index - (count - 1) / 2) * 2, EYE_HEIGHT, MUSTER.z)
}

export function createCoopWorld(seed: string, playerIds: string[]): CoopWorld {
  const arena = generateCity(createRng(hashSeed(`${seed}:city`)))
  const w: CoopWorld = {
    seed,
    phase: 'playing',
    wave: 1,
    time: 0,
    tick: 0,
    players: new Map(),
    titans: [],
    arena,
    nav: buildNavGrid(arena),
    rngLive: createRng(hashSeed(`${seed}:live`)),
    nextTitanId: 1,
    pickTimer: 0,
    history: new Map(),
    historyTimer: 0,
    results: null,
  }
  playerIds.forEach((id, i) => {
    if (w.players.has(id)) return
    const body = createPlayer()
    body.pos.copy(musterPos(i, playerIds.length))
    w.players.set(id, {
      id,
      body,
      onGround: false,
      alive: true,
      connected: true,
      deaths: 0,
      score: createScore(),
      offers: [],
      picked: false,
    })
  })
  spawnWave(w)
  return w
}

function connectedCount(w: CoopWorld): number {
  let n = 0
  for (const p of w.players.values()) if (p.connected) n++
  return n
}

function spawnWave(w: CoopWorld): void {
  const rng = createRng(hashSeed(`${w.seed}:wave:${w.wave}`))
  const scale = 1 + COOP_SCALE_PER_PLAYER * (Math.max(1, connectedCount(w)) - 1)
  w.titans = waveComposition(w.wave, rng, scale).map((s) => {
    const [x, z] = nearestWalkable(w.nav, s.x, s.z)
    return createTitan({ id: w.nextTitanId++, kind: s.kind, height: s.height, x, z })
  })
  w.history.clear()
}

export function applyPlayerUpdate(w: CoopWorld, playerId: string, update: PlayerUpdate): void {
  const p = w.players.get(playerId)
  if (!p || !p.connected) return
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
  p.body.pos.copy(pos)
  p.body.vel.copy(vel)
  p.body.onGround = update.onGround
  p.onGround = update.onGround
}

interface TitanTarget {
  pos: Vector3
  dist: number
  playerId: string
}

function pickTargets(w: CoopWorld): Map<number, TitanTarget> {
  const alive: CoopPlayer[] = []
  for (const p of w.players.values()) if (p.connected && p.alive) alive.push(p)
  const targets = new Map<number, TitanTarget>()
  if (alive.length === 0) return targets
  for (const t of w.titans) {
    let best: CoopPlayer = alive[0]!
    let bestDist = Infinity
    for (const p of alive) {
      const dist = Math.hypot(p.body.pos.x - t.pos.x, p.body.pos.z - t.pos.z)
      if (dist < bestDist) {
        best = p
        bestDist = dist
      }
    }
    targets.set(t.id, { pos: best.body.pos, dist: bestDist, playerId: best.id })
  }
  return targets
}

/** Solo's chase tokens, granted per hunted soldier: nobody gets mobbed, nobody is safe. */
function pickCoopChasers(w: CoopWorld, targets: Map<number, TitanTarget>): Set<number> {
  const groups = new Map<string, { id: number; key: number }[]>()
  for (const t of w.titans) {
    if (t.hp <= 0 || t.state === 'crippled' || t.state === 'dead') continue
    const target = targets.get(t.id)
    if (!target) continue
    const engaged = t.state === 'chase' || t.state === 'attack' || t.state === 'leap'
    if (!engaged && target.dist >= aggroRange(t.kind)) continue
    let group = groups.get(target.playerId)
    if (!group) groups.set(target.playerId, (group = []))
    group.push({ id: t.id, key: engaged ? target.dist - 20 : target.dist })
  }
  const tokens = new Set<number>()
  for (const group of groups.values()) {
    group.sort((a, b) => a.key - b.key || a.id - b.id)
    for (const c of group.slice(0, CHASERS_PER_PLAYER)) tokens.add(c.id)
  }
  return tokens
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
  const events: CoopEvent[] = []
  if (w.phase === 'ended') return events
  w.time += dt
  w.tick += 1

  for (const p of w.players.values()) {
    if (!p.connected) continue
    p.body.slashTimer = Math.max(0, p.body.slashTimer - dt)
    p.body.invulnTimer = Math.max(0, p.body.invulnTimer - dt)
    stepScore(p.score, dt)
  }

  if (w.phase === 'upgrading') {
    w.pickTimer -= dt
    if (w.pickTimer <= 0) {
      for (const p of w.players.values()) {
        if (!p.connected || p.picked) continue
        const fallback = p.offers[0]
        if (fallback) {
          applyUpgrade(p.body, fallback.id)
          events.push({ type: 'upgradePicked', playerId: p.id, upgradeId: fallback.id, auto: true })
        }
        p.picked = true
      }
      events.push(...startNextWave(w))
    }
    return events
  }

  w.historyTimer += dt
  if (w.historyTimer >= HISTORY_INTERVAL) {
    w.historyTimer -= HISTORY_INTERVAL
    sampleHistory(w)
  }

  const targets = pickTargets(w)
  const chasers = pickCoopChasers(w, targets)
  for (const titan of w.titans) {
    const target = targets.get(titan.id)
    if (!target) continue // nobody left alive; the wipe check below ends the match
    for (const event of stepTitan(titan, target.pos, dt, w.rngLive, w.arena, w.nav, chasers.has(titan.id))) {
      if (event.type !== 'swat') continue
      for (const p of w.players.values()) {
        if (!p.connected || !p.alive || p.body.invulnTimer > 0) continue
        if (p.body.pos.distanceTo(event.pos) > event.radius) continue
        p.body.hp -= 1
        p.body.invulnTimer = 1.2
        const away = new Vector3(p.body.pos.x - titan.pos.x, 0, p.body.pos.z - titan.pos.z)
        if (away.lengthSq() > 0) away.normalize()
        events.push({
          type: 'playerHit',
          playerId: p.id,
          hp: p.body.hp,
          knockback: { x: away.x * 18, y: 9, z: away.z * 18 },
        })
        if (p.body.hp <= 0) {
          p.alive = false
          p.deaths += 1
          events.push({ type: 'playerDied', playerId: p.id })
        }
      }
    }
  }

  // wave clear before wipe: when the last titan and the last soldier fall together, be generous
  if (w.titans.length > 0 && w.titans.every((t) => t.hp <= 0)) {
    const bonus = WAVE_BONUS * w.wave
    let index = 0
    for (const p of w.players.values()) {
      if (!p.connected) continue
      p.score.score += bonus
      p.offers = offerUpgrades(createRng(hashSeed(`${w.seed}:offers:${w.wave}:${p.id}`)))
      p.picked = false
      if (!p.alive) {
        p.alive = true
        p.body.hp = p.body.config.maxHp
        const pos = musterPos(index, connectedCount(w))
        p.body.pos.copy(pos)
        events.push({ type: 'respawn', playerId: p.id, pos: { x: pos.x, y: pos.y, z: pos.z } })
      }
      events.push({ type: 'offers', playerId: p.id, upgradeIds: p.offers.map((u) => u.id) })
      index += 1
    }
    w.phase = 'upgrading'
    w.pickTimer = PICK_SECONDS
    events.push({ type: 'waveClear', wave: w.wave, bonus })
    return events
  }

  let anyAlive = false
  for (const p of w.players.values()) if (p.connected && p.alive) anyAlive = true
  if (!anyAlive) events.push(endMatch(w))
  return events
}

function allPicked(w: CoopWorld): boolean {
  for (const p of w.players.values()) if (p.connected && !p.picked) return false
  return true
}

function startNextWave(w: CoopWorld): CoopEvent[] {
  w.wave += 1
  for (const p of w.players.values()) {
    if (!p.connected) continue
    p.body.hp = p.body.config.maxHp // a fresh wave starts at full health, same as solo
    p.alive = true
    p.offers = []
    p.picked = false
  }
  spawnWave(w)
  w.phase = 'playing'
  return [{ type: 'waveStart', wave: w.wave }]
}

function endMatch(w: CoopWorld): CoopEvent {
  const ranked = [...w.players.values()]
    .map((p) => ({ id: p.id, score: p.score.score, kills: p.score.kills, deaths: p.deaths }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  w.results = {
    wavesCleared: w.wave - 1,
    durationS: w.time,
    players: ranked.map((r, i) => ({ ...r, mvp: i === 0 && r.score > 0 })),
  }
  w.phase = 'ended'
  return { type: 'teamWipe', results: w.results }
}

/** Rewinds titan poses for validation; hp/ankle mutations land on the live titans. */
function rewindTitans(w: CoopWorld, rewindS: number): () => void {
  const steps = Math.max(0, Math.min(HISTORY_MAX - 1, Math.round(rewindS / HISTORY_INTERVAL)))
  const saved: { t: TitanState; pos: Vector3; facing: number; state: TitanBehavior; rewound: TitanBehavior }[] = []
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

export function coopSlash(w: CoopWorld, playerId: string, rewindS = SLASH_REWIND): CoopEvent[] {
  const events: CoopEvent[] = []
  if (w.phase !== 'playing') return events
  const p = w.players.get(playerId)
  if (!p || !p.connected || !p.alive) return events
  const restore = rewindS > 0 ? rewindTitans(w, rewindS) : () => {}
  const result = trySlash(p.body, w.titans)
  restore()
  if (result.hit || result.bladeBroke) {
    events.push({ type: 'slash', playerId, hit: result.hit, napeHit: result.napeHit })
  }
  if (result.bladeBroke) events.push({ type: 'bladeBroke', playerId })
  if (result.ankleHit && result.titanId !== undefined) {
    const titan = w.titans.find((t) => t.id === result.titanId)
    const remaining = titan ? titan.ankles.filter((cut) => !cut).length : 0
    events.push({
      type: 'ankleSliced',
      playerId,
      titanId: result.titanId,
      remaining,
      side: result.ankleSide ?? 0,
    })
    if (result.crippled) events.push({ type: 'crippled', titanId: result.titanId })
  }
  if (result.killed && result.titanId !== undefined) {
    const killed = w.titans.find((t) => t.id === result.titanId)
    const abnormal = killed?.kind === 'abnormal'
    const points = registerKill(
      p.score,
      { speed: result.speed, airborne: !p.onGround, oneCut: result.oneCut, abnormal },
      p.body.config.killSpeed,
    )
    const heartGained = p.body.hp < p.body.config.maxHp
    if (heartGained) p.body.hp += 1
    events.push({
      type: 'kill',
      playerId,
      titanId: result.titanId,
      points,
      oneCut: result.oneCut,
      speed: result.speed,
      heartGained,
      kind: killed?.kind ?? 'normal',
    })
  }
  return events
}

export function coopPickUpgrade(w: CoopWorld, playerId: string, upgradeId: string): CoopEvent[] {
  if (w.phase !== 'upgrading') return []
  const p = w.players.get(playerId)
  if (!p || !p.connected || p.picked) return []
  const offer = p.offers.find((u) => u.id === upgradeId)
  if (!offer) return []
  applyUpgrade(p.body, offer.id)
  p.picked = true
  const events: CoopEvent[] = [{ type: 'upgradePicked', playerId, upgradeId, auto: false }]
  if (allPicked(w)) events.push(...startNextWave(w))
  return events
}

export function coopResupply(w: CoopWorld, playerId: string): CoopEvent[] {
  if (w.phase === 'ended') return []
  const p = w.players.get(playerId)
  if (!p || !p.connected || !p.alive) return []
  const dist = Math.hypot(p.body.pos.x - w.arena.station.x, p.body.pos.z - w.arena.station.z)
  if (dist > RESUPPLY_RADIUS) return []
  p.body.gas = p.body.config.maxGas
  p.body.canisters = p.body.config.gasCanisters
  p.body.blades = p.body.config.bladePairs
  p.body.bladeHp = p.body.config.bladeDurability
  p.body.hp = p.body.config.maxHp
  return [{ type: 'resupply', playerId }]
}

export function removePlayer(w: CoopWorld, playerId: string): CoopEvent[] {
  const p = w.players.get(playerId)
  if (!p || !p.connected) return []
  p.connected = false
  const events: CoopEvent[] = []
  if (w.phase === 'playing') {
    let anyAlive = false
    for (const other of w.players.values()) if (other.connected && other.alive) anyAlive = true
    if (!anyAlive && connectedCount(w) > 0) events.push(endMatch(w))
    if (connectedCount(w) === 0) w.phase = 'ended' // empty room: nothing to rank or persist
  } else if (w.phase === 'upgrading') {
    if (connectedCount(w) === 0) w.phase = 'ended'
    else if (allPicked(w)) events.push(...startNextWave(w))
  }
  return events
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
  players: {
    id: string
    x: number
    y: number
    z: number
    vx: number
    vy: number
    vz: number
    onGround: boolean
    hp: number
    maxHp: number
    alive: boolean
    connected: boolean
    score: number
    kills: number
    combo: number
    blades: number
    picked: boolean
  }[]
  results: MatchResults | null
}

const r2 = (v: number): number => Math.round(v * 100) / 100

export function coopSnapshot(w: CoopWorld): CoopSnapshot {
  return {
    tick: w.tick,
    phase: w.phase,
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
    players: [...w.players.values()].map((p) => ({
      id: p.id,
      x: r2(p.body.pos.x),
      y: r2(p.body.pos.y),
      z: r2(p.body.pos.z),
      vx: r2(p.body.vel.x),
      vy: r2(p.body.vel.y),
      vz: r2(p.body.vel.z),
      onGround: p.onGround,
      hp: p.body.hp,
      maxHp: p.body.config.maxHp,
      alive: p.alive,
      connected: p.connected,
      score: p.score.score,
      kills: p.score.kills,
      combo: p.score.combo,
      blades: p.body.blades,
      picked: p.picked,
    })),
    results: w.results,
  }
}
