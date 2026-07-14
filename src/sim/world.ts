import { Vector3 } from 'three'
import type { BossFight } from './boss'
import { createBossFight, bossForMilestone, bossSpawnPoint, steamRadius, stepBoss } from './boss'
import type { Arena } from './city'
import { baseGroundY, clampToCeiling, maxTitanHeightAt, nearestStationDist } from './city'
import type { SlashResult } from './combat'
import { oneCutSpeed, stepSlashBuffer, trySlash } from './combat'
import { LAMP_BATTERY_SECONDS } from './flashlight'
import type { GrabState, GrabWatch } from './grab'
import {
  GRAB_HP_COST,
  GRAB_REGRAB_COOLDOWN,
  createGrabWatch,
  findGrabCandidates,
  grabHoldPoint,
  startGrab,
  stepGrab,
  updateGrabWatch,
} from './grab'
import type { HuntState } from './hunt'
import type { GameMap } from './maps'
import type { GameMode } from './modes'
import type { NavGrid } from './nav'
import { buildNavGrid, nearestWalkable } from './nav'
import type { InputState, PlayerState } from './player'
import { createPlayer, neutralInput } from './player'
import type { RaceState } from './race'
import type { Rng } from './rng'
import { createRng, hashSeed } from './rng'
import type { ScoreState } from './score'
import {
  createScore,
  registerBossBreak,
  registerBossKill,
  registerKill,
  registerSpearKill,
  stepScore,
} from './score'
import type { SpearPickup, SpearState } from './spear'
import {
  BLAST_RADIUS,
  PICKUPS_PER_WAVE,
  collectPickups,
  fireSpear,
  spawnPickups,
  stepSpears,
} from './spear'
import type { TitanKind, TitanState } from './titan'
import { aggroRange, createTitan, forwardOf, stepTitan } from './titan'
import type { Upgrade } from './upgrades'
import { applyUpgrade, offerUpgrades } from './upgrades'
import { waveComposition } from './waves'

/**
 * The world: one shared simulation of titans, waves, Shifters, spears and the soldiers
 * fighting them. Solo drives it with a roster of one and no wire; the co-op server drives
 * it with N and streams snapshots. Everything a mode, a map, a titan kind or a boss can do
 * happens here, exactly once, so content cannot be silently singleplayer-only (ADR 0003).
 *
 * What lives OUTSIDE the world, on purpose:
 *  - Player physics (stepPlayer, hooks, boost). Every client owns its own body and reports
 *    it; the world reads positions and writes consequences. This is why solo keeps its
 *    zero-latency feel and why a co-op client never waits for the server to move.
 *  - Focus / bullet time. A shared world cannot slow down for one soldier, so the SOLO
 *    driver scales dt before it calls in. The world has no idea time ever bent.
 */

export type WorldPhase = 'menu' | 'playing' | 'upgrading' | 'dead' | 'finished' | 'ended'

export interface HookAnchor {
  x: number
  y: number
  z: number
}

/** Cosmetic pose relayed to teammates; the world never acts on it. */
export interface PlayerPose {
  yaw: number
  pitch: number
  hooks: [HookAnchor | null, HookAnchor | null]
}

/**
 * One soldier in the world. In solo this wraps the very same PlayerState the client is
 * flying (no copy, no mirror); on the co-op server `body` is the authoritative shadow whose
 * position each client reports.
 */
export interface Soldier {
  id: string
  body: PlayerState
  onGround: boolean
  /** Aim carried by the last slash/fire intent; a buffered swing keeps connecting along it. */
  aim: Vector3 | null
  pose: PlayerPose
  alive: boolean
  connected: boolean
  deaths: number
  score: ScoreState
  offers: Upgrade[]
  picked: boolean
  /** The fist around this soldier and the mash-to-escape QTE; null while free (grab.ts). */
  grab: GrabState | null
  /** Loiter clock that arms a grab, plus the post-grab grace before it counts again. */
  grabWatch: GrabWatch
  /** Fresh mash presses banked since the last tick (solo: keyboard; co-op: intents). */
  mash: number
  /** Latches for the supply warnings, so each one speaks once per emptying, not per tick. */
  warned: { gas: boolean; blades: boolean }
}

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface World {
  seed: string
  /** The city's own seed; a co-op room keeps one city across rematches while waves vary. */
  citySeed: string
  map: GameMap
  mode: GameMode
  arena: Arena
  nav: NavGrid
  phase: WorldPhase
  wave: number
  time: number
  tick: number
  soldiers: Soldier[]
  titans: TitanState[]
  /** Thunder spears in flight or stuck-and-fusing; despawn on blast or fizzle. */
  spears: SpearState[]
  /** Who fired each live spear (by spear id): blast kills credit the owner. */
  spearOwners: Map<number, string>
  /** The current wave's spear caches; replaced wholesale when a wave spawns. */
  pickups: SpearPickup[]
  /** Restock generation within the wave: boss fights respawn emptied caches (round > 0). */
  pickupRound: number
  /** Counts down while a Shifter fight sits with every cache taken; at zero, restock. */
  pickupRespawnTimer: number
  /** The live Shifter fight on a boss wave; null everywhere else (boss.ts, ADR 0002). */
  boss: BossFight | null
  /** Signal Run's course and clock; null in every other mode. */
  race: RaceState | null
  /** The Culling's countdown; null in every other mode. */
  hunt: HuntState | null
  /** The Culling's rule: every titan tracks map-wide and never abandons a chase. */
  relentless: boolean
  rngLive: Rng
  nextTitanId: number
  nextSpearId: number
  /** The upgrade intermission's clock; only co-op runs it down (solo picks at its leisure). */
  pickTimer: number
  events: WorldEvent[]
  storage: StorageLike | null
  /** Last tick's input for the world's *local* soldier; only a solo driver fills it in. */
  prevInput: InputState
  /** True when N clients share this world: enables the wire's tolerances and team rules. */
  coop: boolean
  results: MatchResults | null
}

export interface MatchResults {
  wavesCleared: number
  durationS: number
  players: { id: string; score: number; kills: number; deaths: number; mvp: boolean }[]
}

/**
 * Everything the world can announce. Player-scoped events carry `playerId` — solo ignores
 * it (there is only ever one soldier), co-op relays it to every client. This is one union
 * precisely so a new event cannot exist in one mode of play and not the other.
 */
