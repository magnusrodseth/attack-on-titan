import { Vector3 } from 'three'
import type { BossFight } from './boss'
import type { Arena } from './city'
import { raycastHookTarget } from './city'
import { EYE_HEIGHT } from './constants'
import { clockFraction } from './daynight'
import { LAMP_LOW_SECONDS, drainLamp, lightAround } from './flashlight'
import type { GrabState, GrabWatch } from './grab'
import type { GameMap } from './maps'
import { DEFAULT_MAP_ID, getMap } from './maps'
import type { GameMode } from './modes'
import { DEFAULT_MODE_ID, getMode } from './modes'
import type { InputState, PlayerState } from './player'
import { BOOST_COST, createPlayer, stepPlayer, tryBoost } from './player'
import { attachHook, attachHookToTitan, releaseHook, updateTitanAnchor } from './rope'
import type { ScoreState } from './score'
import { createScore, registerKill } from './score'
import type { StrikeState } from './strike'
import { createStrike, findStrikeTarget, stepStrike } from './strike'
import type { TitanState } from './titan'
import { raycastTitan } from './titan'
import type { Upgrade } from './upgrades'
import type { Soldier, StorageLike, World, WorldEvent } from './world'
import {
  SOLO_ID,
  createSoldier,
  createWorld,
  soldierById,
  stepWorld,
  worldFire,
  worldResupply,
  worldSlash,
} from './world'

/**
 * The solo driver. The world (titans, waves, Shifters, spears, modes — world.ts) is exactly
 * the world the co-op server runs; this file is the half that only makes sense with one
 * soldier and no wire: the local body's physics, hooks, Focus, and the run's save.
 *
 * Focus lives here for a reason. A shared world cannot slow down for one soldier, so bullet
 * time is not a world rule at all — it is the SOLO driver handing the world a smaller dt.
 * The world never learns that time bent (see FEATURES in stance.ts).
 */

export type GamePhase = 'menu' | 'playing' | 'upgrading' | 'dead' | 'finished'

export const FOCUS_TIME_SCALE = 0.3
export const FOCUS_MAX = 100
export const FOCUS_KILLS_TO_FILL = 3
/** Real seconds one focus window lasts; the world runs at FOCUS_TIME_SCALE throughout. */
export const FOCUS_WINDOW_SECONDS = 3
const FOCUS_DRAIN = FOCUS_MAX / (FOCUS_WINDOW_SECONDS * FOCUS_TIME_SCALE) // per sim-second

export type { StorageLike, WorldEvent }
/** The one event union, shared by both drivers; solo simply never reads `playerId`. */
export type GameEvent = WorldEvent

export { MAX_CHASERS, SPEAR_RESTOCK_DELAY } from './world'

export interface BestStats {
  bestScore: number
  bestWave: number
}

/**
 * A solo run: one World with a roster of one, plus the things only a lone soldier has.
 *
 * `player`, `score`, `offers`, `grab` and `grabWatch` are live views of that single
 * soldier (defined in attachSoloViews) — the world holds soldiers, solo speaks of "the
 * player", and both are the same objects. Nothing is copied and nothing can drift.
 */
export interface GameState extends World {
  phase: GamePhase
  player: PlayerState
  score: ScoreState
  offers: Upgrade[]
  grab: GrabState | null
  grabWatch: GrabWatch
  best: BestStats
  focus: number
  focusActive: boolean
  /** Kills banked toward the next focus window (0..FOCUS_KILLS_TO_FILL). */
  focusCharge: number
  /** The in-flight focus strike dash; the dash owns player movement while set. */
  strike: StrikeState | null
  /** Titan whose nape the crosshair is locked onto during an active focus window. */
  strikeTargetId: number | null
}

const BEST_KEY = 'aot-odm-best'

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

