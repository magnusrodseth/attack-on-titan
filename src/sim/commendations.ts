import { BOSS_LADDER } from './boss'
import { EYE_HEIGHT } from './constants'
import { clockFraction, nightFactor } from './daynight'
import type { GameState, StorageLike } from './game'

/**
 * Commendations: permanent marks on the soldier's record, awarded once ever the first time
 * a feat is performed (ticket 010). A pure listener over the sim event bus — no game system
 * reads commendation state back; main.ts feeds solo ticks and routes toasts. Record only:
 * nothing mechanical hangs off an award.
 */

export const COMMEND_KEY = 'aot-odm-commendations'
export const COMMEND_VERSION = 1

export type CounterKey = 'kills' | 'oneCuts' | 'waves' | 'breaks' | 'spearKills'

export interface CommendationSave {
  version: number
  /** Commendation id → ISO date awarded. */
  awarded: Record<string, string>
  /** Lifetime tallies feeding the tiered ladders. */
  counters: Record<CounterKey, number>
}

export interface Commendation {
  id: string
  name: string
  /** Requirement line shown in the panel. */
  desc: string
  /** Tiers of one ladder share a ladder id; the panel folds them into a single row. */
  ladder?: { id: string; name: string; what: string; tier: 1 | 2 | 3; counter: CounterKey; target: number }
  /** Panel progress toward a target, for counter and capstone entries. */
  progress?: (save: CommendationSave) => { value: number; target: number }
}

function ladder(
  id: string,
  name: string,
  what: string,
  counter: CounterKey,
  targets: [number, number, number],
): Commendation[] {
  return targets.map((target, i) => ({
    id: `${id}-${i + 1}`,
    name: `${name} ${['I', 'II', 'III'][i]}`,
    desc: `${what}: ${target.toLocaleString('en-US')}.`,
    ladder: { id, name, what, tier: (i + 1) as 1 | 2 | 3, counter, target },
    progress: (save: CommendationSave) => ({ value: save.counters[counter], target }),
  }))
}

const FELLED_IDS = BOSS_LADDER.map((spec) => `felled-${spec.id}`)
const felledCount = (save: CommendationSave): number =>
  FELLED_IDS.filter((id) => save.awarded[id]).length

export const COMMENDATIONS: Commendation[] = [
  // feats
  { id: 'first-blood', name: 'First Blood', desc: 'Fell your first titan.' },
  { id: 'clean-cut', name: 'Clean Cut', desc: 'Take a nape in a single cut.' },
  { id: 'point-blank', name: 'Point-Blank', desc: 'Fell a titan while hooked to it.' },
  { id: 'terminal-velocity', name: 'Terminal Velocity', desc: 'Fell a titan at 35 m/s or faster.' },
  { id: 'fireworks', name: 'Fireworks', desc: 'Fell two titans with a single Thunder Spear blast.' },
  { id: 'lightning-passage', name: 'Lightning Passage', desc: 'Fell a titan with a focus strike.' },
  { id: 'slipped-the-fist', name: 'Slipped the Fist', desc: 'Break free from a titan’s grip.' },
  { id: 'hamstrung', name: 'Hamstrung', desc: 'Bring a titan to its knees.' },
  { id: 'last-heart', name: 'Last Heart', desc: 'Clear a wave with one heart remaining.' },
  { id: 'cold-steel', name: 'Cold Steel', desc: 'Clear a wave without firing a single boost.' },
  // lifetime ladders
  ...ladder('slayer', 'Slayer', 'Titans felled, lifetime', 'kills', [10, 100, 1000]),
  ...ladder('executioner', 'Executioner', 'One-cut kills, lifetime', 'oneCuts', [10, 100, 500]),
  ...ladder('campaigner', 'Campaigner', 'Waves cleared, lifetime', 'waves', [25, 100, 500]),
  ...ladder('breaker', 'Breaker', 'Shifter Weak Points broken, lifetime', 'breaks', [5, 25, 100]),
  ...ladder('demolitionist', 'Demolitionist', 'Thunder Spear kills, lifetime', 'spearKills', [10, 50, 200]),
  // the Nine
  ...BOSS_LADDER.map((spec) => ({
    id: `felled-${spec.id}`,
    name: `The ${spec.name.replace(/ Titan$/, '')}, Felled`,
    desc: `Fell the ${spec.name}.`,
  })),
  {
    id: 'all-nine-silenced',
    name: 'All Nine Silenced',
    desc: 'Fell every one of the Nine at least once.',
    progress: (save) => ({ value: felledCount(save), target: FELLED_IDS.length }),
  },
  // modes
  { id: 'flare-runner', name: 'Flare Runner', desc: 'Finish a Signal Run.' },
  { id: 'perfect-line', name: 'Perfect Line', desc: 'Finish a Signal Run with every gate ahead of your best.' },
  { id: 'cull-five', name: 'Cull Five', desc: 'Clear level 5 of The Culling.' },
  { id: 'buzzer-beater', name: 'Buzzer Beater', desc: 'Clear a Culling level with under 3 seconds left.' },
  // survival
  { id: 'untouched', name: 'Untouched', desc: 'Fell a Shifter without taking a hit.' },
  { id: 'night-watch', name: 'Night Watch', desc: 'Survive from dusk to dawn in one run.' },
  { id: 'lights-out', name: 'Lights Out', desc: 'Survive 60 seconds of night with a dead lamp.' },
  { id: 'mudlark', name: 'Mudlark', desc: 'Take a swim in the canal.' },
]