export type WorldEvent =
  | { type: 'hook'; index: 0 | 1; point: Vector3 }
  | { type: 'unhook'; index: 0 | 1 }
  | { type: 'slash'; playerId?: string; hit: boolean; napeHit: boolean }
  /** A buffered swing connected a beat after its press (contact feedback, no new swing fx). */
  | { type: 'slashConnect'; playerId?: string; napeHit: boolean }
  | { type: 'ankleSliced'; playerId?: string; titanId: number; remaining: number; side: 0 | 1 }
  | { type: 'crippled'; titanId: number }
  | {
      type: 'kill'
      playerId?: string
      titanId: number
      points: number
      oneCut: boolean
      speed: number
      heartGained: boolean
      kind: TitanKind
      weapon: 'blade' | 'spear' | 'focus'
    }
  | { type: 'focusCharge'; charge: number; full: boolean }
  | { type: 'strike'; titanId: number }
  | { type: 'empty'; kind: 'blades' | 'gas' | 'spears' }
  | { type: 'bladeBroke'; playerId?: string }
  | { type: 'spearFired'; playerId?: string; remaining: number }
  | { type: 'spearStuck'; titanId: number | null }
  | { type: 'spearFizzled' }
  | { type: 'spearDetonated'; pos: Vector3; radius: number }
  | { type: 'staggered'; titanId: number }
  | { type: 'spearPickup'; playerId?: string; remaining: number }
  /** A Shifter fight restocked its emptied caches: plated fights never strand you dry. */
  | { type: 'spearCachesRestocked' }
  /** Thrown by a teammate's blast without losing hearts: friendly fire is knockback only. */
  | { type: 'blasted'; playerId?: string; knockback: { x: number; y: number; z: number } }
  | {
      type: 'playerHit'
      playerId?: string
      hp: number
      knockback?: { x: number; y: number; z: number }
    }
  | { type: 'playerDied'; playerId?: string }
  | { type: 'respawn'; playerId?: string; pos: { x: number; y: number; z: number } }
  // the grab QTE: fist closes, mash succeeds, timer empties, or the holder drops you
  | { type: 'grabbed'; playerId?: string; titanId: number }
  | { type: 'grabEscaped'; playerId?: string; titanId: number }
  | { type: 'grabFailed'; playerId?: string; titanId: number; hp: number }
  | { type: 'grabReleased'; playerId?: string; titanId: number }
  | { type: 'waveClear'; wave: number; bonus: number }
  | { type: 'waveStart'; wave: number }
  | { type: 'offers'; playerId?: string; upgradeIds: string[] }
  | { type: 'upgradePicked'; playerId?: string; upgradeId: string; auto: boolean }
  | { type: 'teamWipe'; results: MatchResults }
  // the Shifter fight: engagement bar, plate feedback, breaks, and the fall
  | {
      type: 'bossEngaged'
      titanId: number
      name: string
      parts: { name: string; hp: number; maxHp: number }[]
    }
  | { type: 'bossPlated'; titanId: number }
  | { type: 'bossPlateCracked'; titanId: number; partIndex: number }
  | { type: 'bossPartBroken'; titanId: number; partIndex: number; partName: string; points: number }
  | { type: 'bossKilled'; titanId: number; name: string; points: number; flawless: boolean }
  | { type: 'bossThrowWindup'; titanId: number }
  | { type: 'bossProjectileImpact'; pos: Vector3 }
  | { type: 'bossSummon'; titanId: number; count: number }
  | { type: 'bossSteam'; on: boolean }
  | { type: 'bossRoar'; titanId: number }
  | { type: 'bossSpikeTelegraph'; x: number; z: number }
  | { type: 'bossSpike'; x: number; z: number }
  | { type: 'resupply'; playerId?: string; kit: boolean }
  | { type: 'lampLow' }
  | { type: 'lampDead' }
  | { type: 'canisterSwap'; remaining: number }
  // the supply warnings: you should be told to go back BEFORE you are dry, not after
  | { type: 'gasLow'; fraction: number }
  | { type: 'bladesLow'; fraction: number; oneCutSpeed: number }
  | { type: 'boost' }
  | { type: 'death' }
  // Signal Run: the clock arming, ordered ring passes with PB deltas, and the finish
  | { type: 'raceArmed' }
  | { type: 'gatePass'; index: number; total: number; split: number; delta: number | null }
  | { type: 'raceFinished'; time: number; splits: number[]; pb: boolean; delta: number | null }
  | { type: 'raceRestart' }
  // The Culling: the countdown entering panic range, and the run dying at zero
  | { type: 'huntUrgency' }
  | { type: 'huntTimeout'; level: number; cleared: number }
  // client intents in co-op: the net layer forwards these to the room server
  | { type: 'coopSlash' }
  | { type: 'coopFire' }
  | { type: 'coopResupply' }
  | { type: 'coopMash' }

/** Only a few titans hunt one soldier at once, or the maze becomes a blender. */
export const MAX_CHASERS = 3
export const WAVE_BONUS = 250
export const PICK_SECONDS = 15 // co-op's upgrade intermission timer; expiry auto-picks
export const COOP_SCALE_PER_PLAYER = 0.75 // extra titans per extra soldier
export const RESUPPLY_RADIUS = 10
/** Co-op judges resupply against a *reported* position: a little slack for the wire. */
export const RESUPPLY_REPORT_SLACK = 5
/** Seconds an all-taken cache set sits empty during a boss fight before restocking. */
export const SPEAR_RESTOCK_DELAY = 8
export const SOLO_ID = 'solo'
/** The muster point every soldier spawns on; solo starts there too. */
export const MUSTER = { x: 0, z: 8 }

export function createSoldier(id: string, body = createPlayer()): Soldier {
  return {
    id,
    body,
    onGround: false,
    aim: null,
    pose: { yaw: 0, pitch: 0, hooks: [null, null] },
    alive: true,
    connected: true,
    deaths: 0,
    score: createScore(),
    offers: [],
    picked: false,
    grab: null,
    grabWatch: createGrabWatch(),
    mash: 0,
    warned: { gas: false, blades: false },
  }
}

export function musterPos(index: number, count: number): Vector3 {
  return new Vector3(MUSTER.x + (index - (count - 1) / 2) * 2, 1.7, MUSTER.z)
}

