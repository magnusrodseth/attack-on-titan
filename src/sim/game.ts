import { Vector3 } from 'three'
import type { Arena } from './city'
import { generateCity, raycastHookTarget } from './city'
import { EYE_HEIGHT } from './constants'
import type { SlashResult } from './combat'
import { stepSlashBuffer, trySlash } from './combat'
import { clockFraction } from './daynight'
import { LAMP_BATTERY_SECONDS, LAMP_LOW_SECONDS, drainLamp } from './flashlight'
import type { HuntState } from './hunt'
import type { GameMode } from './modes'
import { DEFAULT_MODE_ID, getMode } from './modes'
import type { NavGrid } from './nav'
import { buildNavGrid } from './nav'
import type { RaceState } from './race'
import type { InputState, PlayerState } from './player'
import { BOOST_COST, createPlayer, neutralInput, stepPlayer, tryBoost } from './player'
import type { Rng } from './rng'
import { createRng, hashSeed } from './rng'
import { attachHook, attachHookToTitan, releaseHook, updateTitanAnchor } from './rope'
import type { ScoreState } from './score'
import { createScore, registerKill, registerSpearKill, stepScore } from './score'
import type { SpearPickup, SpearState } from './spear'
import { collectPickups, fireSpear, stepSpears } from './spear'
import type { StrikeState } from './strike'
import { createStrike, findStrikeTarget, stepStrike } from './strike'
import type { TitanKind, TitanState } from './titan'
import { aggroRange, isFootballer, raycastTitan, stepTitan } from './titan'
import type { Upgrade } from './upgrades'

export type GamePhase = 'menu' | 'playing' | 'upgrading' | 'dead' | 'finished'

// Focus (bullet time): a charge banked one kill at a time. At full charge a TAP of Q opens
// one fixed slow-mo window that always runs its full course — releasing Q cannot end it, so
// a quick tap never wastes the charge. Lining the crosshair up with a nape during the
// window offers the focus strike (see strike.ts), which spends the window on the spot.
export const FOCUS_TIME_SCALE = 0.3
export const FOCUS_MAX = 100
export const FOCUS_KILLS_TO_FILL = 3
/** Real seconds one focus window lasts; the world runs at FOCUS_TIME_SCALE throughout. */
export const FOCUS_WINDOW_SECONDS = 3
const FOCUS_DRAIN = FOCUS_MAX / (FOCUS_WINDOW_SECONDS * FOCUS_TIME_SCALE) // per sim-second

export type GameEvent =
  | { type: 'hook'; index: 0 | 1; point: Vector3 }
  | { type: 'unhook'; index: 0 | 1 }
  | { type: 'slash'; hit: boolean; napeHit: boolean }
  /** A buffered swing connected a beat after its press (contact feedback, no new swing fx). */
  | { type: 'slashConnect'; napeHit: boolean }
  | { type: 'ankleSliced'; titanId: number; remaining: number; side: 0 | 1 }
  | { type: 'crippled'; titanId: number }
  | { type: 'kill'; titanId: number; points: number; oneCut: boolean; speed: number; heartGained: boolean; kind: TitanKind; weapon: 'blade' | 'spear' | 'focus' }
  | { type: 'focusCharge'; charge: number; full: boolean }
  | { type: 'strike'; titanId: number }
  | { type: 'empty'; kind: 'blades' | 'gas' | 'spears' }
  | { type: 'bladeBroke' }
  | { type: 'spearFired'; remaining: number }
  | { type: 'spearStuck'; titanId: number | null }
  | { type: 'spearFizzled' }
  | { type: 'spearDetonated'; pos: Vector3 }
  | { type: 'staggered'; titanId: number }
  | { type: 'spearPickup'; remaining: number }
  | { type: 'playerHit'; hp: number }
  | { type: 'waveClear'; wave: number; bonus: number }
  | { type: 'resupply' }
  | { type: 'lampLow' }
  | { type: 'lampDead' }
  | { type: 'canisterSwap'; remaining: number }
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

