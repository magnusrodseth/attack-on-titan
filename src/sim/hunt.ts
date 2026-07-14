import { mapScopedSeed } from './maps'
import type { GameMode } from './modes'
import { trialKey } from './race'
import type { StorageLike, World } from './world'

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

function freshClock(w: World): { timeLeft: number; budget: number } {
  const budget = w.titans.length * huntAllowance(w.wave)
  return { timeLeft: budget, budget }
}

/** The hunter: solo-only, so there is exactly one. */
function hunter(w: World) {
  return w.soldiers[0]!
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

    // relentless is the mode's whole rule: EVERY titan hunts the soldiers, always. Nothing is
    // ever free to wander off and eat someone, so a crowd here would just be scenery that the
    // titans ignore — which would be a lie about how this game works.
    crowd: false,

    coop: {
      kind: 'soloOnly',
      reason:
        'One countdown, N soldiers: does the clock end the match or bench the slow, does the roster scale with the squad, and is a level cleared when the last titan falls or when the last soldier does? Those are game design questions, not wiring. The Culling needs its own effort before it can be shared.',
    },

    start(w) {
      w.relentless = true
      base.start(w)
      w.hunt = {
        ...freshClock(w),
        urgencyFired: false,
        best: loadHuntBest(w.storage, mapScopedSeed(w.map.id, w.seed)),
      }
    },

    step(w, dt, input) {
      if (!w.hunt) {
        // a save from before the hunt slice existed: rebuild a full clock for this level
        w.hunt = {
          ...freshClock(w),
          urgencyFired: false,
          best: loadHuntBest(w.storage, mapScopedSeed(w.map.id, w.seed)),
        }
      }
      base.step(w, dt, input)
      const h = w.hunt
      const score = hunter(w).score
      if (w.phase === 'upgrading') {
        // level cleared with time to spare: bank the PB now, before the clock resets
        const best = h.best
        if (!best || w.wave > best.level || (w.wave === best.level && score.score > best.score)) {
          h.best = { level: w.wave, score: score.score }
          saveHuntBest(w.storage, mapScopedSeed(w.map.id, w.seed), h.best)
        }
      }
      if (w.phase !== 'playing') return // the clock pauses with the sim
      h.timeLeft -= dt
      if (!h.urgencyFired && h.timeLeft <= h.budget * HUNT_URGENCY_FRACTION) {
        h.urgencyFired = true
        w.events.push({ type: 'huntUrgency' })
      }
      if (h.timeLeft <= 0) {
        h.timeLeft = 0
        w.phase = 'dead'
        w.events.push({ type: 'huntTimeout', level: w.wave, cleared: w.wave - 1 })
      }
    },

    chooseUpgrade(w, soldierId, id) {
      base.chooseUpgrade?.(w, soldierId, id)
      const h = w.hunt
      if (!h) return
      Object.assign(h, freshClock(w))
      h.urgencyFired = false
    },
  }
}