/** The soldier this run is: solo has exactly one, and these are windows onto it. */
function attachSoloViews(g: World): GameState {
  const solo = g as GameState
  const me = (): Soldier => solo.soldiers[0]!
  Object.defineProperties(solo, {
    player: {
      enumerable: true,
      get: () => me().body,
      set: (body: PlayerState) => {
        me().body = body
      },
    },
    score: {
      enumerable: true,
      get: () => me().score,
      set: (score: ScoreState) => {
        me().score = score
      },
    },
    offers: {
      enumerable: true,
      get: () => me().offers,
      set: (offers: Upgrade[]) => {
        me().offers = offers
      },
    },
    grab: {
      enumerable: true,
      get: () => me().grab,
      set: (grab: GrabState | null) => {
        me().grab = grab
      },
    },
    grabWatch: {
      enumerable: true,
      get: () => me().grabWatch,
      set: (watch: GrabWatch) => {
        me().grabWatch = watch
      },
    },
  })
  return solo
}

export function createGame(
  seed: string,
  storage: StorageLike | null = defaultStorage(),
  modeId: string = DEFAULT_MODE_ID,
  mapId: string = DEFAULT_MAP_ID,
): GameState {
  const world = createWorld({
    seed,
    map: getMap(mapId),
    mode: getMode(modeId),
    soldiers: [createSoldier(SOLO_ID)],
    storage,
    coop: false,
  })
  const g = attachSoloViews(world)
  g.best = loadBest(storage)
  g.focus = 0
  g.focusActive = false
  g.focusCharge = 0
  g.strike = null
  g.strikeTargetId = null
  return g
}

export function startGame(g: GameState): void {
  const me = g.soldiers[0]!
  me.body = createPlayer()
  me.body.pos.set(0, EYE_HEIGHT, 8)
  me.score = createScore()
  me.offers = []
  me.grab = null
  me.grabWatch = { linger: 0, cooldown: 0 }
  me.alive = true
  me.connected = true
  me.deaths = 0
  me.mash = 0
  g.wave = 0
  g.time = 0
  g.tick = 0
  g.titans = []
  g.spears = []
  g.spearOwners.clear()
  g.pickups = []
  g.pickupRound = 0
  g.pickupRespawnTimer = 0
  g.boss = null
  g.race = null
  g.hunt = null
  g.relentless = false
  g.results = null
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
  g.mode.chooseUpgrade?.(g, SOLO_ID, id)
}

export function stepGame(g: GameState, input: InputState, dt: number): void {
  g.events = []
  if (g.phase !== 'playing') {
    copyInput(g.prevInput, input)
    return
  }
  const me = g.soldiers[0]!
  const p = me.body
  // every kill this tick banks a third of the next focus window, however it was earned:
  // blade, spear, strike or Shifter. The world counts kills; solo reads the difference.
  const killsBefore = me.score.kills
  stepLamp(g, dt)

  if (me.grab) {
    // the fist owns the soldier: nothing to do but mash (the world runs the QTE)
    if (input.jump && !g.prevInput.jump) me.mash += 1
  } else {
    // focus: a full charge buys one fixed slow-mo window (the main loop applies
    // FOCUS_TIME_SCALE to dt). The tap only opens it; the window runs to the end of its 3
    // real seconds no matter what Q does afterwards — only the strike, a grab or an
    // intermission cuts it short.
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
      stepPlayerActions(g, me, input, dt)
    }
  }

  // the shared world: titans, spears, the Shifter, the grab QTE, the mode's progression
  stepWorld(g, dt, input)
  grantFocusForKills(g, me.score.kills - killsBefore)

  if (g.phase !== 'playing') {
    saveBest(g) // the run just ended or hit an intermission
    // a strike that cleared the wave must not resume as a stale dash next wave, and the
    // slow-mo window (its charge already committed) does not survive an intermission
    g.strike = null
    g.strikeTargetId = null
    g.focusActive = false
    g.focus = 0
    // an intermission opens the fist; nothing holds you into the next wave
    me.grab = null
    me.grabWatch.linger = 0
  }

  copyInput(g.prevInput, input)
}