export interface BestStats {
  bestScore: number
  bestWave: number
}

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface GameState {
  seed: string
  phase: GamePhase
  wave: number
  time: number
  player: PlayerState
  titans: TitanState[]
  /** Thunder spears in flight or stuck-and-fusing; despawn on blast or fizzle. */
  spears: SpearState[]
  /** The current wave's spear caches; replaced wholesale when a wave spawns. */
  pickups: SpearPickup[]
  arena: Arena
  /** Walkable street grid derived from the arena; never persisted, rebuilt from seed. */
  nav: NavGrid
  score: ScoreState
  offers: Upgrade[]
  events: GameEvent[]
  best: BestStats
  storage: StorageLike | null
  rngLive: Rng
  prevInput: InputState
  nextTitanId: number
  nextSpearId: number
  focus: number
  focusActive: boolean
  /** Kills banked toward the next focus window (0..FOCUS_KILLS_TO_FILL). */
  focusCharge: number
  /** The in-flight focus strike dash; the dash owns player movement while set. */
  strike: StrikeState | null
  /** Titan whose nape the crosshair is locked onto during an active focus window. */
  strikeTargetId: number | null
  mode: GameMode
  /** Signal Run's course and clock; null in every other mode. */
  race: RaceState | null
  /** The Culling's countdown; null in every other mode. */
  hunt: HuntState | null
  /** The Culling's rule: every titan tracks map-wide and never abandons a chase. */
  relentless: boolean
}

const BEST_KEY = 'aot-odm-best'
const RESUPPLY_RADIUS = 10

function defaultStorage(): StorageLike | null {
  return typeof localStorage === 'undefined' ? null : localStorage
}

export function loadBest(storage: StorageLike | null): BestStats {
  try {
    const raw = storage?.getItem(BEST_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<BestStats>
      return { bestScore: parsed.bestScore ?? 0, bestWave: parsed.bestWave ?? 0 }
    }
  } catch {
    // corrupt storage falls through to defaults
  }
  return { bestScore: 0, bestWave: 0 }
}

export function saveBest(g: GameState): void {
  g.best.bestScore = Math.max(g.best.bestScore, g.score.score)
  g.best.bestWave = Math.max(g.best.bestWave, g.wave)
  try {
    g.storage?.setItem(BEST_KEY, JSON.stringify(g.best))
  } catch {
    // storage may be unavailable (private mode); the run still works
  }
}

export function createGame(
  seed: string,
  storage: StorageLike | null = defaultStorage(),
  modeId: string = DEFAULT_MODE_ID,
): GameState {
  const arena = generateCity(createRng(hashSeed(`${seed}:city`)))
  return {
    seed,
    phase: 'menu',
    wave: 0,
    time: 0,
    player: createPlayer(),
    titans: [],
    spears: [],
    pickups: [],
    arena,
    nav: buildNavGrid(arena),
    score: createScore(),
    offers: [],
    events: [],
    best: loadBest(storage),
    storage,
    rngLive: createRng(hashSeed(`${seed}:live`)),
    prevInput: neutralInput(),
    nextTitanId: 1,
    nextSpearId: 1,
    focus: 0,
    focusActive: false,
    focusCharge: 0,
    strike: null,
    strikeTargetId: null,
    mode: getMode(modeId),
    race: null,
    hunt: null,
    relentless: false,
  }
}

export function startGame(g: GameState): void {
  g.player = createPlayer()
  g.player.pos.set(0, EYE_HEIGHT, 8)
  g.score = createScore()
  g.wave = 0
  g.time = 0
  g.offers = []
  g.titans = []
  g.spears = []
  g.pickups = []
  g.race = null
  g.hunt = null
  g.relentless = false
  g.focus = 0
  g.focusActive = false
  g.focusCharge = 0
  g.strike = null
  g.strikeTargetId = null
  g.phase = 'playing' // set first so the mode may override it from start()
  g.mode.start(g)
}

export function chooseUpgrade(g: GameState, id: string): void {
  if (g.phase !== 'upgrading') return
  g.mode.chooseUpgrade?.(g, id)
}

