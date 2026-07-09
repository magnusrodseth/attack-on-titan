import { Vector3 } from 'three'
import type { Arena } from './city'
import { generateCity, raycastHookTarget } from './city'
import { EYE_HEIGHT } from './constants'
import { trySlash } from './combat'
import type { GameMode } from './modes'
import { DEFAULT_MODE_ID, getMode } from './modes'
import type { InputState, PlayerState } from './player'
import { createPlayer, neutralInput, stepPlayer, tryBoost } from './player'
import type { Rng } from './rng'
import { createRng, hashSeed } from './rng'
import { attachHook, attachHookToTitan, releaseHook, updateTitanAnchor } from './rope'
import type { ScoreState } from './score'
import { createScore, registerKill, stepScore } from './score'
import type { TitanState } from './titan'
import { raycastTitan, stepTitan } from './titan'
import type { Upgrade } from './upgrades'

export type GamePhase = 'menu' | 'playing' | 'upgrading' | 'dead'

// Focus (bullet time): hold to slow the world while the meter drains; refills on its own.
export const FOCUS_TIME_SCALE = 0.3
export const FOCUS_MAX = 100
const FOCUS_DRAIN = 160 // per sim-second: ~2 real seconds of slow-mo per full meter
const FOCUS_REGEN = 12
const FOCUS_MIN_START = 25

export type GameEvent =
  | { type: 'hook'; index: 0 | 1; point: Vector3 }
  | { type: 'unhook'; index: 0 | 1 }
  | { type: 'slash'; hit: boolean; napeHit: boolean }
  | { type: 'ankleSliced'; titanId: number; remaining: number }
  | { type: 'crippled'; titanId: number }
  | { type: 'kill'; titanId: number; points: number; oneCut: boolean; speed: number; heartGained: boolean }
  | { type: 'bladeBroke' }
  | { type: 'playerHit'; hp: number }
  | { type: 'waveClear'; wave: number; bonus: number }
  | { type: 'resupply' }
  | { type: 'canisterSwap'; remaining: number }
  | { type: 'boost' }
  | { type: 'death' }

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
  arena: Arena
  score: ScoreState
  offers: Upgrade[]
  events: GameEvent[]
  best: BestStats
  storage: StorageLike | null
  rngLive: Rng
  prevInput: InputState
  nextTitanId: number
  focus: number
  focusActive: boolean
  mode: GameMode
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
  return {
    seed,
    phase: 'menu',
    wave: 0,
    time: 0,
    player: createPlayer(),
    titans: [],
    arena: generateCity(createRng(hashSeed(`${seed}:city`))),
    score: createScore(),
    offers: [],
    events: [],
    best: loadBest(storage),
    storage,
    rngLive: createRng(hashSeed(`${seed}:live`)),
    prevInput: neutralInput(),
    nextTitanId: 1,
    focus: FOCUS_MAX,
    focusActive: false,
    mode: getMode(modeId),
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

  // focus meter: hold to slow time (main loop applies FOCUS_TIME_SCALE while focusActive)
  if (g.focusActive) {
    g.focus = Math.max(0, g.focus - FOCUS_DRAIN * dt)
    if (!input.focus || g.focus <= 0) g.focusActive = false
  } else {
    g.focus = Math.min(FOCUS_MAX, g.focus + FOCUS_REGEN * dt)
    if (input.focus && !g.prevInput.focus && g.focus >= FOCUS_MIN_START) g.focusActive = true
  }

  const canistersBefore = p.canisters
  if (input.gas && !g.prevInput.gas && tryBoost(p, input.lookDir)) {
    g.events.push({ type: 'boost' })
  }

  handleHookEdge(g, 0, input.hookL, g.prevInput.hookL, input)
  handleHookEdge(g, 1, input.hookR, g.prevInput.hookR, input)

  if (input.slash && !g.prevInput.slash) {
    const airborne = !p.onGround
    const result = trySlash(p, g.titans)
    g.events.push({ type: 'slash', hit: result.hit, napeHit: result.napeHit })
    if (result.bladeBroke) g.events.push({ type: 'bladeBroke' })
    if (result.ankleHit && result.titanId !== undefined) {
      const titan = g.titans.find((t) => t.id === result.titanId)
      const remaining = titan ? titan.ankles.filter((cut) => !cut).length : 0
      g.events.push({ type: 'ankleSliced', titanId: result.titanId, remaining })
      if (result.crippled) g.events.push({ type: 'crippled', titanId: result.titanId })
    }
    if (result.killed && result.titanId !== undefined) {
      const points = registerKill(
        g.score,
        { speed: result.speed, airborne, oneCut: result.oneCut },
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
      })
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
      g.events.push({ type: 'resupply' })
    }
  }

  syncTitanHooks(g)

  stepPlayer(p, input, dt, g.arena)
  if (p.canisters < canistersBefore) {
    g.events.push({ type: 'canisterSwap', remaining: p.canisters })
  }

  for (const titan of g.titans) {
    for (const event of stepTitan(titan, p.pos, dt, g.rngLive)) {
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
  if (g.phase === 'playing') g.mode.step(g, dt)
  if (g.phase !== 'playing') saveBest(g) // the run just ended or hit an intermission

  copyInput(g.prevInput, input)
}

function handleHookEdge(
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
function syncTitanHooks(g: GameState): void {
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

function copyInput(dst: InputState, src: InputState): void {
  dst.move.copy(src.move)
  dst.lookDir.copy(src.lookDir)
  dst.gas = src.gas
  dst.jump = src.jump
  dst.focus = src.focus
  dst.slash = src.slash
  dst.hookL = src.hookL
  dst.hookR = src.hookR
  dst.resupply = src.resupply
}
