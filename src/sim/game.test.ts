import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { chooseUpgrade, createGame, startGame, stepGame } from './game'
import { neutralInput } from './player'
import { napeCenter } from './titan'

const DT = 1 / 120

function playingGame(seed = 'test-seed') {
  const game = createGame(seed)
  startGame(game)
  return game
}

describe('createGame / startGame', () => {
  it('builds the same run for the same seed', () => {
    const a = playingGame('colossal')
    const b = playingGame('colossal')
    expect(a.titans.length).toBe(b.titans.length)
    expect(a.titans[0]!.pos.toArray()).toEqual(b.titans[0]!.pos.toArray())
    expect(a.arena.buildings.length).toBe(b.arena.buildings.length)
  })

  it('starts in menu and enters wave 1 on start', () => {
    const game = createGame('x')
    expect(game.phase).toBe('menu')
    startGame(game)
    expect(game.phase).toBe('playing')
    expect(game.wave).toBe(1)
    expect(game.titans.length).toBeGreaterThan(0)
  })
})

describe('wave clear and upgrades', () => {
  it('offers three upgrades when the wave is cleared, then starts a bigger wave', () => {
    const game = playingGame()
    for (const t of game.titans) {
      t.hp = 0
      t.state = 'dead'
    }
    const waveOneCount = game.titans.length
    stepGame(game, neutralInput(), DT)
    expect(game.phase).toBe('upgrading')
    expect(game.offers.length).toBe(3)

    chooseUpgrade(game, game.offers[0]!.id)
    expect(game.phase).toBe('playing')
    expect(game.wave).toBe(2)
    expect(game.titans.length).toBeGreaterThan(waveOneCount)
  })
})

describe('titan swats', () => {
  function gameWithImminentSwat() {
    const game = playingGame()
    game.titans.splice(1) // keep one titan
    const titan = game.titans[0]!
    titan.pos.set(0, 0, 0)
    titan.state = 'attack'
    titan.stateTime = 10 // way past windup: swat lands next step
    titan.attackCooldown = 0
    game.player.pos.set(0, 1.7, titan.height * 0.3)
    game.player.vel.set(0, 0, 0)
    return game
  }

  it('damages and knocks back the player, with an invulnerability window', () => {
    const game = gameWithImminentSwat()
    stepGame(game, neutralInput(), DT)
    expect(game.player.hp).toBe(game.player.config.maxHp - 1)
    expect(game.player.invulnTimer).toBeGreaterThan(0)

    // immediately swat again: invuln absorbs it
    const titan = game.titans[0]!
    titan.state = 'attack'
    titan.stateTime = 10
    titan.attackCooldown = 0
    stepGame(game, neutralInput(), DT)
    expect(game.player.hp).toBe(game.player.config.maxHp - 1)
  })

  it('kills the player at zero hearts', () => {
    const game = gameWithImminentSwat()
    game.player.hp = 1
    stepGame(game, neutralInput(), DT)
    expect(game.phase).toBe('dead')
  })
})

describe('slashing through the game loop', () => {
  it('kills a titan, scores it, and clears the events for the renderer', () => {
    const game = playingGame()
    game.titans.splice(1)
    const titan = game.titans[0]!
    game.player.pos.copy(napeCenter(titan))
    game.player.vel.set(30, 0, 0)
    game.player.onGround = false
    const input = neutralInput()
    input.slash = true
    stepGame(game, input, DT)
    expect(titan.hp).toBe(0)
    expect(game.score.score).toBeGreaterThan(0)
    expect(game.events.some((e) => e.type === 'kill')).toBe(true)
  })
})

describe('hooks through the game loop', () => {
  it('fires a hook at a building on the press edge and releases on the release edge', () => {
    const game = playingGame()
    game.arena.buildings.length = 0
    game.arena.buildings.push({ x: 30, z: 0, w: 10, d: 10, h: 40, kind: 'tower', ridgeAxis: 'x', tint: 0.5 })
    game.player.pos.set(0, 10, 0)
    const input = neutralInput()
    input.lookDir = new Vector3(1, 0, 0)
    input.hookL = true
    stepGame(game, input, DT)
    expect(game.player.hooks[0].state).toBe('attached')

    input.hookL = false
    stepGame(game, input, DT)
    expect(game.player.hooks[0].state).toBe('none')
  })
})

describe('resupply', () => {
  it('refills gas and blades only near the station', () => {
    const game = playingGame()
    game.player.gas = 5
    game.player.blades = 1
    game.player.pos.set(2, 1.7, 2) // at the plaza station
    const input = neutralInput()
    input.resupply = true
    stepGame(game, input, DT)
    expect(game.player.gas).toBe(game.player.config.maxGas)
    expect(game.player.blades).toBe(game.player.config.bladePairs)

    game.player.gas = 5
    game.player.pos.set(100, 1.7, 100)
    stepGame(game, input, DT)
    expect(game.player.gas).toBeLessThan(game.player.config.maxGas)
  })
})