export function stepGame(g: GameState, input: InputState, dt: number): void {
  g.events = []
  if (g.phase !== 'playing') {
    copyInput(g.prevInput, input)
    return
  }
  g.time += dt
  const p = g.player
  stepLamp(g, dt)

  // focus: a full charge buys one fixed slow-mo window (main loop applies FOCUS_TIME_SCALE).
  // The tap only opens it; the window runs to the end of its 3 real seconds no matter what
  // Q does afterwards — only the strike or an intermission cuts it short.
  if (g.focusActive) {
    g.focus = Math.max(0, g.focus - FOCUS_DRAIN * dt)
    if (g.focus <= 0) g.focusActive = false
  } else if (
    input.focus &&
    !g.prevInput.focus &&
    g.focusCharge >= FOCUS_KILLS_TO_FILL &&
    !g.strike
  ) {
    g.focusActive = true
    g.focusCharge = 0
    g.focus = FOCUS_MAX
  }

  // the crosshair lock only exists inside an active window; firing needs this step's aim
  g.strikeTargetId =
    g.focusActive && !g.strike ? findStrikeTarget(p.pos, input.lookDir, g.titans, g.arena) : null

  // F with a lock fires the strike; the same press must not also swing a blade
  if (input.slash && !g.prevInput.slash && g.strikeTargetId !== null) {
    beginStrike(g, g.strikeTargetId)
  }

  if (g.strike) {
    // the dash owns the soldier: no hooks, blades, spears or footwork until it lands
    stepStrikeDash(g, dt)
  } else {
    stepPlayerActions(g, input, dt)
  }

  // spears resolve before titan AI so a fresh stagger suppresses this tick's swat
  const spearResult = stepSpears(g.spears, g.titans, p.pos, g.arena, dt)
  for (const stuck of spearResult.stuck) {
    g.events.push({ type: 'spearStuck', titanId: stuck.titanId })
  }
  for (const _id of spearResult.fizzled) {
    g.events.push({ type: 'spearFizzled' })
  }
  for (const blast of spearResult.blasts) {
    g.events.push({ type: 'spearDetonated', pos: blast.pos.clone() })
    for (const titanId of blast.staggered) {
      g.events.push({ type: 'staggered', titanId })
    }
    for (const kill of blast.kills) {
      const points = registerSpearKill(g.score, {
        abnormal: kill.kind === 'abnormal',
        footballer: isFootballer(kill.kind),
      })
      p.gas = Math.min(p.config.maxGas, p.gas + p.config.gasKillRefund)
      const heartGained = p.hp < p.config.maxHp
      if (heartGained) p.hp += 1 // a kill is a kill: the heart comes back
      g.events.push({
        type: 'kill',
        titanId: kill.titanId,
        points,
        oneCut: false,
        speed: 0,
        heartGained,
        kind: kill.kind,
        weapon: 'spear',
      })
      grantFocusCharge(g)
    }
    if (blast.playerInBlast && p.invulnTimer <= 0) {
      p.hp -= 1
      p.invulnTimer = 1.2
      const away = new Vector3(p.pos.x - blast.pos.x, 0, p.pos.z - blast.pos.z)
      if (away.lengthSq() > 0) away.normalize()
      else away.set(0, 0, 1) // standing exactly on the spear: any direction will do
      p.vel.addScaledVector(away, 22)
      p.vel.y += 10
      g.events.push({ type: 'playerHit', hp: p.hp })
      if (p.hp <= 0) {
        g.phase = 'dead'
        saveBest(g)
        g.events.push({ type: 'death' })
      }
    }
  }

  const chasers = pickChasers(g)
  for (const titan of g.titans) {
    for (const event of stepTitan(titan, p.pos, dt, g.rngLive, g.arena, g.nav, chasers.has(titan.id), g.relentless)) {
      if (event.type !== 'swat') continue
      if (p.invulnTimer > 0) continue
      if (p.pos.distanceTo(event.pos) > event.radius) continue
      p.hp -= 1
      p.invulnTimer = 1.2
      const away = new Vector3(p.pos.x - titan.pos.x, 0, p.pos.z - titan.pos.z)
      if (away.lengthSq() > 0) away.normalize()
      p.vel.addScaledVector(away, 18)
      p.vel.y += 9
      g.events.push({ type: 'playerHit', hp: p.hp })
      if (p.hp <= 0) {
        g.phase = 'dead'
        saveBest(g)
        g.events.push({ type: 'death' })
      }
    }
  }

  stepScore(g.score, dt)

  // the mode drives progression (wave clears, objectives, win/lose)
  if (g.phase === 'playing') g.mode.step(g, dt, input)
  if (g.phase !== 'playing') {
    saveBest(g) // the run just ended or hit an intermission
    // a strike that cleared the wave must not resume as a stale dash next wave, and the
    // slow-mo window (its charge already committed) does not survive an intermission
    g.strike = null
    g.strikeTargetId = null
    g.focusActive = false
    g.focus = 0
  }

  copyInput(g.prevInput, input)
}