const BY_ID = new Map(COMMENDATIONS.map((c) => [c.id, c]))

export function commendationInfo(id: string): { name: string; desc: string } {
  const c = BY_ID.get(id)
  return c ? { name: c.name, desc: c.desc } : { name: id, desc: '' }
}

/** How long a lamp must stay dead in the dark for Lights Out. */
export const LIGHTS_OUT_SECONDS = 60
/** Buzzer Beater: seconds left on the Culling clock at the moment a level clears. */
export const BUZZER_BEATER_SECONDS = 3
/** Terminal Velocity: kill speed floor, well past the 17 m/s one-cut threshold. */
export const TERMINAL_VELOCITY_SPEED = 35

interface RunScratch {
  /** Titan ids the hooks held on the previous tick: kills tear hooks within the tick. */
  prevHooked: number[]
  /** Hunt clock on the previous tick: a level clear resets it within the tick. */
  prevHuntLeft: number | null
  boostThisWave: boolean
  /** Night phases for Night Watch: dusk seen this run, and whether it is night now. */
  sawDusk: boolean
  night: boolean
  lampDeadNight: number
  /** Signal Run attempt: true until any gate falls behind (or has no) PB. */
  raceClean: boolean
  raceGates: number
}

export interface CommendationState {
  save: CommendationSave
  scratch: RunScratch
  /** The save changed since the last flush. */
  dirty: boolean
}

function emptySave(): CommendationSave {
  return {
    version: COMMEND_VERSION,
    awarded: {},
    counters: { kills: 0, oneCuts: 0, waves: 0, breaks: 0, spearKills: 0 },
  }
}

function freshScratch(): RunScratch {
  return {
    prevHooked: [],
    prevHuntLeft: null,
    boostThisWave: false,
    sawDusk: false,
    night: false,
    lampDeadNight: 0,
    raceClean: true,
    raceGates: 0,
  }
}

export function loadCommendations(storage: StorageLike | null): CommendationSave {
  const empty = emptySave()
  try {
    const raw = storage?.getItem(COMMEND_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CommendationSave>
      if (parsed.version === COMMEND_VERSION && parsed.awarded && parsed.counters) {
        return {
          version: COMMEND_VERSION,
          awarded: { ...parsed.awarded },
          counters: { ...empty.counters, ...parsed.counters },
        }
      }
    }
  } catch {
    // an unreadable record starts fresh; commendations are a record, never a dependency
  }
  return empty
}

export function createCommendations(save: CommendationSave): CommendationState {
  return { save, scratch: freshScratch(), dirty: false }
}

/**
 * A new run (or a restored one) resets the run-scoped scratch. A restore taints the current
 * wave for Cold Steel: the pre-restore boost history is gone, so the wave cannot vouch.
 */
export function resetCommendationRun(cs: CommendationState, opts: { restored?: boolean } = {}): void {
  cs.scratch = freshScratch()
  if (opts.restored) cs.scratch.boostThisWave = true
}

export function flushCommendations(cs: CommendationState, storage: StorageLike | null): void {
  if (!cs.dirty || !storage) return
  try {
    storage.setItem(COMMEND_KEY, JSON.stringify(cs.save))
  } catch {
    // a full or blocked store loses nothing but the record
  }
  cs.dirty = false
}

/**
 * Feed one solo sim tick. Reads g.events (still intact after stepGame) plus a narrow slice
 * of live state; returns the ids newly awarded this tick, in award order, for the HUD toast
 * queue. Call flushCommendations afterwards to persist (it no-ops unless something changed).
 */