export function soldierById(w: World, id: string): Soldier | undefined {
  return w.soldiers.find((s) => s.id === id)
}

/** Soldiers who can be hunted, hit and scored this tick. */
export function activeSoldiers(w: World): Soldier[] {
  return w.soldiers.filter((s) => s.connected && s.alive)
}

export function connectedCount(w: World): number {
  return w.soldiers.reduce((n, s) => (s.connected ? n + 1 : n), 0)
}

/** The squad size the world scales rosters and caches to; never below one. */
export function squadSize(w: World): number {
  return Math.max(1, connectedCount(w))
}

export function createWorld(opts: {
  seed: string
  citySeed?: string
  map: GameMap
  mode: GameMode
  soldiers: Soldier[]
  storage?: StorageLike | null
  coop?: boolean
}): World {
  const citySeed = opts.citySeed ?? opts.seed
  const arena = opts.map.generate(citySeed)
  return {
    seed: opts.seed,
    citySeed,
    map: opts.map,
    mode: opts.mode,
    arena,
    nav: buildNavGrid(arena),
    phase: 'menu',
    wave: 0,
    time: 0,
    tick: 0,
    soldiers: opts.soldiers,
    titans: [],
    spears: [],
    spearOwners: new Map(),
    pickups: [],
    pickupRound: 0,
    pickupRespawnTimer: 0,
    boss: null,
    race: null,
    hunt: null,
    relentless: false,
    rngLive: createRng(hashSeed(`${opts.seed}:live`)),
    nextTitanId: 1,
    nextSpearId: 1,
    pickTimer: 0,
    events: [],
    storage: opts.storage ?? null,
    prevInput: neutralInput(),
    coop: opts.coop ?? false,
    results: null,
  }
}

// ---------------------------------------------------------------------------
// Waves: one spawner, every mode, every map, solo and co-op alike.
// ---------------------------------------------------------------------------

/**
 * The roster for the world's current wave. A milestone wave fields the map's Shifter (the
 * Colossal never walks into a cavern it cannot stand in — bossLadderFor drops it rather
 * than shrinking it); an ordinary wave fields the mode's composition, scaled to the squad
 * and ducked under whatever roof it spawns beneath.
 */
export function spawnWave(w: World): void {
  const squad = squadSize(w)
  const milestone = bossForMilestone(w.wave, w.mode.id, w.arena)
  if (milestone) {
    const [gx, gz] = bossSpawnPoint(w.arena)
    const [x, z] = nearestWalkable(w.nav, gx, gz)
    // four blades cut four times as fast: the pools grow with the squad so a Shifter
    // fight lasts a fight, however many soldiers walk in (user ruling, 2026-07-14)
    const fight = createBossFight(
      w.nextTitanId++,
      milestone.spec,
      w.wave,
      w.seed,
      x,
      z,
      milestone.lap,
      squad,
    )
    w.boss = fight
    w.titans = [fight.titan]
  } else {
    w.boss = null
    const rng = createRng(hashSeed(`${w.seed}:wave:${w.wave}`))
    const scale = 1 + COOP_SCALE_PER_PLAYER * (squad - 1)
    w.titans = waveComposition(w.wave, rng, scale, w.arena.wallRadius).map((s) => {
      // snap spawns onto walkable streets so no titan starts its life inside a house...
      const [x, z] = nearestWalkable(w.nav, s.x, s.z)
      // ...and duck it under the roof it stands beneath, so nothing spawns head-in-rock
      const height = Math.min(s.height, maxTitanHeightAt(w.arena, x, z))
      return createTitan({ id: w.nextTitanId++, kind: s.kind, height, x, z })
    })
  }
  // fresh caches each wave, scaled to the squad: everyone can restock, spears stay scarce
  w.pickups = spawnPickups(w.seed, w.wave, w.nav, PICKUPS_PER_WAVE + 2 * (squad - 1))
  w.pickupRound = 0
  w.pickupRespawnTimer = 0
  // spears riding last wave's corpses go with them
  w.spears = w.spears.filter((s) => s.titanId === null)
  for (const [id] of w.spearOwners) {
    if (!w.spears.some((s) => s.id === id)) w.spearOwners.delete(id)
  }
}

/** A wave falls: bonus, offers, respawns, and the intermission every mode shares. */
export function clearWave(w: World): void {
  const bonus = WAVE_BONUS * w.wave
  let index = 0
  const squad = squadSize(w)
  for (const s of w.soldiers) {
    if (!s.connected) continue
    s.score.score += bonus
    // per-soldier offer streams: two soldiers are never handed the same three cards
    const stream = w.coop ? `${w.seed}:offers:${w.wave}:${s.id}` : `${w.seed}:offers:${w.wave}`
    s.offers = offerUpgrades(createRng(hashSeed(stream)))
    s.picked = false
    if (!s.alive) {
      s.alive = true
      s.body.hp = s.body.config.maxHp
      const pos = musterPos(index, squad)
      s.body.pos.copy(pos)
      w.events.push({ type: 'respawn', playerId: s.id, pos: { x: pos.x, y: pos.y, z: pos.z } })
    }
    if (w.coop) w.events.push({ type: 'offers', playerId: s.id, upgradeIds: s.offers.map((u) => u.id) })
    index += 1
  }
  w.phase = 'upgrading'
  w.pickTimer = PICK_SECONDS
  w.events.push({ type: 'waveClear', wave: w.wave, bonus })
}

function allPicked(w: World): boolean {
  return w.soldiers.every((s) => !s.connected || s.picked)
}

export function startNextWave(w: World): void {
  w.wave += 1
  for (const s of w.soldiers) {
    if (!s.connected) continue
    s.body.hp = s.body.config.maxHp // a fresh wave starts at full health
    s.body.kits = s.body.config.fieldKits // and a fresh pouch: kits do not bank across waves
    s.alive = true
    s.offers = []
    s.picked = false
  }
  spawnWave(w)
  w.phase = 'playing'
  w.events.push({ type: 'waveStart', wave: w.wave })
}