/** Everything the soldier does with their own hands; skipped while a strike dash flies. */
function stepPlayerActions(g: GameState, input: InputState, dt: number): void {
  const p = g.player
  const canistersBefore = p.canisters
  if (input.gas && !g.prevInput.gas) {
    if (tryBoost(p, input.lookDir)) {
      g.events.push({ type: 'boost' })
    } else if (!p.onGround && p.boostCooldown <= 0 && p.gas < BOOST_COST && p.canisters <= 0) {
      g.events.push({ type: 'empty', kind: 'gas' }) // truly dry, not just cooling down
    }
  }

  handleHookEdge(g, 0, input.hookL, g.prevInput.hookL, input)
  handleHookEdge(g, 1, input.hookR, g.prevInput.hookR, input)

  // a live swing from a fraction of a second ago connects the moment a titan arrives
  const late = stepSlashBuffer(p, g.titans, input.lookDir, dt)
  if (late) {
    g.events.push({ type: 'slashConnect', napeHit: late.napeHit })
    emitSlashOutcome(g, late, !p.onGround)
  }

  if (input.slash && !g.prevInput.slash) {
    if (p.blades <= 0) {
      g.events.push({ type: 'empty', kind: 'blades' }) // nothing to swing: jam, don't sweep
    } else {
      const airborne = !p.onGround
      const result = trySlash(p, g.titans, input.lookDir)
      g.events.push({ type: 'slash', hit: result.hit, napeHit: result.napeHit })
      emitSlashOutcome(g, result, airborne)
    }
  }

  if (input.fire && !g.prevInput.fire) {
    if (p.spears <= 0) {
      g.events.push({ type: 'empty', kind: 'spears' }) // rack is dry: find a pickup
    } else {
      const spear = fireSpear(p, g.nextSpearId, input.lookDir)
      if (spear) {
        g.nextSpearId += 1
        g.spears.push(spear)
        g.events.push({ type: 'spearFired', remaining: p.spears })
      }
    }
  }

  if (input.resupply && !g.prevInput.resupply) {
    const dist = Math.hypot(p.pos.x - g.arena.station.x, p.pos.z - g.arena.station.z)
    if (dist <= RESUPPLY_RADIUS) {
      p.gas = p.config.maxGas
      p.canisters = p.config.gasCanisters
      p.blades = p.config.bladePairs
      p.bladeHp = p.config.bladeDurability
      p.hp = p.config.maxHp
      p.lamp = LAMP_BATTERY_SECONDS
      g.events.push({ type: 'resupply' })
    }
  }

  syncTitanHooks(g)

  stepPlayer(p, input, dt, g.arena)
  if (p.canisters < canistersBefore) {
    g.events.push({ type: 'canisterSwap', remaining: p.canisters })
  }

  for (const _id of collectPickups(g.pickups, p)) {
    g.events.push({ type: 'spearPickup', remaining: p.spears })
  }
}

