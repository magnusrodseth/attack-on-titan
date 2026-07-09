import { Vector3 } from 'three'
import type { Arena } from './city'
import { generateCity, raycastHookTarget } from './city'
import { EYE_HEIGHT } from './constants'
import { trySlash } from './combat'
import type { InputState, PlayerState } from './player'
import { createPlayer, neutralInput, stepPlayer } from './player'
import { createRng, hashSeed } from './rng'
import { attachHook, releaseHook } from './rope'
import type { ScoreState } from './score'
import { createScore, registerKill, stepScore } from './score'
import type { TitanState } from './titan'
import { createTitan, stepTitan } from './titan'
import type { Upgrade } from './upgrades'
import { applyUpgrade, offerUpgrades } from './upgrades'
import { waveComposition } from './waves'

export type GamePhase = 'menu' | 'playing' | 'upgrading' | 'dead'

export type GameEvent =
  | { type: 'hook'; index: 0 | 1; point: Vector3 }
  | { type: 'unhook'; index: 0 | 1 }
  | { type: 'slash'; hit: boolean; napeHit: boolean }
  | { type: 'kill'; titanId: number; points: number; oneCut: boolean; speed: number }
  | { type: 'bladeBroke' }
  | { type: 'playerHit'; hp: number }
  | { type: 'waveClear'; wave: number; bonus: number }
  | { type: 'resupply' }
  | { type: 'canisterSwap'; remaining: number }
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
  rngLive: () => number
  prevInput: InputState
  nextTitanId: number
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

function saveBest(g: GameState): void {
  g.best.bestScore = Math.max(g.best.bestScore, g.score.score)
  g.best.bestWave = Math.max(g.best.bestWave, g.wave)
  try {
    g.storage?.setItem(BEST_KEY, JSON.stringify(g.best))
  } catch {
    // storage may be unavailable (private mode); the run still works
  }
}

export function createGame(seed: string, storage: StorageLike | null = defaultStorage()): GameState {
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
  }
}

export function startGame(g: GameState): void {
  g.player = createPlayer()
  g.player.pos.set(0, EYE_HEIGHT, 8)
  g.score = createScore()
  g.wave = 1
  g.time = 0
  g.offers = []
  spawnWave(g)
  g.phase = 'playing'
}

function spawnWave(g: GameState): void {
  const rng = createRng(hashSeed(`${g.seed}:wave:${g.wave}`))
  g.titans = waveComposition(g.wave, rng).map((s) =>
    createTitan({ id: g.nextTitanId++, kind: s.kind, height: s.height, x: s.x, z: s.z }),
  )
}

export function chooseUpgrade(g: GameState, id: string): void {
  if (g.phase !== 'upgrading') return
  applyUpgrade(g.player, id)
  g.offers = []
  g.wave += 1
  spawnWave(g)
  g.phase = 'playing'
}

export function stepGame(g: GameState, input: InputState, dt: number): void {
  g.events = []
  if (g.phase !== 'playing') {
    copyInput(g.prevInput, input)
    return
  }
  g.time += dt
  const p = g.player

  handleHookEdge(g, 0, input.hookL, g.prevInput.hookL, input)
  handleHookEdge(g, 1, input.hookR, g.prevInput.hookR, input)

  if (input.slash && !g.prevInput.slash) {
    const airborne = !p.onGround
    const result = trySlash(p, g.titans)
    g.events.push({ type: 'slash', hit: result.hit, napeHit: result.napeHit })
    if (result.bladeBroke) g.events.push({ type: 'bladeBroke' })
    if (result.killed && result.titanId !== undefined) {
      const points = registerKill(
        g.score,
        { speed: result.speed, airborne, oneCut: result.oneCut },
        p.config.killSpeed,
      )
      p.gas = Math.min(p.config.maxGas, p.gas + p.config.gasKillRefund)
      g.events.push({
        type: 'kill',
        titanId: result.titanId,
        points,
        oneCut: result.oneCut,
        speed: result.speed,
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
      g.events.push({ type: 'resupply' })
    }
  }

  const canistersBefore = p.canisters
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

  if (g.phase === 'playing' && g.titans.length > 0 && g.titans.every((t) => t.hp <= 0)) {
    const bonus = 250 * g.wave
    g.score.score += bonus
    g.offers = offerUpgrades(createRng(hashSeed(`${g.seed}:offers:${g.wave}`)))
    g.phase = 'upgrading'
    saveBest(g)
    g.events.push({ type: 'waveClear', wave: g.wave, bonus })
  }

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
    const target = raycastHookTarget(
      g.arena,
      g.player.pos,
      input.lookDir.clone().normalize(),
      g.player.config.hookRange,
    )
    if (target) {
      attachHook(hook, target, g.player.pos)
      g.events.push({ type: 'hook', index, point: target.clone() })
    }
  } else if (!held && wasHeld && hook.state === 'attached') {
    releaseHook(hook)
    g.events.push({ type: 'unhook', index })
  }
}

function copyInput(dst: InputState, src: InputState): void {
  dst.move.copy(src.move)
  dst.lookDir.copy(src.lookDir)
  dst.gas = src.gas
  dst.jump = src.jump
  dst.reel = src.reel
  dst.slash = src.slash
  dst.hookL = src.hookL
  dst.hookR = src.hookR
  dst.resupply = src.resupply
}
