import { EYE_HEIGHT } from './constants'
import type { Course } from './course'
import { generateCourse } from './course'
import type { GameState, StorageLike } from './game'
import type { GameMode } from './modes'
import type { InputState } from './player'
import { createPlayer } from './player'
import { createScore } from './score'

/**
 * Signal Run (wayfinder tt-003): the parkour time trial. An empty city, a seeded course
 * of gates, and a clock that starts on your first control input. Every ring refills gas;
 * R relights the same line instantly. Times are only comparable per seed.
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

export const raceMode: GameMode = {
  id: 'race',
  name: 'Signal Run',
  desc: 'The parkour time trial: chase the green flare across an empty district, ring to ring. Every gate refills your gas, only the clock judges you, and R relights the same line instantly.',

  start(g) {
    const course = generateCourse(g.seed, g.arena, g.nav)
    g.race = {
      course,
      nextGate: 0,
      armed: false,
      time: 0,
      splits: [],
      best: loadRaceBest(g.storage, g.seed),
    }
    g.player.pos.set(course.start.x, EYE_HEIGHT, course.start.z)
  },

  step(g, dt, input) {
    if (!g.race) {
      // a restored save carries no mode state; a timed run must not resume mid-flight,
      // so refresh means the same thing as R: the same line, relit
      raceMode.start(g)
      return
    }
    const race = g.race
    if (input.resupply && !g.prevInput.resupply) {
      restartRace(g)
      return
    }
    if (!race.armed) {
      if (!inputActive(input)) return
      race.armed = true
      g.events.push({ type: 'raceArmed' })
    }
    race.time += dt

    const gate = race.course.gates[race.nextGate]
    if (!gate) return
    const p = g.player.pos
    const dx = p.x - gate.x
    const dy = p.y - gate.y
    const dz = p.z - gate.z
    if (dx * dx + dy * dy + dz * dz > gate.radius * gate.radius) return

    // through the ring: bank the split, breathe gas, light the next flare
    race.splits.push(race.time)
    g.player.gas = g.player.config.maxGas
    const index = race.nextGate
    race.nextGate += 1
    const bestSplit = race.best?.splits[index]
    g.events.push({
      type: 'gatePass',
      index,
      total: race.course.gates.length,
      split: race.time,
      delta: bestSplit === undefined ? null : race.time - bestSplit,
    })
    if (race.nextGate >= race.course.gates.length) finishRace(g, race)
  },
}

function finishRace(g: GameState, race: RaceState): void {
  const pb = race.best === null || race.time < race.best.time
  const delta = race.best === null ? null : race.time - race.best.time
  if (pb) {
    race.best = { time: race.time, splits: [...race.splits] }
    saveRaceBest(g.storage, g.seed, race.best)
  }
  g.phase = 'finished'
  g.events.push({ type: 'raceFinished', time: race.time, splits: [...race.splits], pb, delta })
}

/** Same course, fresh soldier, timer rearmed — R mid-run or from the finish screen. */
export function restartRace(g: GameState): void {
  const race = g.race
  if (!race) return
  g.player = createPlayer()
  g.player.pos.set(race.course.start.x, EYE_HEIGHT, race.course.start.z)
  g.score = createScore()
  race.nextGate = 0
  race.armed = false
  race.time = 0
  race.splits = []
  g.phase = 'playing'
  g.events.push({ type: 'raceRestart' })
}
