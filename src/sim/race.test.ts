import { describe, expect, it } from 'vitest'
import { generateCourse } from './course'
import type { GameState } from './game'
import { createGame, startGame, stepGame } from './game'
import { getMode } from './modes'
import { neutralInput } from './player'
import { restartRace, trialKey } from './race'

const DT = 1 / 120

function raceGame(seed = 'trost') {
  const game = createGame(seed, memStorage(), 'race')
  startGame(game)
  return game
}

/** One tick of forward input: arms the clock. */
function arm(game: GameState) {
  const input = neutralInput()
  input.move.set(0, 0, 1)
  stepGame(game, input, DT)
}

/** Teleports through every remaining ring in order, one tick apiece. */
function runThroughAllGates(game: GameState) {
  const race = game.race!
  while (race.nextGate < race.course.gates.length && game.phase === 'playing') {
    const gate = race.course.gates[race.nextGate]!
    game.player.pos.set(gate.x, gate.y, gate.z)
    stepGame(game, neutralInput(), DT)
  }
}

function memStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v)
    },
  }
}

describe('Signal Run mode', () => {
  it('registers as race and starts an empty city at the course start', () => {
    expect(getMode('race').name).toBe('Signal Run')
    const game = raceGame()
    expect(game.titans).toEqual([])
    expect(game.pickups).toEqual([])
    const course = generateCourse('trost', game.arena, game.nav)
    expect(game.race?.course).toEqual(course)
    expect(game.player.pos.x).toBeCloseTo(course.start.x)
    expect(game.player.pos.z).toBeCloseTo(course.start.z)
  })

  it('arms the timer on the first control input, never on idle ticks', () => {
    const game = raceGame()
    for (let i = 0; i < 60; i++) stepGame(game, neutralInput(), DT)
    expect(game.race?.armed).toBe(false)
    expect(game.race?.time).toBe(0)

    const input = neutralInput()
    input.move.set(0, 0, 1)
    stepGame(game, input, DT)
    expect(game.race?.armed).toBe(true)
    expect(game.events.some((e) => e.type === 'raceArmed')).toBe(true)

    // once armed the clock runs even hands-off
    stepGame(game, neutralInput(), DT)
    expect(game.race!.time).toBeGreaterThan(DT / 2)
  })

  it('passes rings only in order and refills gas at each one', () => {
    const game = raceGame()
    arm(game)
    const gates = game.race!.course.gates

    // standing in the second ring does nothing while the first is still lit
    game.player.pos.set(gates[1]!.x, gates[1]!.y, gates[1]!.z)
    stepGame(game, neutralInput(), DT)
    expect(game.race!.nextGate).toBe(0)

    game.player.gas = 5
    game.player.pos.set(gates[0]!.x, gates[0]!.y, gates[0]!.z)
    stepGame(game, neutralInput(), DT)
    expect(game.race!.nextGate).toBe(1)
    expect(game.player.gas).toBe(game.player.config.maxGas)
    const pass = game.events.find((e) => e.type === 'gatePass')
    expect(pass).toMatchObject({ index: 0, total: gates.length, delta: null })
  })

  it('finishes with ascending splits and saves the PB; slower runs never overwrite it', () => {
    const storage = memStorage()
    const game = createGame('trost', storage, 'race')
    startGame(game)
    arm(game)
    runThroughAllGates(game)

    expect(game.phase).toBe('finished')
    const finish = game.events.find((e) => e.type === 'raceFinished')
    expect(finish).toMatchObject({ pb: true, delta: null })
    const splits = game.race!.splits
    expect(splits.length).toBe(game.race!.course.gates.length)
    for (let i = 1; i < splits.length; i++) expect(splits[i]!).toBeGreaterThan(splits[i - 1]!)
    const firstTime = game.race!.time
    const saved = JSON.parse(storage.getItem(trialKey('race', 'trost'))!) as { time: number }
    expect(saved.time).toBeCloseTo(firstTime)

    // a slower lap: every split shows red (positive delta) and the PB survives
    restartRace(game)
    arm(game)
    for (let i = 0; i < 240; i++) stepGame(game, neutralInput(), DT)
    runThroughAllGates(game)
    const slowFinish = game.events.find((e) => e.type === 'raceFinished')
    expect(slowFinish).toMatchObject({ pb: false })
    expect((slowFinish as { delta: number }).delta).toBeGreaterThan(0)
    const savedAfter = JSON.parse(storage.getItem(trialKey('race', 'trost'))!) as { time: number }
    expect(savedAfter.time).toBeCloseTo(firstTime)
  })

  it('R restarts instantly: same course, fresh soldier, clock rearmed', () => {
    const game = raceGame()
    arm(game)
    const course = game.race!.course
    const gate = course.gates[0]!
    game.player.pos.set(gate.x, gate.y, gate.z)
    stepGame(game, neutralInput(), DT)
    expect(game.race!.nextGate).toBe(1)

    const restart = neutralInput()
    restart.resupply = true
    stepGame(game, restart, DT)
    expect(game.events.some((e) => e.type === 'raceRestart')).toBe(true)
    expect(game.race!.course).toBe(course) // the exact same line, not a reroll
    expect(game.race!.nextGate).toBe(0)
    expect(game.race!.armed).toBe(false)
    expect(game.race!.time).toBe(0)
    expect(game.race!.splits).toEqual([])
    expect(game.phase).toBe('playing')
    expect(game.player.pos.x).toBeCloseTo(course.start.x)
    expect(game.player.pos.z).toBeCloseTo(course.start.z)
  })

  it('self-heals a restored run with no race state by relighting the line', () => {
    // a page refresh restores phase/player through persist.ts but never mode state;
    // a timed run must not resume mid-flight, so the mode restarts the same course
    const game = raceGame()
    game.race = null
    game.phase = 'playing'
    stepGame(game, neutralInput(), DT)
    const course = generateCourse('trost', game.arena, game.nav)
    expect(game.race).not.toBeNull()
    expect(game.race!.course).toEqual(course)
    expect(game.race!.armed).toBe(false)
    expect(game.player.pos.x).toBeCloseTo(course.start.x)
    expect(game.player.pos.z).toBeCloseTo(course.start.z)
  })
})