/** A soldier takes their upgrade; the wave turns once everyone has. */
export function pickUpgrade(w: World, soldierId: string, upgradeId: string, auto = false): void {
  if (w.phase !== 'upgrading') return
  const s = soldierById(w, soldierId)
  if (!s || !s.connected || s.picked) return
  const offer = s.offers.find((u) => u.id === upgradeId)
  if (!offer) return
  applyUpgrade(s.body, offer.id)
  s.body.hp = s.body.config.maxHp
  s.offers = []
  s.picked = true
  w.events.push({ type: 'upgradePicked', playerId: s.id, upgradeId, auto })
  if (allPicked(w)) startNextWave(w)
}

// ---------------------------------------------------------------------------
// Titans: who hunts whom, and what a fist does when it lands.
// ---------------------------------------------------------------------------

interface TitanTarget {
  pos: Vector3
  dist: number
  soldier: Soldier
}

/** Every titan hunts its nearest living soldier; solo's "nearest" is the only one. */
function pickTargets(w: World): Map<number, TitanTarget> {
  const targets = new Map<number, TitanTarget>()
  const alive = activeSoldiers(w)
  if (alive.length === 0) return targets
  for (const t of w.titans) {
    let best = alive[0]!
    let bestDist = Infinity
    for (const s of alive) {
      const dist = Math.hypot(s.body.pos.x - t.pos.x, s.body.pos.z - t.pos.z)
      if (dist < bestDist) {
        best = s
        bestDist = dist
      }
    }
    targets.set(t.id, { pos: best.body.pos, dist: bestDist, soldier: best })
  }
  return targets
}

/**
 * Chase tokens, granted per hunted soldier: nobody gets mobbed, nobody is safe. Relentless
 * (The Culling) lifts the cap entirely, and a Shifter never yields its hunt to its summons.
 */
function pickChasers(w: World, targets: Map<number, TitanTarget>): Set<number> {
  const groups = new Map<string, { id: number; key: number }[]>()
  for (const t of w.titans) {
    if (t.hp <= 0 || t.state === 'crippled' || t.state === 'staggered' || t.state === 'dead') continue
    const target = targets.get(t.id)
    if (!target) continue
    const engaged = t.state === 'chase' || t.state === 'attack' || t.state === 'leap'
    if (!engaged && !w.relentless && target.dist >= aggroRange(t.kind)) continue
    let group = groups.get(target.soldier.id)
    if (!group) groups.set(target.soldier.id, (group = []))
    group.push({ id: t.id, key: engaged ? target.dist - 20 : target.dist })
  }
  const tokens = new Set<number>()
  for (const group of groups.values()) {
    group.sort((a, b) => a.key - b.key || a.id - b.id)
    const cap = w.relentless ? group.length : MAX_CHASERS
    for (const c of group.slice(0, cap)) tokens.add(c.id)
  }
  for (const t of w.titans) {
    if (t.kind === 'shifter' && t.hp > 0) tokens.add(t.id)
  }
  return tokens
}

/**
 * A hit on a soldier: one heart, invulnerability, and a shove away from whatever landed it.
 * The world applies the knockback to its own body AND ships it on the event — solo *is* the
 * client (so the shove lands directly), while a co-op client owns its physics and applies
 * the shove itself when the event arrives.
 */
export function hurtSoldier(w: World, s: Soldier, from: Vector3, knock: number, up: number): void {
  if (s.body.invulnTimer > 0 || !s.alive) return
  s.body.hp -= 1
  s.body.invulnTimer = 1.2
  const away = new Vector3(s.body.pos.x - from.x, 0, s.body.pos.z - from.z)
  if (away.lengthSq() > 0) away.normalize()
  else away.set(0, 0, 1) // standing exactly on it: any direction will do
  s.body.vel.addScaledVector(away, knock)
  s.body.vel.y += up
  w.events.push({
    type: 'playerHit',
    playerId: s.id,
    hp: s.body.hp,
    knockback: { x: away.x * knock, y: up, z: away.z * knock },
  })
  if (s.body.hp <= 0) killSoldier(w, s)
}

/** The soldier falls. Solo ends the run; co-op benches them until the wave turns. */
export function killSoldier(w: World, s: Soldier): void {
  s.alive = false
  s.deaths += 1
  w.events.push({ type: 'playerDied', playerId: s.id })
  s.grab = null
  if (!w.coop) {
    w.phase = 'dead'
    w.events.push({ type: 'death' })
  }
}