/** Everything a connected slash owes the world: wound events, kill scoring, focus charge. */
function emitSlashOutcome(g: GameState, result: SlashResult, airborne: boolean): void {
  const p = g.player
  if (result.bladeBroke) g.events.push({ type: 'bladeBroke' })
  if (result.ankleHit && result.titanId !== undefined) {
    const titan = g.titans.find((t) => t.id === result.titanId)
    const remaining = titan ? titan.ankles.filter((cut) => !cut).length : 0
    g.events.push({
      type: 'ankleSliced',
      titanId: result.titanId,
      remaining,
      side: result.ankleSide ?? 0,
    })
    if (result.crippled) g.events.push({ type: 'crippled', titanId: result.titanId })
  }
  if (result.killed && result.titanId !== undefined) {
    const killed = g.titans.find((t) => t.id === result.titanId)
    const abnormal = killed?.kind === 'abnormal'
    const footballer = killed !== undefined && isFootballer(killed.kind)
    const points = registerKill(
      g.score,
      { speed: result.speed, airborne, oneCut: result.oneCut, abnormal, footballer },
      p.config.killSpeed,
    )
    p.gas = Math.min(p.config.maxGas, p.gas + p.config.gasKillRefund)
    const heartGained = p.hp < p.config.maxHp
    if (heartGained) p.hp += 1 // every kill buys a heart back
    g.events.push({
      type: 'kill',
      titanId: result.titanId,
      points,
      oneCut: result.oneCut,
      speed: result.speed,
      heartGained,
      kind: killed?.kind ?? 'normal',
      weapon: 'blade',
    })
    grantFocusCharge(g)
  }
}

/** Every kill banks a third of the next focus window, however it was earned. */
function grantFocusCharge(g: GameState): void {
  if (g.focusCharge >= FOCUS_KILLS_TO_FILL) return
  g.focusCharge += 1
  g.events.push({
    type: 'focusCharge',
    charge: g.focusCharge,
    full: g.focusCharge >= FOCUS_KILLS_TO_FILL,
  })
}

/** Fires the focus strike: time snaps back to full speed and the dash takes the soldier. */
function beginStrike(g: GameState, titanId: number): void {
  const titan = g.titans.find((t) => t.id === titanId)
  if (!titan) return
  const p = g.player
  g.focusActive = false // the cut from molasses to blur IS the zoom
  g.focus = 0
  g.strikeTargetId = null
  for (const [index, hook] of p.hooks.entries()) {
    // a taut rope would fight the homing path
    if (hook.state === 'attached') {
      releaseHook(hook)
      g.events.push({ type: 'unhook', index: index as 0 | 1 })
    }
  }
  g.strike = createStrike(titan, p.pos)
  g.events.push({ type: 'strike', titanId })
}

function stepStrikeDash(g: GameState, dt: number): void {
  if (!g.strike) return
  const p = g.player
  p.invulnTimer = Math.max(p.invulnTimer, 0.2) // untouchable while the dash owns movement
  const result = stepStrike(g.strike, p, g.titans, g.arena, dt)
  if (result.killed) {
    const killed = result.killed
    const points = registerKill(
      g.score,
      {
        speed: p.config.speedCap, // pays what a blade kill at the speed cap would
        airborne: true,
        oneCut: result.oneCut,
        abnormal: killed.kind === 'abnormal',
        footballer: isFootballer(killed.kind),
      },
      p.config.killSpeed,
    )
    p.gas = Math.min(p.config.maxGas, p.gas + p.config.gasKillRefund)
    const heartGained = p.hp < p.config.maxHp
    if (heartGained) p.hp += 1 // a kill is a kill: the heart comes back
    g.events.push({
      type: 'kill',
      titanId: killed.id,
      points,
      oneCut: result.oneCut,
      speed: p.config.speedCap,
      heartGained,
      kind: killed.kind,
      weapon: 'focus',
    })
    grantFocusCharge(g)
  }
  if (result.done) g.strike = null
}

/**
 * Burns flashlight battery while the beam is lit (night), with edge-triggered warnings.
 * Shared by the solo loop and the co-op client — the battery is a personal resource the
 * server never needs to see.
 */
