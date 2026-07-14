import { describe, expect, it } from 'vitest'
import { BOSS_LADDER, BOSS_WAVE_INTERVAL } from './boss'
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
      coop: { kind: 'shared' },
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
      coop: { kind: 'shared' },
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

describe('mode registry fallback', () => {
  it('resolves a removed or unknown mode id to the default mode', () => {
    // e.g. localStorage remembering the retired matchday mode must not strand the menu
    expect(getMode('matchday').id).toBe('waves')
    expect(getMode('definitely-not-a-mode').id).toBe('waves')
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

describe('shifter waves', () => {
  function clearWave(game: ReturnType<typeof createGame>) {
    for (const t of game.titans) {
      t.hp = 0
      t.state = 'dead'
    }
    stepGame(game, neutralInput(), DT)
    if (game.phase === 'upgrading') chooseUpgrade(game, game.offers[0]!.id)
  }

  function advanceToWave(game: ReturnType<typeof createGame>, target: number) {
    while (game.wave < target) clearWave(game)
  }

  it('the first shifter wave of Wave Survival fields exactly one shifter, arriving via the gate', () => {
    const game = createGame('boss-spawn', null, 'waves')
    startGame(game)
    advanceToWave(game, BOSS_WAVE_INTERVAL)
    expect(game.titans).toHaveLength(1)
    expect(game.titans[0]!.kind).toBe('shifter')
    expect(game.boss).not.toBeNull()
    expect(game.boss!.spec.id).toBe('beast-titan')
    expect(game.boss!.titan.id).toBe(game.titans[0]!.id)
    // breached at the gate side: same wall angle, deep in the district
    const t = game.titans[0]!
    const angle = Math.atan2(t.pos.z, t.pos.x)
    let delta = angle - game.arena.gateAngle
    while (delta > Math.PI) delta -= Math.PI * 2
    while (delta < -Math.PI) delta += Math.PI * 2
    expect(Math.abs(delta)).toBeLessThan(0.35)
    expect(Math.hypot(t.pos.x, t.pos.z)).toBeGreaterThan(game.arena.wallRadius * 0.6)
    // spear caches still spawn: the plated fights need them
    expect(game.pickups.length).toBeGreaterThan(0)
  })

  it('a deep shifter wave still fields exactly one titan: the boss outranks the horde', () => {
    const game = createGame('boss-vs-matchday', null, 'waves')
    startGame(game)
    // wave 15: deep enough that an ordinary wave here would field a crowd, and a shifter wave
    // at every spacing this interval has had (5 → 3), so the regression it guards survives both
    const deep = 15
    expect(deep % BOSS_WAVE_INTERVAL).toBe(0)
    advanceToWave(game, deep)
    expect(game.titans).toHaveLength(1)
    expect(game.titans[0]!.kind).toBe('shifter')
    expect(game.boss!.spec.id).toBe(BOSS_LADDER[deep / BOSS_WAVE_INTERVAL - 1]!.id)
  })

  it('the wave after a shifter returns to a normal horde with the boss cleared', () => {
    const game = createGame('boss-then-horde', null, 'waves')
    startGame(game)
    advanceToWave(game, BOSS_WAVE_INTERVAL + 1)
    expect(game.boss).toBeNull()
    expect(game.titans.length).toBeGreaterThan(1)
    expect(game.titans.every((t) => t.kind !== 'shifter')).toBe(true)
  })

  it('the boss dying clears the wave like any roster', () => {
    const game = createGame('boss-clear', null, 'waves')
    startGame(game)
    advanceToWave(game, BOSS_WAVE_INTERVAL)
    game.boss!.titan.hp = 0
    stepGame(game, neutralInput(), DT)
    expect(game.phase).toBe('upgrading')
  })
})

describe('the nine (boss rush)', () => {
  it('is registered and fields the ladder one shifter per wave', () => {
    expect(getMode('bossrush').id).toBe('bossrush')
    const game = createGame('gauntlet', null, 'bossrush')
    startGame(game)
    expect(game.wave).toBe(1)
    expect(game.titans).toHaveLength(1)
    expect(game.titans[0]!.kind).toBe('shifter')
    expect(game.boss!.spec.id).toBe('beast-titan')

    game.boss!.titan.hp = 0
    game.boss!.titan.state = 'dead'
    stepGame(game, neutralInput(), DT)
    expect(game.phase).toBe('upgrading')
    expect(game.offers.length).toBe(3)
    chooseUpgrade(game, game.offers[0]!.id)
    expect(game.wave).toBe(2)
    expect(game.boss!.spec.id).toBe('cart-titan')
    expect(game.titans).toHaveLength(1)
  })

  it('laps the ladder after nine waves with hardened pools', () => {
    const game = createGame('gauntlet-lap', null, 'bossrush')
    startGame(game)
    const firstBeastHp = game.boss!.state.parts[0]!.maxHp
    while (game.wave < 10) {
      for (const t of game.titans) {
        t.hp = 0
        t.state = 'dead'
      }
      stepGame(game, neutralInput(), DT)
      chooseUpgrade(game, game.offers[0]!.id)
    }
    expect(game.boss!.spec.id).toBe('beast-titan')
    expect(game.boss!.state.parts[0]!.maxHp).toBeGreaterThan(firstBeastHp)
  })

  it('stays deterministic per seed', () => {
    const run = () => {
      const game = createGame('gauntlet-det', null, 'bossrush')
      startGame(game)
      return `${game.boss!.spec.id}:${game.boss!.titan.pos.x.toFixed(2)}:${game.boss!.state.rngState}`
    }
    expect(run()).toBe(run())
  })
})