/** Everything the soldier does with their own hands; skipped while a strike dash flies. */
function stepPlayerActions(g: GameState, me: Soldier, input: InputState, dt: number): void {
  const p = me.body
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

  // the same intents a co-op client sends over the wire, resolved here with no wire at all
  if (input.slash && !g.prevInput.slash) worldSlash(g, me, input.lookDir)
  if (input.fire && !g.prevInput.fire) worldFire(g, me, input.lookDir)
  if (input.resupply && !g.prevInput.resupply) worldResupply(g, me)

  syncTitanHooks(g)

  stepPlayer(p, input, dt, g.arena)
  me.onGround = p.onGround
  me.aim = input.lookDir
  if (p.canisters < canistersBefore) {
    g.events.push({ type: 'canisterSwap', remaining: p.canisters })
  }
}

/** Every kill banks a third of the next focus window, however it was earned. */
function grantFocusForKills(g: GameState, kills: number): void {
  for (let i = 0; i < kills; i++) {
    if (g.focusCharge >= FOCUS_KILLS_TO_FILL) return
    g.focusCharge += 1
    g.events.push({
      type: 'focusCharge',
      charge: g.focusCharge,
      full: g.focusCharge >= FOCUS_KILLS_TO_FILL,
    })
  }
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
  const me = g.soldiers[0]!
  const p = me.body
  p.invulnTimer = Math.max(p.invulnTimer, 0.2) // untouchable while the dash owns movement
  const result = stepStrike(g.strike, p, g.titans, g.arena, dt)
  if (result.killed) {
    const killed = result.killed
    const points = registerKill(
      me.score,
      {
        speed: p.config.speedCap, // pays what a blade kill at the speed cap would
        airborne: true,
        oneCut: result.oneCut,
        abnormal: killed.kind === 'abnormal',
      },
      p.config.killSpeed,
    )
    p.gas = Math.min(p.config.maxGas, p.gas + p.config.gasKillRefund)
    const heartGained = p.hp < p.config.maxHp
    if (heartGained) p.hp += 1 // a kill is a kill: the heart comes back
    g.events.push({
      type: 'kill',
      playerId: me.id,
      titanId: killed.id,
      points,
      oneCut: result.oneCut,
      speed: p.config.speedCap,
      heartGained,
      kind: killed.kind,
      weapon: 'focus',
    })
  }
  if (result.done) g.strike = null
}

/** The run's day/night clock; a map may pin it (`GameMap.clockFraction`). */
export function gameClock(g: Pick<World, 'map' | 'seed' | 'time'>): number {
  return g.map.clockFraction ?? clockFraction(g.seed, g.time)
}

/**
 * How lit the soldier's own patch of world is (0 black, 1 full day). The flashlight and the
 * HUD both read the beam off this, so the lamp trips on darkness itself rather than on the
 * hour: under the open sky that is the daylight, underground it is the torches and the
 * holes in the rock.
 */
export function playerLight(g: GameState): number {
  return lightAround(g.arena, g.player.pos.x, g.player.pos.y, g.player.pos.z, gameClock(g))
}

/**
 * Burns flashlight battery while the beam is lit (night), with edge-triggered warnings.
 * Shared by the solo loop and the co-op client — the battery is a personal resource the
 * world never needs to see (FEATURES: 'flashlight' is `adapted`, not shared).
 */
export function stepLamp(g: GameState, dt: number): void {
  const p = g.player
  const before = p.lamp
  p.lamp = drainLamp(p.lamp, playerLight(g), dt)
  if (before > LAMP_LOW_SECONDS && p.lamp <= LAMP_LOW_SECONDS && p.lamp > 0) {
    g.events.push({ type: 'lampLow' })
  }
  if (before > 0 && p.lamp <= 0) g.events.push({ type: 'lampDead' })
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

/** Re-exported for the co-op client, which builds its own local view of a shared world. */
export type { Arena, BossFight, GameMap, GameMode, Soldier, Vector3, World }
export { soldierById }