function stepTitans(w: World, dt: number): void {
  const targets = pickTargets(w)
  const chasers = pickChasers(w, targets)
  for (const titan of w.titans) {
    const holding = w.soldiers.find((s) => s.grab && s.grab.titanId === titan.id)
    if (holding) {
      titan.vel.set(0, 0, 0) // the holder stands still and squeezes; no walking, no swats
      continue
    }
    const target = targets.get(titan.id)
    if (!target) continue // nobody left alive; the wipe check ends the match
    // a Shifter runs the shared state machine on its own spec stats, relentlessly
    const shifter = titan.kind === 'shifter' && w.boss?.titan.id === titan.id
    for (const event of stepTitan(
      titan,
      target.pos,
      dt,
      w.rngLive,
      w.arena,
      w.nav,
      chasers.has(titan.id),
      w.relentless || shifter,
      shifter ? w.boss?.spec.stats : undefined,
    )) {
      if (event.type !== 'swat') continue
      for (const s of activeSoldiers(w)) {
        if (s.body.invulnTimer > 0) continue
        if (s.body.pos.distanceTo(event.pos) > event.radius) continue
        hurtSoldier(w, s, titan.pos, 18, 9)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Blades and spears.
// ---------------------------------------------------------------------------

/** Everything a connected slash owes the world: wounds, kills, boss breaks, score. */
function slashOutcome(w: World, s: Soldier, result: SlashResult, airborne: boolean): void {
  const p = s.body
  if (result.bladeBroke) w.events.push({ type: 'bladeBroke', playerId: s.id })
  if (result.bossBody && result.titanId !== undefined) {
    w.events.push({ type: 'bossPlated', titanId: result.titanId }) // the hide clinks
  }
  if (result.boss && w.boss) {
    const outcome = result.boss
    const titanId = w.boss.titan.id
    if (outcome.plated) w.events.push({ type: 'bossPlated', titanId })
    if (outcome.broken && !outcome.killed) {
      const points = registerBossBreak(s.score)
      w.events.push({
        type: 'bossPartBroken',
        titanId,
        partIndex: outcome.partIndex,
        partName: outcome.partName,
        points,
      })
    }
    if (outcome.killed) {
      bankBossKill(w, s, {
        speed: result.speed,
        airborne,
        flawless: outcome.flawless,
        weapon: 'blade',
      })
    }
    return
  }
  if (result.ankleHit && result.titanId !== undefined) {
    const titan = w.titans.find((t) => t.id === result.titanId)
    const remaining = titan ? titan.ankles.filter((cut) => !cut).length : 0
    w.events.push({
      type: 'ankleSliced',
      playerId: s.id,
      titanId: result.titanId,
      remaining,
      side: result.ankleSide ?? 0,
    })
    if (result.crippled) w.events.push({ type: 'crippled', titanId: result.titanId })
  }
  if (result.killed && result.titanId !== undefined) {
    const killed = w.titans.find((t) => t.id === result.titanId)
    const abnormal = killed?.kind === 'abnormal'
    const points = registerKill(
      s.score,
      { speed: result.speed, airborne, oneCut: result.oneCut, abnormal },
      p.config.killSpeed,
    )
    p.gas = Math.min(p.config.maxGas, p.gas + p.config.gasKillRefund)
    const heartGained = p.hp < p.config.maxHp
    if (heartGained) p.hp += 1 // every kill buys a heart back
    w.events.push({
      type: 'kill',
      playerId: s.id,
      titanId: result.titanId,
      points,
      oneCut: result.oneCut,
      speed: result.speed,
      heartGained,
      kind: killed?.kind ?? 'normal',
      weapon: 'blade',
    })
  }
}

/**
 * The Shifter falls: jackpot scoring, the banner event, a heart back like any kill, and its
 * living summons dissolve on the spot (no mop-up anticlimax, no points for corpses).
 */
function bankBossKill(
  w: World,
  s: Soldier,
  info: { speed: number; airborne: boolean; flawless: boolean; weapon: 'blade' | 'spear' },
): void {
  const boss = w.boss
  if (!boss) return
  const p = s.body
  const points = registerBossKill(
    s.score,
    { speed: info.speed, airborne: info.airborne, flawless: info.flawless },
    p.config.killSpeed,
  )
  p.gas = Math.min(p.config.maxGas, p.gas + p.config.gasKillRefund)
  const heartGained = p.hp < p.config.maxHp
  if (heartGained) p.hp += 1
  for (const id of boss.state.summonIds) {
    const summon = w.titans.find((t) => t.id === id)
    if (summon && summon.hp > 0) {
      summon.hp = 0
      summon.state = 'dead'
      summon.stateTime = 0
    }
  }
  w.events.push({
    type: 'kill',
    playerId: s.id,
    titanId: boss.titan.id,
    points,
    oneCut: false,
    speed: info.speed,
    heartGained,
    kind: 'shifter',
    weapon: info.weapon,
  })
  w.events.push({
    type: 'bossKilled',
    titanId: boss.titan.id,
    name: boss.spec.name,
    points,
    flawless: info.flawless,
  })
}

/** A swing, wherever it came from: solo's keypress or a co-op client's intent. */
export function worldSlash(w: World, s: Soldier, aim: Vector3 | null): void {
  if (w.phase !== 'playing' || !s.alive || !s.connected) return
  if (aim && ![aim.x, aim.y, aim.z].every(Number.isFinite)) aim = null
  s.aim = aim
  if (s.body.blades <= 0) {
    w.events.push({ type: 'empty', kind: 'blades' }) // nothing to swing: jam, don't sweep
    return
  }
  const airborne = !s.body.onGround
  const result = trySlash(s.body, w.titans, aim, w.boss)
  w.events.push({ type: 'slash', playerId: s.id, hit: result.hit, napeHit: result.napeHit })
  slashOutcome(w, s, result, airborne)
}

/** A spear leaves the rack, along the client-owned aim. */
export function worldFire(w: World, s: Soldier, aim: Vector3): void {
  if (w.phase !== 'playing' || !s.alive || !s.connected) return
  if (![aim.x, aim.y, aim.z].every(Number.isFinite)) return
  if (s.body.spears <= 0) {
    w.events.push({ type: 'empty', kind: 'spears' }) // rack is dry: find a pickup
    return
  }
  const spear = fireSpear(s.body, w.nextSpearId, aim)
  if (!spear) return
  w.nextSpearId += 1
  w.spears.push(spear)
  w.spearOwners.set(spear.id, s.id)
  w.events.push({ type: 'spearFired', playerId: s.id, remaining: s.body.spears })
}

function stepWorldSpears(w: World, dt: number): void {
  if (w.spears.length === 0) return
  // solo's blast still knows where its one soldier stands; co-op resolves per soldier below
  const result = stepSpears(w.spears, w.titans, null, w.arena, dt, w.boss)
  for (const stuck of result.stuck) w.events.push({ type: 'spearStuck', titanId: stuck.titanId })
  for (const id of result.fizzled) {
    w.events.push({ type: 'spearFizzled' })
    w.spearOwners.delete(id)
  }
  for (const blast of result.blasts) {
    w.events.push({ type: 'spearDetonated', pos: blast.pos.clone(), radius: blast.radius })
    for (const titanId of blast.staggered) w.events.push({ type: 'staggered', titanId })
    // a spear with no recorded owner still kills, it just pays nobody — except in solo,
    // where there is only one soldier it could ever have belonged to
    const ownerId = w.spearOwners.get(blast.spearId) ?? (w.coop ? undefined : w.soldiers[0]?.id)
    const owner = ownerId !== undefined ? soldierById(w, ownerId) : undefined

    if (blast.boss && w.boss) {
      const outcome = blast.boss
      const titanId = w.boss.titan.id
      if (outcome.cracked) {
        w.events.push({ type: 'bossPlateCracked', titanId, partIndex: outcome.partIndex })
      }
      if (outcome.broken && !outcome.killed && owner) {
        const points = registerBossBreak(owner.score)
        w.events.push({
          type: 'bossPartBroken',
          titanId,
          partIndex: outcome.partIndex,
          partName: outcome.partName,
          points,
        })
      }
      if (outcome.killed && owner) {
        // a blast wound always chips, so a spear finish is never flawless by definition
        bankBossKill(w, owner, { speed: 0, airborne: false, flawless: false, weapon: 'spear' })
      }
    }

    for (const kill of blast.kills) {
      const points = owner ? registerSpearKill(owner.score, { abnormal: kill.kind === 'abnormal' }) : 0
      let heartGained = false
      if (owner) {
        const p = owner.body
        p.gas = Math.min(p.config.maxGas, p.gas + p.config.gasKillRefund)
        heartGained = p.hp < p.config.maxHp
        if (heartGained) p.hp += 1 // a kill is a kill: the heart comes back
      }
      w.events.push({
        type: 'kill',
        playerId: ownerId,
        titanId: kill.titanId,
        points,
        oneCut: false,
        speed: 0,
        heartGained,
        kind: kill.kind,
        weapon: 'spear',
      })
    }

    // everyone in the radius gets thrown; only the soldier who fired it pays a heart
    for (const s of activeSoldiers(w)) {
      if (s.body.pos.distanceTo(blast.pos) > BLAST_RADIUS) continue
      const away = new Vector3(s.body.pos.x - blast.pos.x, 0, s.body.pos.z - blast.pos.z)
      if (away.lengthSq() > 0) away.normalize()
      else away.set(0, 0, 1)
      if (!w.coop || s.id === ownerId) {
        hurtSoldier(w, s, blast.pos, 22, 10)
      } else {
        s.body.vel.addScaledVector(away, 22)
        s.body.vel.y += 10
        w.events.push({
          type: 'blasted',
          playerId: s.id,
          knockback: { x: away.x * 22, y: 10, z: away.z * 22 },
        })
      }
    }
  }
  for (const [id] of w.spearOwners) {
    if (!w.spears.some((s) => s.id === id)) w.spearOwners.delete(id)
  }
}

/**
 * Refills at a station; co-op allows a little slack because the position is a report.
 *
 * Out of a station's reach, a soldier carrying a Field Kit spends one instead. The station is
 * still free and unlimited — the kit only buys you the walk you did not take, and it is the
 * kit that is consumed, never the station.
 */
export function worldResupply(w: World, s: Soldier): boolean {
  if (w.phase === 'ended' || w.phase === 'dead' || !s.alive || !s.connected) return false
  const p = s.body
  const radius = RESUPPLY_RADIUS + (w.coop ? RESUPPLY_REPORT_SLACK : 0)
  const atStation = nearestStationDist(w.arena, p.pos.x, p.pos.z) <= radius
  if (!atStation && p.kits <= 0) return false
  if (!atStation) p.kits -= 1
  p.gas = p.config.maxGas
  p.canisters = p.config.gasCanisters
  p.blades = p.config.bladePairs
  p.bladeHp = p.config.bladeDurability
  p.hp = p.config.maxHp
  p.lamp = LAMP_BATTERY_SECONDS
  w.events.push({ type: 'resupply', playerId: s.id, kit: !atStation })
  return true
}

// ---------------------------------------------------------------------------
// The grab QTE. Adapted for co-op, not dropped: the fist takes anyone, and everyone
// mashes their own way out (user ruling, 2026-07-14 — no teammate rescue in v1).
// ---------------------------------------------------------------------------

/**
 * Pins the soldier in the titan's fist. A grab bypasses stepPlayer entirely, so the clamps
 * that normally keep a soldier out of the cavern roof never run — without this, being
 * picked up underground puts your head in the rock.
 */
function holdSoldier(w: World, s: Soldier, titan: TitanState): void {
  s.body.pos.copy(grabHoldPoint(titan))
  s.body.vel.set(0, 0, 0)
  s.body.onGround = false
  clampToCeiling(w.arena, s.body.pos, s.body.vel, 0.9)
}

export function beginGrab(w: World, s: Soldier, titan: TitanState): void {
  s.grab = startGrab(titan)
  holdSoldier(w, s, titan)
  s.body.bankedSpeed = 0
  w.events.push({ type: 'grabbed', playerId: s.id, titanId: titan.id })
}

/**
 * One held tick: the soldier stays pinned to the hold point, banked mash presses fill the
 * escape bar, and the timer decides between a fling free and a squeeze worth GRAB_HP_COST
 * hearts. The holder dying or being staggered loose ends it early.
 */
function stepHeldSoldier(w: World, s: Soldier, dt: number): void {
  const grab = s.grab
  if (!grab) return
  const titan = w.titans.find((t) => t.id === grab.titanId)
  if (!titan || titan.hp <= 0 || titan.state === 'staggered' || titan.state === 'dead') {
    s.grab = null
    s.grabWatch.cooldown = GRAB_REGRAB_COOLDOWN
    s.body.invulnTimer = Math.max(s.body.invulnTimer, 0.8)
    w.events.push({ type: 'grabReleased', playerId: s.id, titanId: grab.titanId })
    return
  }
  // the fist is the only thing allowed to hurt you: swats and blasts pass over
  s.body.invulnTimer = Math.max(s.body.invulnTimer, 0.1)
  holdSoldier(w, s, titan)
  // every mash banked since the last tick counts; the press is counted before the timer so
  // the final mash on the last tick still breaks free
  const escapePresses = s.body.config.grabEscapePresses
  let result = stepGrab(grab, s.mash > 0, dt, escapePresses)
  for (let i = 1; i < s.mash && result === 'held'; i++) {
    result = stepGrab(grab, true, 0, escapePresses)
  }
  s.mash = 0
  if (result === 'held') return
  s.grab = null
  s.grabWatch.cooldown = GRAB_REGRAB_COOLDOWN
  const away = forwardOf(titan)
  if (result === 'escaped') {
    s.body.vel.copy(away).multiplyScalar(13)
    s.body.vel.y = 10
    s.body.invulnTimer = 1.2
    titan.attackCooldown = Math.max(titan.attackCooldown, 1.5) // no swat mid-fling
    w.events.push({ type: 'grabEscaped', playerId: s.id, titanId: titan.id })
  } else {
    s.body.hp -= GRAB_HP_COST
    s.body.invulnTimer = 1.5
    s.body.vel.copy(away).multiplyScalar(10)
    s.body.vel.y = 8
    w.events.push({ type: 'grabFailed', playerId: s.id, titanId: titan.id, hp: s.body.hp })
    w.events.push({ type: 'playerHit', playerId: s.id, hp: s.body.hp })
    if (s.body.hp <= 0) killSoldier(w, s)
  }
}

/**
 * The pre-grab watch for every free soldier: loitering slow inside a titan's reach arms the
 * fist. `blocked` soldiers (invulnerable, mid-strike) never get caught.
 */
function stepGrabWatches(w: World, dt: number): void {
  for (const s of activeSoldiers(w)) {
    if (s.grab) continue
    const blocked = s.body.invulnTimer > 0
    const grabber = updateGrabWatch(s.grabWatch, s.body, w.titans, dt, blocked)
    if (grabber) {
      beginGrab(w, s, grabber)
    } else if (s.grabWatch.linger > 0) {
      // a catchable soldier gets reached for, not slapped: every fist in range holds its
      // swat while the linger fills (a slap would fling them out of the grab's reach)
      for (const reaching of findGrabCandidates(s.body, w.titans)) {
        reaching.attackCooldown = Math.max(reaching.attackCooldown, 0.2)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// The Shifter fight.
// ---------------------------------------------------------------------------

/** The soldier a Shifter is currently working on: the nearest one still standing. */
function nearestSoldierPos(w: World, to: Vector3): Vector3 | null {
  let best: Vector3 | null = null
  let bestDist = Infinity
  for (const s of activeSoldiers(w)) {
    const dist = s.body.pos.distanceTo(to)
    if (dist < bestDist) {
      best = s.body.pos
      bestDist = dist
    }
  }
  return best
}

/** One tick of the Shifter's own behavior: abilities, projectiles, aura, summons. */
function stepBossFight(w: World, dt: number): void {
  const boss = w.boss
  if (!boss || boss.titan.hp <= 0) return
  const titanId = boss.titan.id

  // plated fights are spear-gated, so a Shifter never strands you dry: once every cache is
  // taken the streets restock after a breath, on fresh deterministic spots per round.
  // Ordinary waves keep their scarcity — this runs only while a boss is alive.
  if (w.pickups.length > 0 && w.pickups.every((pickup) => pickup.taken)) {
    w.pickupRespawnTimer -= dt
    if (w.pickupRespawnTimer <= 0) {
      w.pickupRound += 1
      const squad = squadSize(w)
      w.pickups = spawnPickups(
        w.seed,
        w.wave,
        w.nav,
        PICKUPS_PER_WAVE + 2 * (squad - 1),
        w.pickupRound,
      )
      w.events.push({ type: 'spearCachesRestocked' })
    }
  } else {
    w.pickupRespawnTimer = SPEAR_RESTOCK_DELAY
  }

  const playerPos = nearestSoldierPos(w, boss.titan.pos)
  if (!playerPos) return // nobody left to fight

  const liveSummons = boss.state.summonIds.reduce((count, id) => {
    const t = w.titans.find((titan) => titan.id === id)
    return t && t.hp > 0 ? count + 1 : count
  }, 0)

  const events = stepBoss(boss, {
    playerPos,
    dt,
    liveSummons,
    groundY: (x, z) => baseGroundY(w.arena, x, z),
  })

  for (const event of events) {
    switch (event.type) {
      case 'engaged':
        w.events.push({
          type: 'bossEngaged',
          titanId,
          name: boss.spec.name,
          parts: boss.spec.parts.map((partSpec, i) => ({
            name: partSpec.name,
            hp: boss.state.parts[i]!.hp,
            maxHp: boss.state.parts[i]!.maxHp,
          })),
        })
        break
      case 'throwWindup':
        w.events.push({ type: 'bossThrowWindup', titanId })
        break
      case 'throw':
        break // the flight itself is render-polled off boss.state.projectiles
      case 'projectileImpact':
        w.events.push({ type: 'bossProjectileImpact', pos: event.pos.clone() })
        for (const s of activeSoldiers(w)) {
          if (s.body.pos.distanceTo(event.pos) <= event.radius) hurtSoldier(w, s, event.pos, 20, 10)
        }
        break
      case 'summon': {
        for (const spawn of event.spawns) {
          const [x, z] = nearestWalkable(w.nav, spawn.x, spawn.z)
          // a screamed-in pure ducks the roof like anything else that spawns
          const height = Math.min(spawn.height, maxTitanHeightAt(w.arena, x, z))
          const pure = createTitan({ id: w.nextTitanId++, kind: 'normal', height, x, z })
          pure.state = 'chase' // screamed straight onto the soldiers, no wandering in
          w.titans.push(pure)
          boss.state.summonIds.push(pure.id)
        }
        w.events.push({ type: 'bossSummon', titanId, count: event.spawns.length })
        break
      }
      case 'steam':
        w.events.push({ type: 'bossSteam', on: event.on })
        break
      case 'roar': {
        w.events.push({ type: 'bossRoar', titanId })
        // the shockwave shoves without wounding: repositioning pressure, not chip damage
        for (const s of activeSoldiers(w)) {
          const away = new Vector3(
            s.body.pos.x - boss.titan.pos.x,
            0,
            s.body.pos.z - boss.titan.pos.z,
          )
          if (away.lengthSq() > 0) away.normalize()
          else away.set(0, 0, 1)
          s.body.vel.addScaledVector(away, 26)
          s.body.vel.y += 12
          if (w.coop) {
            w.events.push({
              type: 'blasted',
              playerId: s.id,
              knockback: { x: away.x * 26, y: 12, z: away.z * 26 },
            })
          }
        }
        break
      }
      case 'spikeTelegraph':
        w.events.push({ type: 'bossSpikeTelegraph', x: event.x, z: event.z })
        break
      case 'spike': {
        w.events.push({ type: 'bossSpike', x: event.x, z: event.z })
        for (const s of activeSoldiers(w)) {
          const horiz = Math.hypot(s.body.pos.x - event.x, s.body.pos.z - event.z)
          if (horiz <= event.radius && s.body.pos.y < 6) {
            hurtSoldier(w, s, new Vector3(event.x, 0, event.z), 10, 16)
          }
        }
        break
      }
    }
  }

  // the steam aura is a standing zone, not an event: scald anyone inside while it vents
  if (boss.state.steamOn) {
    for (const s of activeSoldiers(w)) {
      const horiz = Math.hypot(
        s.body.pos.x - boss.titan.pos.x,
        s.body.pos.z - boss.titan.pos.z,
      )
      if (horiz <= steamRadius(boss.titan) && s.body.pos.y < boss.titan.height) {
        hurtSoldier(w, s, boss.titan.pos, 14, 8)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Supply warnings. Both are read off the LOCAL soldier's body, so both drivers call this
// from the client side: gas and canisters never reach the server (they are client-owned,
// see ADR 0003's ownership table), and a warning you get from a snapshot is a warning that
// arrives 100 ms late. Edge-triggered with hysteresis, like the flashlight's lampLow.
// ---------------------------------------------------------------------------

/** Below this fraction of capacity the soldier is told to think about a station. */
export const SUPPLY_LOW_FRACTION = 0.25
/** Back above this, the warning re-arms. The gap stops a nagging flicker at the boundary. */
const SUPPLY_REARM_FRACTION = 0.4

/** Gas in the tank plus every full canister on the rig, as a fraction of the rig's capacity. */
export function gasFraction(p: PlayerState): number {
  const capacity = p.config.maxGas * (1 + p.config.gasCanisters)
  if (capacity <= 0) return 0
  return (p.gas + p.canisters * p.config.maxGas) / capacity
}

/** Edge left across every pair still on the rack, as a fraction of a full loadout. */
export function bladeFraction(p: PlayerState): number {
  const capacity = p.config.bladePairs * p.config.bladeDurability
  if (capacity <= 0) return 0
  const left = Math.max(0, p.blades - 1) * p.config.bladeDurability + p.bladeHp
  return left / capacity
}

/**
 * Warns once as gas or edge runs low, and re-arms when a resupply brings it back. The
 * blades warning carries the risen one-cut bar with it, because that is the actual cost of
 * fighting on worn steel: not "you will run out", but "titans stop dying at the speed you
 * are used to".
 */
export function checkSupplyWarnings(w: World, s: Soldier): void {
  const p = s.body
  const gas = gasFraction(p)
  if (gas <= SUPPLY_LOW_FRACTION && !s.warned.gas) {
    s.warned.gas = true
    w.events.push({ type: 'gasLow', fraction: gas })
  } else if (gas >= SUPPLY_REARM_FRACTION && s.warned.gas) {
    s.warned.gas = false
  }
  const edge = bladeFraction(p)
  if (edge <= SUPPLY_LOW_FRACTION && !s.warned.blades) {
    s.warned.blades = true
    w.events.push({ type: 'bladesLow', fraction: edge, oneCutSpeed: oneCutSpeed(p) })
  } else if (edge >= SUPPLY_REARM_FRACTION && s.warned.blades) {
    s.warned.blades = false
  }
}

// ---------------------------------------------------------------------------
// The tick.
// ---------------------------------------------------------------------------

/**
 * One world tick, shared by both drivers. The caller has already moved its own soldiers
 * (physics is client-owned) and queued their intents through worldSlash/worldFire/etc.
 *
 * Events land in `w.events`; the caller drains them. Solo calls this at 120 Hz with dt
 * already scaled by Focus; the room calls it at 120 Hz in 30 Hz slices.
 */
export function stepWorld(w: World, dt: number, input: InputState = neutralInput()): void {
  if (w.phase === 'ended' || w.phase === 'dead' || w.phase === 'finished' || w.phase === 'menu') {
    return
  }
  w.time += dt
  w.tick += 1

  for (const s of w.soldiers) {
    if (!s.connected) continue
    s.body.slashTimer = Math.max(0, s.body.slashTimer - dt)
    s.body.invulnTimer = Math.max(0, s.body.invulnTimer - dt)
    s.body.fireTimer = Math.max(0, s.body.fireTimer - dt)
    stepScore(s.score, dt)
    if (w.phase === 'playing' && s.alive && !s.grab) {
      // a swing whose press landed a beat early connects the moment a titan arrives
      const late = stepSlashBuffer(s.body, w.titans, s.aim, dt, w.boss)
      if (late) {
        w.events.push({ type: 'slashConnect', playerId: s.id, napeHit: late.napeHit })
        slashOutcome(w, s, late, !s.body.onGround)
      }
    }
  }

  if (w.phase === 'upgrading') {
    // co-op cannot wait forever on one soldier's menu: the clock auto-picks for them
    if (w.coop) {
      w.pickTimer -= dt
      if (w.pickTimer <= 0) {
        for (const s of w.soldiers) {
          if (!s.connected || s.picked) continue
          const fallback = s.offers[0]
          if (fallback) pickUpgrade(w, s.id, fallback.id, true)
          s.picked = true
        }
        if (!allPicked(w)) return
        if (w.phase === 'upgrading') startNextWave(w)
      }
    }
    return
  }

  // held soldiers do nothing but mash; free ones can be reached for
  for (const s of activeSoldiers(w)) {
    if (s.grab) stepHeldSoldier(w, s, dt)
  }
  stepGrabWatches(w, dt)

  // fly-through cache collection, first come first served in roster order
  for (const s of activeSoldiers(w)) {
    for (const _id of collectPickups(w.pickups, s.body)) {
      w.events.push({ type: 'spearPickup', playerId: s.id, remaining: s.body.spears })
    }
  }

  // spears resolve before titan AI so a fresh stagger suppresses this tick's swat
  stepWorldSpears(w, dt)
  stepTitans(w, dt)
  stepBossFight(w, dt)

  // the mode drives progression (wave clears, objectives, win/lose)
  if (w.phase === 'playing') w.mode.step(w, dt, input)

  if (w.coop && w.phase === 'playing') {
    if (!w.soldiers.some((s) => s.connected && s.alive)) endMatch(w)
  }
}

export function endMatch(w: World): void {
  const ranked = w.soldiers
    .map((s) => ({ id: s.id, score: s.score.score, kills: s.score.kills, deaths: s.deaths }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  w.results = {
    wavesCleared: w.wave - 1,
    durationS: w.time,
    players: ranked.map((r, i) => ({ ...r, mvp: i === 0 && r.score > 0 })),
  }
  w.phase = 'ended'
  w.events.push({ type: 'teamWipe', results: w.results })
}

/** A soldier leaves mid-match: the world closes over the gap. */
export function removeSoldier(w: World, id: string): void {
  const s = soldierById(w, id)
  if (!s || !s.connected) return
  s.connected = false
  s.grab = null
  if (w.phase === 'playing') {
    if (!w.soldiers.some((o) => o.connected && o.alive)) endMatch(w)
  } else if (w.phase === 'upgrading') {
    if (connectedCount(w) === 0) endMatch(w)
    else if (allPicked(w)) startNextWave(w)
  }
}
