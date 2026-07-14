import { EYE_HEIGHT } from './constants'
import type { Course } from './course'
import { generateCourse } from './course'
import { mapScopedSeed } from './maps'
import type { GameMode } from './modes'
import type { InputState } from './player'
import { createPlayer } from './player'
import { createScore } from './score'
import type { StorageLike, World } from './world'

/**
 * Signal Run (wayfinder tt-003): the parkour time trial. An empty city, a seeded course
 * of gates, and a clock that starts on your first control input. Every ring refills gas;
 * R relights the same line instantly. Times are only comparable per seed and map.
 */
export interface RaceBest {
  time: number
  splits: number[]
}

export interface RaceState {
  course: Course
  /** Index into course.gates of the next ring that counts; gates only pass in order. */
  nextGate: number
  /** True once the first control input started the clock. */
  armed: boolean
  time: number
  splits: number[]
  best: RaceBest | null
}

/** Time-trial PBs live per (mode, seed): a time is meaningless on any other course. */
export function trialKey(modeId: string, seed: string): string {
  return `aot-odm-tt:${modeId}:${seed}`
}

export function loadRaceBest(storage: StorageLike | null, seed: string): RaceBest | null {
  try {
    const raw = storage?.getItem(trialKey('race', seed))
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<RaceBest>
      if (typeof parsed.time === 'number' && Array.isArray(parsed.splits)) {
        return { time: parsed.time, splits: parsed.splits }
      }
    }
  } catch {
    // corrupt storage reads as no PB; the run still works
  }
  return null
}

function saveRaceBest(storage: StorageLike | null, seed: string, best: RaceBest): void {
  try {
    storage?.setItem(trialKey('race', seed), JSON.stringify(best))
  } catch {
    // storage may be unavailable (private mode); the run still works
  }
}

/** Control inputs arm the clock; looking around and R (restart) do not. */
function inputActive(input: InputState): boolean {
  return (
    input.move.lengthSq() > 0 ||
    input.jump ||
    input.gas ||
    input.hookL ||
    input.hookR ||
    input.slash ||
    input.fire
  )
}

/** The lone soldier a solo-only mode speaks to. */
function runner(w: World) {
  return w.soldiers[0]!
}

export const raceMode: GameMode = {
  id: 'race',
  name: 'Signal Run',
  desc: 'The parkour time trial: chase the green flare across empty ground, ring to ring. Every gate refills your gas, only the clock judges you, and R relights the same line instantly.',

  coop: {
    kind: 'soloOnly',
    reason:
      'A race needs a clock, and a shared world has only one. Whose clock arms on whose first input, whether teammates race the same line or relay it, and what a gate means when someone else already passed it are game design questions, not wiring — they need their own effort with a redrawn destination (wayfinder map-timetrials already ruled co-op racing out of scope).',
  },

  start(w) {
    const course = generateCourse(w.seed, w.arena, w.nav)
    w.race = {
      course,
      nextGate: 0,
      armed: false,
      time: 0,
      splits: [],
      best: loadRaceBest(w.storage, mapScopedSeed(w.map.id, w.seed)),
    }
    runner(w).body.pos.set(course.start.x, EYE_HEIGHT, course.start.z)
  },

  step(w, dt, input) {
    if (!w.race) {
      // a restored save carries no mode state; a timed run must not resume mid-flight,
      // so refresh means the same thing as R: the same line, relit
      raceMode.start(w)
      return
    }
    const race = w.race
    if (input.resupply && !w.prevInput.resupply) {
      restartRace(w)
      return
    }
    if (!race.armed) {
      if (!inputActive(input)) return
      race.armed = true
      w.events.push({ type: 'raceArmed' })
    }
    race.time += dt

    const gate = race.course.gates[race.nextGate]
    if (!gate) return
    const body = runner(w).body
    const p = body.pos
    const dx = p.x - gate.x
    const dy = p.y - gate.y
    const dz = p.z - gate.z
    if (dx * dx + dy * dy + dz * dz > gate.radius * gate.radius) return

    // through the ring: bank the split, breathe gas, light the next flare
    race.splits.push(race.time)
    body.gas = body.config.maxGas
    const index = race.nextGate
    race.nextGate += 1
    const bestSplit = race.best?.splits[index]
    w.events.push({
      type: 'gatePass',
      index,
      total: race.course.gates.length,
      split: race.time,
      delta: bestSplit === undefined ? null : race.time - bestSplit,
    })
    if (race.nextGate >= race.course.gates.length) finishRace(w, race)
  },
}

function finishRace(w: World, race: RaceState): void {
  const pb = race.best === null || race.time < race.best.time
  const delta = race.best === null ? null : race.time - race.best.time
  if (pb) {
    race.best = { time: race.time, splits: [...race.splits] }
    saveRaceBest(w.storage, mapScopedSeed(w.map.id, w.seed), race.best)
  }
  w.phase = 'finished'
  w.events.push({ type: 'raceFinished', time: race.time, splits: [...race.splits], pb, delta })
}

/** Same course, fresh soldier, timer rearmed — R mid-run or from the finish screen. */
export function restartRace(w: World): void {
  const race = w.race
  if (!race) return
  const soldier = runner(w)
  soldier.body = createPlayer()
  soldier.body.pos.set(race.course.start.x, EYE_HEIGHT, race.course.start.z)
  soldier.score = createScore()
  soldier.grab = null
  race.nextGate = 0
  race.armed = false
  race.time = 0
  race.splits = []
  w.phase = 'playing'
  w.events.push({ type: 'raceRestart' })
}
