import { describe, expect, it } from 'vitest'
import { chooseUpgrade, createGame, startGame, stepGame } from './game'
import type { GameMode } from './modes'
import { DEFAULT_MODE_ID, GAME_MODES, getMode } from './modes'
import { neutralInput } from './player'

const DT = 1 / 120

describe('mode registry', () => {
  it('lists waves as the default mode and falls back to it on unknown ids', () => {
    expect(DEFAULT_MODE_ID).toBe('waves')
    expect(GAME_MODES.some((m) => m.id === 'waves')).toBe(true)
    expect(getMode('waves').name.length).toBeGreaterThan(0)
    expect(getMode('definitely-not-a-mode').id).toBe('waves')
  })

  it('createGame carries the requested mode, defaulting to waves', () => {
    expect(createGame('s').mode.id).toBe('waves')
    expect(createGame('s', null, 'waves').mode.id).toBe('waves')
  })
})

describe('the mode seam', () => {
  it('drives run setup and per-tick progression through the mode hooks', () => {
    const calls: string[] = []
    const stub: GameMode = {
      id: 'stub',
      name: 'Stub',
      desc: 'test double',
      start(g) {
        calls.push('start')
        g.titans = []
      },
      step() {
        calls.push('step')
      },
    }
    const game = createGame('s')
    game.mode = stub
    startGame(game)
    expect(calls).toEqual(['start'])
    expect(game.phase).toBe('playing')
    stepGame(game, neutralInput(), DT)
    stepGame(game, neutralInput(), DT)
    expect(calls).toEqual(['start', 'step', 'step'])
  })

  it('a mode without titans never trips the wave-clear logic', () => {
    const stub: GameMode = {
      id: 'empty',
      name: 'Empty',
      desc: '',
      start(g) {
        g.titans = []
      },
      step() {},
    }
    const game = createGame('s')
    game.mode = stub
    startGame(game)
    for (let i = 0; i < 10; i++) stepGame(game, neutralInput(), DT)
    expect(game.phase).toBe('playing')
    expect(game.offers.length).toBe(0)
  })
})

describe('waves mode through the seam', () => {
  it('runs wave clear, upgrade offers and the next wave exactly as before', () => {
    const game = createGame('mode-parity')
    startGame(game)
    expect(game.wave).toBe(1)
    expect(game.titans.length).toBeGreaterThan(0)
    for (const t of game.titans) {
      t.hp = 0
      t.state = 'dead'
    }
    stepGame(game, neutralInput(), DT)
    expect(game.phase).toBe('upgrading')
    expect(game.offers.length).toBe(3)
    const before = game.titans.length
    chooseUpgrade(game, game.offers[0]!.id)
    expect(game.phase).toBe('playing')
    expect(game.wave).toBe(2)
    expect(game.titans.length).toBeGreaterThan(before)
  })

  it('stays deterministic: same seed, same waves and offers', () => {
    const run = () => {
      const game = createGame('det-check')
      startGame(game)
      for (const t of game.titans) {
        t.hp = 0
        t.state = 'dead'
      }
      stepGame(game, neutralInput(), DT)
      return game.offers.map((o) => o.id).join(',')
    }
    expect(run()).toBe(run())
  })
})
