import type { GameState, StorageLike } from './game'
import type { GameMode } from './modes'
import { trialKey } from './race'

/**
 * The Culling (wayfinder tt-006): eternal timed levels on the wave skeleton. Level L
 * spawns its full roster with a time budget of roster size x a per-kill allowance that
 * tightens every level toward a hard floor; clear everything before zero to breathe,
 * pick an upgrade, and take a tighter clock. Mode-wide relentless rule: every titan
 * tracks the soldier map-wide and never abandons the chase. Exact numbers are owned by
 * the tuning playtest (tt-009).
 */
export const HUNT_KILL_ALLOWANCE_START = 22 // seconds granted per titan at level 1
export const HUNT_KILL_ALLOWANCE_FLOOR = 9 // the hard floor the curve approaches
export const HUNT_KILL_ALLOWANCE_DECAY = 0.85 // per-level tightening factor
export const HUNT_URGENCY_FRACTION = 0.2 // countdown fraction where the HUD panics

export function huntAllowance(level: number): number {
  return (
    HUNT_KILL_ALLOWANCE_FLOOR +
    (HUNT_KILL_ALLOWANCE_START - HUNT_KILL_ALLOWANCE_FLOOR) *
      HUNT_KILL_ALLOWANCE_DECAY ** (level - 1)
  )
}

/** Ranked by deepest level fully cleared; the score breaks ties (tt-001 decision 11). */
export interface HuntBest {
  level: number
  score: number
}

export interface HuntState {
  timeLeft: number
  budget: number
  urgencyFired: boolean
  best: HuntBest | null
}

export function loadHuntBest(storage: StorageLike | null, seed: string): HuntBest | null {
  try {
    const raw = storage?.getItem(trialKey('hunt', seed))
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<HuntBest>
      if (typeof parsed.level === 'number' && typeof parsed.score === 'number') {
        return { level: parsed.level, score: parsed.score }
      }
    }
  } catch {
    // corrupt storage reads as no PB; the run still works
  }
  return null
}

function saveHuntBest(storage: StorageLike | null, seed: string, best: HuntBest): void {
  try {
    storage?.setItem(trialKey('hunt', seed), JSON.stringify(best))
  } catch {
    // storage may be unavailable (private mode); the run still works
  }
}

function freshClock(g: GameState): { timeLeft: number; budget: number } {
  const budget = g.titans.length * huntAllowance(g.wave)
  return { timeLeft: budget, budget }
}

/**
 * Wraps the shared wave-loop skeleton (injected by modes.ts to avoid a module cycle)
 * with the countdown, the relentless flag and the (level, score) PB.
 */
export function createHuntMode(
  base: Pick<GameMode, 'start' | 'step' | 'chooseUpgrade'>,
): GameMode {
  return {
    id: 'hunt',
    name: 'The Culling',
    desc: 'Eternal timed levels: every titan on the map knows where you are and never stops coming. Cull the full roster before the countdown dies — each cleared level buys an upgrade and a tighter clock.',

    start(g) {
      g.relentless = true
      base.start(g)
      g.hunt = { ...freshClock(g), urgencyFired: false, best: loadHuntBest(g.storage, g.seed) }
    },

    step(g, dt, input) {
      if (!g.hunt) {
        // a save from before the hunt slice existed: rebuild a full clock for this level
        g.hunt = { ...freshClock(g), urgencyFired: false, best: loadHuntBest(g.storage, g.seed) }
      }
      base.step(g, dt, input)
      const h = g.hunt
      if (g.phase === 'upgrading') {
        // level cleared with time to spare: bank the PB now, before the clock resets
        const best = h.best
        if (!best || g.wave > best.level || (g.wave === best.level && g.score.score > best.score)) {
          h.best = { level: g.wave, score: g.score.score }
          saveHuntBest(g.storage, g.seed, h.best)
        }
      }
      if (g.phase !== 'playing') return // the clock pauses with the sim
      h.timeLeft -= dt
      if (!h.urgencyFired && h.timeLeft <= h.budget * HUNT_URGENCY_FRACTION) {
        h.urgencyFired = true
        g.events.push({ type: 'huntUrgency' })
      }
      if (h.timeLeft <= 0) {
        h.timeLeft = 0
        g.phase = 'dead'
        g.events.push({ type: 'huntTimeout', level: g.wave, cleared: g.wave - 1 })
      }
    },

    chooseUpgrade(g, id) {
      base.chooseUpgrade?.(g, id)
      const h = g.hunt
      if (!h) return
      Object.assign(h, freshClock(g))
      h.urgencyFired = false
    },
  }
}