export function stepLamp(g: GameState, dt: number): void {
  const p = g.player
  const before = p.lamp
  p.lamp = drainLamp(p.lamp, clockFraction(g.seed, g.time), dt)
  if (before > LAMP_LOW_SECONDS && p.lamp <= LAMP_LOW_SECONDS && p.lamp > 0) {
    g.events.push({ type: 'lampLow' })
  }
  if (before > 0 && p.lamp <= 0) g.events.push({ type: 'lampDead' })
}

// Only a few titans hunt at once, or the maze becomes a blender. Tokens go to the
// nearest engaged-or-aggroed titans; engaged ones get a stickiness bonus so the set
// does not flip-flop at range boundaries.
export const MAX_CHASERS = 3

function pickChasers(g: GameState): Set<number> {
  const p = g.player
  const candidates: { id: number; key: number }[] = []
  for (const t of g.titans) {
    if (t.hp <= 0 || t.state === 'crippled' || t.state === 'staggered' || t.state === 'dead') continue
    const dist = Math.hypot(p.pos.x - t.pos.x, p.pos.z - t.pos.z)
    const engaged = t.state === 'chase' || t.state === 'attack' || t.state === 'leap'
    if (!engaged && !g.relentless && dist >= aggroRange(t.kind)) continue
    candidates.push({ id: t.id, key: engaged ? dist - 20 : dist })
  }
  candidates.sort((a, b) => a.key - b.key || a.id - b.id)
  // relentless (The Culling): no chase cap — the whole district converges
  const cap = g.relentless ? candidates.length : MAX_CHASERS
  return new Set(candidates.slice(0, cap).map((c) => c.id))
}

export function handleHookEdge(
  g: GameState,
  index: 0 | 1,
  held: boolean,
  wasHeld: boolean,
  input: InputState,
): void {
  const hook = g.player.hooks[index]
  if (held && !wasHeld) {
    const dir = input.lookDir.clone().normalize()
    const range = g.player.config.hookRange
    const cityPoint = raycastHookTarget(g.arena, g.player.pos, dir, range)
    const cityDist = cityPoint ? g.player.pos.distanceTo(cityPoint) : Infinity

    let bestTitan: TitanState | null = null
    let bestTitanDist = Infinity
    for (const titan of g.titans) {
      const dist = raycastTitan(titan, g.player.pos, dir, range)
      if (dist !== null && dist < bestTitanDist) {
        bestTitan = titan
        bestTitanDist = dist
      }
    }

    if (bestTitan && bestTitanDist < cityDist) {
      const point = g.player.pos.clone().addScaledVector(dir, bestTitanDist)
      attachHookToTitan(hook, bestTitan, point, g.player.pos)
      g.events.push({ type: 'hook', index, point: point.clone() })
    } else if (cityPoint) {
      attachHook(hook, cityPoint, g.player.pos)
      g.events.push({ type: 'hook', index, point: cityPoint.clone() })
    }
  } else if (!held && wasHeld && hook.state === 'attached') {
    releaseHook(hook)
    g.events.push({ type: 'unhook', index })
  }
}

/** Titan-attached anchors follow their titan; hooks in dead titans tear free. */
export function syncTitanHooks(g: GameState): void {
  for (const [index, hook] of g.player.hooks.entries()) {
    if (hook.state !== 'attached' || hook.titanId === null) continue
    const titan = g.titans.find((t) => t.id === hook.titanId)
    if (!titan || titan.hp <= 0) {
      releaseHook(hook)
      g.events.push({ type: 'unhook', index: index as 0 | 1 })
    } else {
      updateTitanAnchor(hook, titan)
    }
  }
}

export function copyInput(dst: InputState, src: InputState): void {
  dst.move.copy(src.move)
  dst.lookDir.copy(src.lookDir)
  dst.gas = src.gas
  dst.jump = src.jump
  dst.focus = src.focus
  dst.slash = src.slash
  dst.fire = src.fire
  dst.hookL = src.hookL
  dst.hookR = src.hookR
  dst.resupply = src.resupply
}