export function stepCommendations(
  cs: CommendationState,
  g: GameState,
  dt: number,
  now: () => string = () => new Date().toISOString(),
): string[] {
  const newly: string[] = []
  const award = (id: string): void => {
    if (cs.save.awarded[id]) return
    cs.save.awarded[id] = now()
    cs.dirty = true
    newly.push(id)
  }
  const bump = (key: CounterKey): void => {
    cs.save.counters[key] += 1
    cs.dirty = true
  }

  let spearKillsThisTick = 0
  for (const event of g.events) {
    switch (event.type) {
      case 'kill':
        bump('kills')
        award('first-blood')
        if (event.oneCut) {
          bump('oneCuts')
          award('clean-cut')
        }
        if (event.speed >= TERMINAL_VELOCITY_SPEED) award('terminal-velocity')
        if (event.weapon === 'focus') award('lightning-passage')
        if (event.weapon === 'spear') {
          bump('spearKills')
          spearKillsThisTick += 1
        }
        if (cs.scratch.prevHooked.includes(event.titanId)) award('point-blank')
        break
      case 'boost':
        cs.scratch.boostThisWave = true
        break
      case 'waveClear':
        bump('waves')
        if (!cs.scratch.boostThisWave) award('cold-steel')
        cs.scratch.boostThisWave = false
        if (g.player.hp === 1) award('last-heart')
        if (g.mode.id === 'hunt') {
          if (event.wave >= 5) award('cull-five')
          if (cs.scratch.prevHuntLeft !== null && cs.scratch.prevHuntLeft < BUZZER_BEATER_SECONDS) {
            award('buzzer-beater')
          }
        }
        break
      case 'crippled':
        award('hamstrung')
        break
      case 'grabEscaped':
        award('slipped-the-fist')
        break
      case 'bossPartBroken':
        bump('breaks')
        break
      case 'bossKilled': {
        const spec = BOSS_LADDER.find((s) => s.name === event.name)
        if (spec) {
          award(`felled-${spec.id}`)
          if (felledCount(cs.save) === FELLED_IDS.length) award('all-nine-silenced')
        }
        if (event.flawless) award('untouched')
        break
      }
      case 'raceArmed':
      case 'raceRestart':
        cs.scratch.raceClean = true
        cs.scratch.raceGates = 0
        break
      case 'gatePass':
        cs.scratch.raceGates += 1
        if (event.delta === null || event.delta >= 0) cs.scratch.raceClean = false
        break
      case 'raceFinished':
        award('flare-runner')
        if (cs.scratch.raceClean && cs.scratch.raceGates > 0 && event.delta !== null && event.delta < 0) {
          award('perfect-line')
        }
        break
    }
  }
  if (spearKillsThisTick >= 2) award('fireworks')

  // ambient checks, only while the soldier is alive in the world
  if (g.phase === 'playing') {
    const night = nightFactor(clockFraction(g.seed, g.time)) >= 0.5
    if (night && !cs.scratch.night) cs.scratch.sawDusk = true
    if (!night && cs.scratch.night && cs.scratch.sawDusk) award('night-watch')
    cs.scratch.night = night

    if (night && g.player.lamp <= 0) {
      cs.scratch.lampDeadNight += dt
      if (cs.scratch.lampDeadNight >= LIGHTS_OUT_SECONDS) award('lights-out')
    } else {
      cs.scratch.lampDeadNight = 0
    }

    const canal = g.arena.canal
    if (
      canal &&
      g.player.pos.y - EYE_HEIGHT < canal.waterY &&
      Math.abs(g.player.pos.x - canal.x) < canal.halfWidth
    ) {
      award('mudlark')
    }
  }

  // ladders judged after this tick's bumps
  for (const c of COMMENDATIONS) {
    if (c.ladder && cs.save.counters[c.ladder.counter] >= c.ladder.target) award(c.id)
  }

  // previous-tick state: kills tear hooks and level clears reset the hunt clock in-tick
  cs.scratch.prevHooked = g.player.hooks
    .filter((h) => h.state === 'attached' && h.titanId !== null)
    .map((h) => h.titanId as number)
  cs.scratch.prevHuntLeft = g.hunt ? g.hunt.timeLeft : null

  return newly
}

/** One panel row: singles map 1:1, ladder tiers fold into a single row with tier pips. */
export interface CommendationRow {
  name: string
  desc: string
  awarded: boolean
  /** Ladder rows: which tiers are earned, in order. */
  tiers?: boolean[]
  /** Progress toward the next target; null when complete or not a counted entry. */
  progress: { value: number; target: number } | null
}

export function commendationRows(save: CommendationSave): CommendationRow[] {
  const rows: CommendationRow[] = []
  const laddersSeen = new Set<string>()
  for (const c of COMMENDATIONS) {
    if (c.ladder) {
      if (laddersSeen.has(c.ladder.id)) continue
      laddersSeen.add(c.ladder.id)
      const tiers = COMMENDATIONS.filter((t) => t.ladder?.id === c.ladder?.id)
      const earned = tiers.map((t) => Boolean(save.awarded[t.id]))
      const next = tiers.find((t) => !save.awarded[t.id])
      rows.push({
        name: c.ladder.name,
        desc: c.ladder.what,
        awarded: earned.every(Boolean),
        tiers: earned,
        progress: next?.progress ? next.progress(save) : null,
      })
    } else {
      rows.push({
        name: c.name,
        desc: c.desc,
        awarded: Boolean(save.awarded[c.id]),
        progress: c.progress ? c.progress(save) : null,
      })
    }
  }
  return rows
}
