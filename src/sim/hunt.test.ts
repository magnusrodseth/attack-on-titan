import { describe, expect, it } from 'vitest'
import { MAX_CHASERS, chooseUpgrade, createGame, startGame, stepGame } from './game'
import {
  HUNT_KILL_ALLOWANCE_START,
  HUNT_URGENCY_FRACTION,
  huntAllowance,
} from './hunt'
import { getMode } from './modes'
import { restoreRun, serializeRun } from './persist'
import { neutralInput } from './player'
import { trialKey } from './race'

const DT = 1 / 120

function memStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v)
    },
  }
}

function huntGame(seed = 'trost', storage = memStorage()) {
  const game = createGame(seed, storage, 'hunt')
  startGame(game)
  return game
}

function clearLevel(game: ReturnType<typeof huntGame>) {
  for (const t of game.titans) {
    t.hp = 0
    t.state = 'dead'
  }
  stepGame(game, neutralInput(), DT)
}

describe('The Culling mode', () => {
  it('registers as hunt and grants roster-size x per-kill allowance up front', () => {
    expect(getMode('hunt').name).toBe('The Culling')
    const game = huntGame()
    expect(game.titans.length).toBeGreaterThan(0)
    expect(game.relentless).toBe(true)
    const budget = game.titans.length * HUNT_KILL_ALLOWANCE_START
    expect(game.hunt?.budget).toBeCloseTo(budget)
    expect(game.hunt?.timeLeft).toBeCloseTo(budget)
  })

  it('tightens the allowance level by level toward the hard floor', () => {
    expect(huntAllowance(1)).toBeCloseTo(HUNT_KILL_ALLOWANCE_START)
    expect(huntAllowance(2)).toBeLessThan(huntAllowance(1))
    expect(huntAllowance(60)).toBeGreaterThan(8.9) // never through the floor
    expect(huntAllowance(60)).toBeLessThan(9.5) // asymptote reached
  })

  it('runs the countdown while playing, pauses it through the upgrade pick', () => {
    const game = huntGame()
    const budget = game.hunt!.budget
    for (let i = 0; i < 120; i++) stepGame(game, neutralInput(), DT)
    expect(game.hunt!.timeLeft).toBeCloseTo(budget - 1, 1)

    clearLevel(game)
    expect(game.phase).toBe('upgrading')
    const frozen = game.hunt!.timeLeft
    for (let i = 0; i < 120; i++) stepGame(game, neutralInput(), DT)
    expect(game.hunt!.timeLeft).toBe(frozen) // the clock holds its breath

    chooseUpgrade(game, game.offers[0]!.id)
    expect(game.wave).toBe(2)
    const nextBudget = game.titans.length * huntAllowance(2)
    expect(game.hunt!.budget).toBeCloseTo(nextBudget)
    expect(game.hunt!.timeLeft).toBeCloseTo(nextBudget) // a fresh, tighter clock
  })

  it('ends the run at zero with a huntTimeout naming the deepest cleared level', () => {
    const game = huntGame()
    game.hunt!.timeLeft = DT / 2
    stepGame(game, neutralInput(), DT)
    expect(game.phase).toBe('dead')
    expect(game.hunt!.timeLeft).toBe(0)
    const over = game.events.find((e) => e.type === 'huntTimeout')
    expect(over).toMatchObject({ level: 1, cleared: 0 })
  })

  it('fires huntUrgency exactly once when the clock crosses the urgency fraction', () => {
    const game = huntGame()
    game.hunt!.timeLeft = game.hunt!.budget * HUNT_URGENCY_FRACTION + DT / 2
    stepGame(game, neutralInput(), DT)
    expect(game.events.some((e) => e.type === 'huntUrgency')).toBe(true)
    stepGame(game, neutralInput(), DT)
    expect(game.events.some((e) => e.type === 'huntUrgency')).toBe(false)
  })

  it('sends the whole district after the soldier: no aggro range, no cap, no leash', () => {
    const game = huntGame()
    expect(game.titans.length).toBeGreaterThan(MAX_CHASERS)
    stepGame(game, neutralInput(), DT)
    // spawns land 90-150m out, far past every kind's aggro range — all hunt anyway
    expect(game.titans.every((t) => t.state === 'chase')).toBe(true)

    // drag one to the far corner of the district: far past the leash, still hunting
    const runaway = game.titans[0]!
    runaway.pos.set(-150, 0, -150)
    stepGame(game, neutralInput(), DT)
    expect(runaway.state).toBe('chase')
  })

  it('leaves Wave Survival aggro and leash untouched (regression)', () => {
    const game = createGame('trost', memStorage(), 'waves')
    startGame(game)
    const titan = game.titans[0]!
    titan.kind = 'normal' // aggro 55, leash 82.5
    titan.pos.set(game.player.pos.x + 150, 0, game.player.pos.z)
    stepGame(game, neutralInput(), DT)
    expect(titan.state).toBe('wander') // too far to notice the soldier

    titan.state = 'chase'
    stepGame(game, neutralInput(), DT)
    expect(titan.state).toBe('wander') // and the leash still snaps a chase this long
  })

  it('banks the deepest-cleared PB, score breaking ties, never downgrading', () => {
    const storage = memStorage()
    const game = huntGame('trost', storage)
    game.score.score = 1000
    clearLevel(game)
    const first = JSON.parse(storage.getItem(trialKey('hunt', 'trost'))!) as {
      level: number
      score: number
    }
    expect(first.level).toBe(1)
    expect(first.score).toBeGreaterThanOrEqual(1250) // 1000 banked + the clear bonus

    // a later run clearing the same level with less score leaves the PB alone
    const rerun = huntGame('trost', storage)
    expect(rerun.hunt!.best).toEqual(first)
    clearLevel(rerun)
    expect(JSON.parse(storage.getItem(trialKey('hunt', 'trost'))!)).toEqual(first)

    // clearing deeper takes the crown regardless of score
    chooseUpgrade(rerun, rerun.offers[0]!.id)
    clearLevel(rerun)
    const deeper = JSON.parse(storage.getItem(trialKey('hunt', 'trost'))!) as { level: number }
    expect(deeper.level).toBe(2)
  })

  it('carries the countdown through a save/restore round trip — no refresh cheese', () => {
    const game = huntGame()
    for (let i = 0; i < 240; i++) stepGame(game, neutralInput(), DT) // burn two seconds
    const save = serializeRun(game)

    const restored = createGame('trost', memStorage(), 'hunt')
    expect(restoreRun(save, restored)).toBe(true)
    expect(restored.relentless).toBe(true)
    expect(restored.hunt?.timeLeft).toBeCloseTo(game.hunt!.timeLeft)
    expect(restored.hunt?.budget).toBeCloseTo(game.hunt!.budget)
  })
})
