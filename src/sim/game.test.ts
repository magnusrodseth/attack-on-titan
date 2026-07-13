import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { BOSS_LADDER, bossPartCenter, createBossFight } from './boss'
import { CYCLE_SECONDS, startFraction } from './daynight'
import { LAMP_BATTERY_SECONDS, LAMP_LOW_SECONDS } from './flashlight'
import type { GameEvent, GameState } from './game'
import { chooseUpgrade, createGame, MAX_CHASERS, startGame, stepGame } from './game'
import {
  GRAB_ESCAPE_PRESSES,
  GRAB_ESCAPE_SECONDS,
  GRAB_HP_COST,
  GRAB_LINGER_SECONDS,
} from './grab'
import { isWalkable } from './nav'
import { neutralInput } from './player'
import type { SpearState } from './spear'
import { anklePos, createTitan, napeCenter } from './titan'

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
    titan.facing = 0 // already facing the player; titans now turn gradually
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
    game.arena.buildings.push({ x: 30, z: 0, w: 10, d: 10, y0: 0, h: 40, kind: 'tower', ridgeAxis: 'x', tint: 0.5 })
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

describe('hooking titans', () => {
  function gameWithLoneTitan() {
    const game = playingGame()
    game.arena.buildings.length = 0
    game.titans.splice(1)
    const titan = game.titans[0]!
    titan.pos.set(40, 0, 0)
    titan.facing = 0
    game.player.pos.set(0, 5, 0)
    return { game, titan }
  }

  it('attaches to a titan in the crosshair and the anchor tracks its movement', () => {
    const { game, titan } = gameWithLoneTitan()
    const input = neutralInput()
    input.lookDir = new Vector3(40, titan.height * 0.5 - 5, 0).normalize()
    input.hookL = true
    stepGame(game, input, DT)
    const hook = game.player.hooks[0]
    expect(hook.state).toBe('attached')
    expect(hook.titanId).toBe(titan.id)

    const anchorBefore = hook.anchor.clone()
    titan.pos.x += 10
    stepGame(game, input, DT)
    expect(hook.anchor.x).toBeGreaterThan(anchorBefore.x + 8)
  })

  it('releases the hook when the hooked titan dies', () => {
    const { game, titan } = gameWithLoneTitan()
    const input = neutralInput()
    input.lookDir = new Vector3(40, titan.height * 0.5 - 5, 0).normalize()
    input.hookL = true
    stepGame(game, input, DT)
    expect(game.player.hooks[0].state).toBe('attached')
    titan.hp = 0
    stepGame(game, input, DT)
    expect(game.player.hooks[0].state).toBe('none')
  })
})

describe('focus (kill-charged)', () => {
  /** A fresh run whose titans are our own, far from wave-clear bookkeeping. */
  function gameWithOwnTitans(count: number) {
    const game = playingGame()
    game.titans.length = 0
    for (let i = 0; i < count; i++) {
      game.titans.push(
        createTitan({ id: game.nextTitanId++, kind: 'normal', height: 10, x: 40 + i * 30, z: 0 }),
      )
    }
    return game
  }

  function bladeKill(game: ReturnType<typeof playingGame>, index: number): GameEvent[] {
    const titan = game.titans[index]!
    game.player.slashTimer = 0
    game.player.pos.copy(napeCenter(titan))
    game.player.vel.set(30, 0, 0)
    game.player.onGround = false
    const input = neutralInput()
    input.slash = true
    stepGame(game, input, DT)
    expect(titan.hp).toBe(0)
    const killStepEvents = [...game.events]
    stepGame(game, neutralInput(), DT) // release the edge for the next press
    return killStepEvents
  }

  it('starts empty, never refills on its own, and Q does nothing uncharged', () => {
    const game = playingGame()
    expect(game.focus).toBe(0)
    expect(game.focusCharge).toBe(0)
    const input = neutralInput()
    input.focus = true
    stepGame(game, input, DT)
    expect(game.focusActive).toBe(false)
    for (let i = 0; i < 360; i++) stepGame(game, neutralInput(), DT) // 3 sim-seconds
    expect(game.focus).toBe(0)
  })

  it('banks a charge per kill and reports full on the third', () => {
    const game = gameWithOwnTitans(4)
    const seen: { charge: number; full: boolean }[] = []
    for (let i = 0; i < 3; i++) {
      // the charge event rides the kill step; the release step must not add another
      for (const e of bladeKill(game, i)) if (e.type === 'focusCharge') seen.push(e)
    }
    expect(game.focusCharge).toBe(3)
    expect(seen.map((e) => e.charge)).toEqual([1, 2, 3])
    expect(seen.map((e) => e.full)).toEqual([false, false, true])
  })

  it('a tap activates only at full charge, and releasing Q cannot end the window', () => {
    const game = playingGame()
    game.focusCharge = 3
    const input = neutralInput()
    input.focus = true
    stepGame(game, input, DT) // the tap: pressed for a single tick
    expect(game.focusActive).toBe(true)
    expect(game.focusCharge).toBe(0)
    expect(game.focus).toBeGreaterThan(0)

    // Q released: the window keeps running on its own clock
    for (let i = 0; i < 30; i++) stepGame(game, neutralInput(), DT)
    expect(game.focusActive).toBe(true)
    expect(game.focus).toBeGreaterThan(0)
  })

  it('the window lasts 3 real seconds of slow-mo, then the meter is empty', () => {
    const game = playingGame()
    game.focusCharge = 3
    const tap = neutralInput()
    tap.focus = true
    stepGame(game, tap, DT)
    expect(game.focusActive).toBe(true)

    // 3 real seconds at 0.3x = 0.9 sim-seconds = 108 ticks of drain
    for (let i = 0; i < 100; i++) stepGame(game, neutralInput(), DT)
    expect(game.focusActive).toBe(true) // still slowed near the end of the window
    for (let i = 0; i < 15; i++) stepGame(game, neutralInput(), DT)
    expect(game.focusActive).toBe(false)
    expect(game.focus).toBe(0)
    expect(game.focusCharge).toBe(0)

    // and Q is dead again until three more kills
    stepGame(game, tap, DT)
    expect(game.focusActive).toBe(false)
  })
})

describe('focus strike through the game loop', () => {
  function armedGame() {
    const game = playingGame()
    game.arena.buildings.length = 0
    game.titans.length = 0
    const titan = createTitan({ id: game.nextTitanId++, kind: 'normal', height: 10, x: 40, z: 0 })
    const bystander = createTitan({ id: game.nextTitanId++, kind: 'normal', height: 10, x: -200, z: 0 })
    game.titans.push(titan, bystander)
    game.player.pos.set(0, 10, 0)
    game.player.vel.set(0, 0, 0)
    game.focusCharge = 3
    const input = neutralInput()
    input.focus = true
    input.lookDir = napeCenter(titan).sub(game.player.pos).normalize()
    stepGame(game, input, DT) // activates focus and computes the lock
    return { game, titan, input }
  }

  it('locks the nape only while the window is open, and loses it when the window expires', () => {
    const { game, titan, input } = armedGame()
    expect(game.focusActive).toBe(true)
    expect(game.strikeTargetId).toBe(titan.id)

    input.focus = false // releasing Q changes nothing; the window has its own clock
    for (let i = 0; i < 120 && game.focusActive; i++) stepGame(game, input, DT)
    expect(game.focusActive).toBe(false)
    expect(game.strikeTargetId).toBe(null)
  })

  it('F with a lock dashes through the nape: instant kill, no blade cost', () => {
    const { game, titan, input } = armedGame()
    const bladesBefore = game.player.blades
    const bladeHpBefore = game.player.bladeHp

    input.slash = true
    stepGame(game, input, DT)
    expect(game.events.some((e) => e.type === 'strike')).toBe(true)
    expect(game.events.some((e) => e.type === 'slash')).toBe(false) // the press did not swing
    expect(game.focusActive).toBe(false) // time snapped back to full speed
    expect(game.focus).toBe(0)
    expect(game.strike).not.toBe(null)
    expect(game.player.invulnTimer).toBeGreaterThan(0)

    let killEvent: Extract<GameEvent, { type: 'kill' }> | undefined
    for (let i = 0; i < 200 && game.strike; i++) {
      stepGame(game, input, DT)
      const kill = game.events.find((e) => e.type === 'kill')
      if (kill && kill.type === 'kill') killEvent = kill
    }
    expect(killEvent).toBeDefined()
    expect(killEvent!.weapon).toBe('focus')
    expect(killEvent!.points).toBeGreaterThan(0)
    expect(titan.hp).toBe(0)
    expect(game.strike).toBe(null)
    expect(game.player.blades).toBe(bladesBefore) // the charge was the price, not steel
    expect(game.player.bladeHp).toBe(bladeHpBefore)
    expect(game.focusCharge).toBe(1) // the strike's own kill banks the first third
    expect(game.player.pos.x).toBeGreaterThan(40) // carried out the far side
  })

  it('releases attached hooks the moment the strike fires', () => {
    const { game, titan, input } = armedGame()
    game.arena.buildings.push({ x: 0, z: 30, w: 10, d: 10, y0: 0, h: 40, kind: 'tower', ridgeAxis: 'x', tint: 0.5 })
    const hookInput = neutralInput()
    hookInput.focus = true
    hookInput.lookDir = new Vector3(0, 0.5, 1).normalize()
    hookInput.hookL = true
    stepGame(game, hookInput, DT)
    expect(game.player.hooks[0].state).toBe('attached')

    input.hookL = true // still holding the rope when the lock lines up
    input.slash = true
    input.lookDir = napeCenter(titan).sub(game.player.pos).normalize()
    stepGame(game, input, DT)
    expect(game.events.some((e) => e.type === 'strike')).toBe(true)
    expect(game.player.hooks[0].state).toBe('none')
  })

  it('a strike that clears the wave does not survive into the intermission', () => {
    const { game, titan, input } = armedGame()
    game.titans.splice(1) // the lock target is the wave's last titan
    input.slash = true
    stepGame(game, input, DT)
    expect(game.strike).not.toBe(null)
    for (let i = 0; i < 200 && game.phase === 'playing'; i++) stepGame(game, input, DT)
    expect(titan.hp).toBe(0)
    expect(game.phase).toBe('upgrading')
    expect(game.strike).toBe(null) // no stale dash waiting to resume next wave
    expect(game.strikeTargetId).toBe(null)
    expect(game.focusActive).toBe(false)
  })

  it('never locks a nape hidden behind a building', () => {
    const { game, titan, input } = armedGame()
    game.arena.buildings.push({ x: 20, z: 0, w: 8, d: 8, y0: 0, h: 40, kind: 'tower', ridgeAxis: 'x', tint: 0.5 })
    input.lookDir = napeCenter(titan).sub(game.player.pos).normalize()
    stepGame(game, input, DT)
    expect(game.strikeTargetId).toBe(null)
  })
})

describe('boost burst', () => {
  it('bursts along the look direction on the press edge, once per click', () => {
    const game = playingGame()
    game.player.pos.set(0, 30, 0)
    game.player.onGround = false
    const input = neutralInput()
    input.gas = true
    input.lookDir = new Vector3(0, 1, 0)
    stepGame(game, input, DT)
    expect(game.events.some((e) => e.type === 'boost')).toBe(true)
    expect(game.player.vel.y).toBeGreaterThan(8)
    stepGame(game, input, DT) // still held: no second burst
    expect(game.events.some((e) => e.type === 'boost')).toBe(false)
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

  it('restores full health at the station', () => {
    const game = playingGame()
    game.player.hp = 1
    game.player.pos.set(2, 1.7, 2)
    const input = neutralInput()
    input.resupply = true
    stepGame(game, input, DT)
    expect(game.player.hp).toBe(game.player.config.maxHp)
  })

  it('recharges the flashlight battery at the station', () => {
    const game = playingGame()
    game.player.lamp = 3
    game.player.pos.set(2, 1.7, 2)
    const input = neutralInput()
    input.resupply = true
    stepGame(game, input, DT)
    expect(game.player.lamp).toBe(LAMP_BATTERY_SECONDS)
  })
})

describe('flashlight through the game loop', () => {
  /** Advances the run's clock to local midnight without stepping the sim. */
  function atMidnight(game: ReturnType<typeof playingGame>): void {
    game.time = (1 - startFraction(game.seed)) * CYCLE_SECONDS
  }

  it('drains the battery only while it is night', () => {
    const game = playingGame()
    const input = neutralInput()
    stepGame(game, input, DT) // seeded start is always daylight
    expect(game.player.lamp).toBe(LAMP_BATTERY_SECONDS)
    atMidnight(game)
    stepGame(game, input, DT)
    expect(game.player.lamp).toBeLessThan(LAMP_BATTERY_SECONDS)
  })

  it('warns once when the battery runs low, and again when it dies', () => {
    const game = playingGame()
    atMidnight(game)
    const input = neutralInput()
    game.player.lamp = LAMP_LOW_SECONDS + DT / 2
    stepGame(game, input, DT)
    expect(game.events.some((e) => e.type === 'lampLow')).toBe(true)
    stepGame(game, input, DT)
    expect(game.events.some((e) => e.type === 'lampLow')).toBe(false) // edge, not level

    game.player.lamp = DT / 2
    stepGame(game, input, DT)
    expect(game.events.some((e) => e.type === 'lampDead')).toBe(true)
    stepGame(game, input, DT)
    expect(game.events.some((e) => e.type === 'lampDead')).toBe(false)
  })
})

describe('titan navigation through the game loop', () => {
  it('spawns every titan on walkable ground, never inside a building', () => {
    const game = playingGame('nav-spawns')
    expect(game.titans.length).toBeGreaterThan(0)
    for (const titan of game.titans) {
      expect(isWalkable(game.nav, titan.pos.x, titan.pos.z)).toBe(true)
    }
  })

  it('lets at most MAX_CHASERS titans hunt the player at once, nearest first', () => {
    const game = playingGame()
    game.titans = []
    for (let i = 0; i < 6; i++) {
      game.titans.push(
        createTitan({ id: 100 + i, kind: 'normal', height: 12, x: 20 + i * 4, z: 0 }),
      )
    }
    game.player.pos.set(0, 1.7, 0)
    for (let i = 0; i < 60; i++) stepGame(game, neutralInput(), DT)
    const engaged = game.titans.filter((t) => ['chase', 'attack', 'leap'].includes(t.state))
    expect(engaged.length).toBeGreaterThan(0)
    expect(engaged.length).toBeLessThanOrEqual(MAX_CHASERS)
    expect(engaged.map((t) => t.id).sort()).toEqual([100, 101, 102])
  })
})

describe('empty resources', () => {
  it('slashing with no blade pairs left emits an empty event instead of a slash', () => {
    const game = playingGame()
    game.player.blades = 0
    game.player.bladeHp = 0
    const input = neutralInput()
    input.slash = true
    stepGame(game, input, DT)
    expect(game.events.some((e) => e.type === 'empty' && e.kind === 'blades')).toBe(true)
    expect(game.events.some((e) => e.type === 'slash')).toBe(false)
  })

  it('boosting with a dry tank and no canisters emits an empty gas event', () => {
    const game = playingGame()
    game.player.pos.set(0, 30, 0)
    game.player.onGround = false
    game.player.gas = 2
    game.player.canisters = 0
    const input = neutralInput()
    input.gas = true
    stepGame(game, input, DT)
    expect(game.events.some((e) => e.type === 'empty' && e.kind === 'gas')).toBe(true)
    expect(game.events.some((e) => e.type === 'boost')).toBe(false)
  })
})

describe('aberrant kills and ankle feedback', () => {
  it('kill events carry the titan kind and abnormals score a rarity bonus', () => {
    const run = (kind: 'normal' | 'abnormal') => {
      const game = playingGame()
      game.titans = [createTitan({ id: 50, kind, height: 12, x: 0, z: 0 })]
      const titan = game.titans[0]!
      game.player.pos.copy(napeCenter(titan))
      game.player.vel.set(30, 0, 0)
      game.player.onGround = false
      const input = neutralInput()
      input.slash = true
      stepGame(game, input, DT)
      const kill = game.events.find((e) => e.type === 'kill')
      return kill && kill.type === 'kill' ? kill : null
    }
    const normal = run('normal')
    const abnormal = run('abnormal')
    expect(normal?.kind).toBe('normal')
    expect(abnormal?.kind).toBe('abnormal')
    expect(abnormal!.points).toBeGreaterThan(normal!.points)
  })

  it('ankle slices report which ankle was cut', () => {
    const game = playingGame()
    game.titans = [createTitan({ id: 51, kind: 'normal', height: 14, x: 0, z: 0 })]
    const titan = game.titans[0]!
    titan.facing = 0
    game.player.pos.copy(anklePos(titan, 1))
    game.player.vel.set(2, 0, 0)
    const input = neutralInput()
    input.slash = true
    stepGame(game, input, DT)
    const event = game.events.find((e) => e.type === 'ankleSliced')
    expect(event && event.type === 'ankleSliced' && event.side).toBe(1)
  })
})

describe('health', () => {
  it('restores full health when the next wave starts', () => {
    const game = playingGame()
    game.player.hp = 1
    for (const t of game.titans) {
      t.hp = 0
      t.state = 'dead'
    }
    stepGame(game, neutralInput(), DT)
    chooseUpgrade(game, game.offers[0]!.id)
    expect(game.player.hp).toBe(game.player.config.maxHp)
  })

  it('grants one heart per titan kill, capped at max health', () => {
    const game = playingGame()
    game.titans.splice(1)
    const titan = game.titans[0]!
    game.player.hp = 1
    game.player.pos.copy(napeCenter(titan))
    game.player.vel.set(30, 0, 0)
    game.player.onGround = false
    const input = neutralInput()
    input.slash = true
    stepGame(game, input, DT)
    expect(titan.hp).toBe(0)
    expect(game.player.hp).toBe(2)
    const kill = game.events.find((e) => e.type === 'kill')
    expect(kill && 'heartGained' in kill && kill.heartGained).toBe(true)
  })

  it('does not overheal past max health on a kill', () => {
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
    expect(game.player.hp).toBe(game.player.config.maxHp)
    const kill = game.events.find((e) => e.type === 'kill')
    expect(kill && 'heartGained' in kill && kill.heartGained).toBe(false)
  })
})

describe('thunder spears', () => {
  function fireInput() {
    const input = neutralInput()
    input.fire = true
    input.lookDir.set(0, 0, -1)
    return input
  }

  function stuckAt(pos: Vector3, fuse = 0.001): SpearState {
    return {
      id: 99,
      phase: 'stuck',
      pos: pos.clone(),
      vel: new Vector3(),
      traveled: 0,
      titanId: null,
      local: new Vector3(),
      fuse,
    }
  }

  it('fires on the fire edge, spending a spear and announcing the rack count', () => {
    const game = playingGame()
    stepGame(game, fireInput(), DT)
    expect(game.spears).toHaveLength(1)
    expect(game.player.spears).toBe(game.player.config.spearCapacity - 1)
    expect(game.events).toContainEqual({ type: 'spearFired', remaining: game.player.spears })

    // held, not re-pressed: no second launch
    stepGame(game, fireInput(), DT)
    expect(game.spears).toHaveLength(1)
  })

  it('clicks empty when the rack is dry', () => {
    const game = playingGame()
    game.player.spears = 0
    stepGame(game, fireInput(), DT)
    expect(game.spears).toHaveLength(0)
    expect(game.events).toContainEqual({ type: 'empty', kind: 'spears' })
  })

  it('a nape blast kills at zero speed, pays flat spear points and returns a heart', () => {
    const game = playingGame()
    game.titans.splice(1)
    const titan = game.titans[0]!
    titan.pos.set(0, 0, -40)
    titan.facing = 0
    game.player.pos.set(0, 1.7, 60) // well outside the blast
    game.player.vel.set(0, 0, 0)
    game.player.hp = 2
    game.spears.push(stuckAt(napeCenter(titan)))
    stepGame(game, neutralInput(), DT)
    expect(titan.hp).toBe(0)
    const kill = game.events.find((e) => e.type === 'kill')
    expect(kill && 'weapon' in kill && kill.weapon).toBe('spear')
    expect(kill && 'points' in kill && kill.points).toBe(75)
    expect(game.player.hp).toBe(3)
    expect(game.events.some((e) => e.type === 'spearDetonated')).toBe(true)
  })

  it('a body blast staggers and surfaces the event', () => {
    const game = playingGame()
    game.titans.splice(1)
    const titan = game.titans[0]!
    titan.pos.set(0, 0, -40)
    titan.facing = 0
    titan.state = 'chase'
    game.player.pos.set(0, 1.7, 60)
    game.spears.push(stuckAt(new Vector3(0, 1, -40)))
    stepGame(game, neutralInput(), DT)
    expect(titan.state).toBe('staggered')
    expect(game.events).toContainEqual({ type: 'staggered', titanId: titan.id })
  })

  it('standing beside the blast costs a heart and flings the player away', () => {
    const game = playingGame()
    game.titans.splice(0)
    game.player.pos.set(2, 1.7, 8)
    game.player.vel.set(0, 0, 0)
    game.spears.push(stuckAt(new Vector3(0, 1, 8)))
    stepGame(game, neutralInput(), DT)
    expect(game.player.hp).toBe(game.player.config.maxHp - 1)
    expect(game.player.vel.x).toBeGreaterThan(0)
    expect(game.events.some((e) => e.type === 'playerHit')).toBe(true)
  })

  it('flying through a cache restocks one spear', () => {
    const game = playingGame()
    game.player.spears = 0
    const pickup = game.pickups[0]!
    game.player.pos.set(pickup.x, 1.7, pickup.z)
    game.player.vel.set(0, 0, 0)
    stepGame(game, neutralInput(), DT)
    expect(game.player.spears).toBe(1)
    expect(pickup.taken).toBe(true)
    expect(game.events).toContainEqual({ type: 'spearPickup', remaining: 1 })
  })

  it('each wave replaces the caches and sheds spears stuck in last wave corpses', () => {
    const game = playingGame()
    expect(game.pickups).toHaveLength(3)
    const firstWave = game.pickups.map((pk) => [pk.x, pk.z])

    const corpse = game.titans[0]!
    const inTitan = stuckAt(napeCenter(corpse), 100)
    inTitan.titanId = corpse.id
    const inWall = stuckAt(new Vector3(5, 1, 5), 100)
    inWall.id = 55 // distinct from the titan-stuck spear so the survivor is unambiguous
    game.spears.push(inTitan, inWall)

    for (const t of game.titans) {
      t.hp = 0
      t.state = 'dead'
    }
    stepGame(game, neutralInput(), DT)
    expect(game.phase).toBe('upgrading')
    chooseUpgrade(game, game.offers[0]!.id)

    expect(game.pickups).toHaveLength(3)
    expect(game.pickups.map((pk) => [pk.x, pk.z])).not.toEqual(firstWave)
    expect(game.spears.map((s) => s.id)).toEqual([inWall.id])
  })
})

describe('titan grabs', () => {
  /** A lone titan looming over a standing soldier; the palm is disarmed so only the fist acts. */
  function loiterGame() {
    const game = playingGame()
    game.arena.buildings.length = 0
    game.titans.splice(1)
    const titan = game.titans[0]!
    titan.pos.set(3, 0, 0)
    titan.attackCooldown = 600 // never swats: these tests are about the grab
    game.player.pos.set(0, 1.6, 0)
    game.player.vel.set(0, 0, 0)
    return { game, titan }
  }

  function stepUntilGrabbed(game: ReturnType<typeof playingGame>): GameEvent[] {
    const seen: GameEvent[] = []
    for (let t = 0; t < GRAB_LINGER_SECONDS + 2 && !game.grab; t += DT) {
      stepGame(game, neutralInput(), DT)
      seen.push(...game.events)
    }
    return seen
  }

  it('plucks a soldier who loiters at its feet into the fist', () => {
    const { game, titan } = loiterGame()
    const events = stepUntilGrabbed(game)
    expect(game.grab).not.toBeNull()
    expect(game.grab!.titanId).toBe(titan.id)
    expect(events).toContainEqual({ type: 'grabbed', titanId: titan.id })
    // pinned to the hold point, not standing on the street anymore
    expect(game.player.pos.y).toBeCloseTo(titan.pos.y + titan.height * 0.62, 1)
    expect(game.player.hp).toBe(game.player.config.maxHp)
  })

  it('reaches for a catchable soldier instead of swatting: the fist outranks the palm', () => {
    const { game, titan } = loiterGame()
    titan.attackCooldown = 0 // swats live, exactly like real play
    titan.state = 'chase'
    // square up so the swat would land dead-on if it were allowed to swing
    titan.facing = Math.atan2(game.player.pos.x - titan.pos.x, game.player.pos.z - titan.pos.z)
    const events = stepUntilGrabbed(game)
    expect(game.grab).not.toBeNull()
    expect(events).toContainEqual({ type: 'grabbed', titanId: titan.id })
    // the held swing never landed: no hit, no fling, full hearts at the moment of the grab
    expect(events.filter((e) => e.type === 'playerHit')).toHaveLength(0)
    expect(game.player.hp).toBe(game.player.config.maxHp)
  })

  it('with two fists in range neither swats, and the nearest one grabs', () => {
    const { game, titan } = loiterGame()
    titan.attackCooldown = 0
    titan.state = 'chase'
    titan.facing = Math.atan2(game.player.pos.x - titan.pos.x, game.player.pos.z - titan.pos.z)
    const second = createTitan({ id: game.nextTitanId++, kind: 'normal', height: 10, x: -4, z: 0 })
    second.state = 'chase'
    second.facing = Math.atan2(game.player.pos.x + 4, 0)
    game.titans.push(second)
    const events = stepUntilGrabbed(game)
    // both walked in swinging distance for the full linger, yet neither palm landed
    // (which fist wins is a walking race; nearest-wins is covered at the module seam)
    expect(game.grab).not.toBeNull()
    expect(events.filter((e) => e.type === 'playerHit')).toHaveLength(0)
    expect(game.player.hp).toBe(game.player.config.maxHp)
  })

  it('a moving soldier still eats the swat as before', () => {
    const { game, titan } = loiterGame()
    titan.attackCooldown = 0
    titan.state = 'chase'
    titan.facing = Math.atan2(game.player.pos.x - titan.pos.x, game.player.pos.z - titan.pos.z)
    const seen: GameEvent[] = []
    for (let t = 0; t < 3 && game.player.hp === game.player.config.maxHp; t += DT) {
      // darting through its reach: too fast to catch, re-pinned in the swat's arc each
      // tick so the swing has something to land on
      game.player.pos.set(0, 1.6, 0)
      game.player.vel.set(6, 0, 0)
      stepGame(game, neutralInput(), DT)
      seen.push(...game.events)
    }
    expect(seen.some((e) => e.type === 'playerHit')).toBe(true)
    expect(seen.some((e) => e.type === 'grabbed')).toBe(false)
  })

  it('mashing space fills the bar and flings the soldier free unharmed', () => {
    const { game, titan } = loiterGame()
    stepUntilGrabbed(game)
    const seen: GameEvent[] = []
    const input = neutralInput()
    for (let tick = 0; game.grab && tick < GRAB_ESCAPE_PRESSES * 2 + 4; tick++) {
      input.jump = tick % 2 === 0 // fresh press edges, not one long hold
      stepGame(game, input, DT)
      seen.push(...game.events)
    }
    expect(seen).toContainEqual({ type: 'grabEscaped', titanId: titan.id })
    expect(game.grab).toBeNull()
    expect(game.player.hp).toBe(game.player.config.maxHp)
    expect(game.player.vel.length()).toBeGreaterThan(5)
    expect(game.player.invulnTimer).toBeGreaterThan(0)
  })

  it('failing the timer costs two hearts and drops the soldier', () => {
    const { game, titan } = loiterGame()
    stepUntilGrabbed(game)
    const seen: GameEvent[] = []
    for (let t = 0; t < GRAB_ESCAPE_SECONDS + 0.5 && game.grab; t += DT) {
      stepGame(game, neutralInput(), DT)
      seen.push(...game.events)
    }
    const maxHp = game.player.config.maxHp
    expect(seen).toContainEqual({ type: 'grabFailed', titanId: titan.id, hp: maxHp - GRAB_HP_COST })
    expect(seen).toContainEqual({ type: 'playerHit', hp: maxHp - GRAB_HP_COST })
    expect(game.player.hp).toBe(maxHp - GRAB_HP_COST)
    expect(game.phase).toBe('playing')
    expect(game.grab).toBeNull()
  })

  it('a failed escape on the last two hearts is death', () => {
    const { game } = loiterGame()
    stepUntilGrabbed(game)
    game.player.hp = GRAB_HP_COST
    const seen: GameEvent[] = []
    for (let t = 0; t < GRAB_ESCAPE_SECONDS + 0.5 && game.phase === 'playing'; t += DT) {
      stepGame(game, neutralInput(), DT)
      seen.push(...game.events)
    }
    expect(game.phase).toBe('dead')
    expect(seen).toContainEqual({ type: 'death' })
  })

  it('the holder dying opens the fist without a scratch', () => {
    const { game, titan } = loiterGame()
    stepUntilGrabbed(game)
    titan.hp = 0
    stepGame(game, neutralInput(), DT)
    expect(game.grab).toBeNull()
    expect(game.events).toContainEqual({ type: 'grabReleased', titanId: titan.id })
    expect(game.player.hp).toBe(game.player.config.maxHp)
  })

  it('the holder stands frozen while it holds', () => {
    const { game, titan } = loiterGame()
    stepUntilGrabbed(game)
    const stateTime = titan.stateTime
    for (let t = 0; t < 1; t += DT) stepGame(game, neutralInput(), DT)
    expect(titan.stateTime).toBe(stateTime)
    expect(titan.vel.length()).toBe(0)
  })
})

describe('the shifter fight through the game loop', () => {
  function bossGame(specId: string) {
    const game = createGame('boss-loop', null, 'waves')
    startGame(game)
    const spec = BOSS_LADDER.find((s) => s.id === specId)!
    const fight = createBossFight(game.nextTitanId++, spec, spec.wave, game.seed, 0, 0)
    fight.titan.facing = 0
    game.boss = fight
    game.titans = [fight.titan]
    return { game, fight }
  }

  function slashInput() {
    const input = neutralInput()
    input.slash = true
    return input
  }

  function eventsOf(game: GameState, type: string) {
    return game.events.filter((e) => e.type === type)
  }

  it('announces the engagement once, with the bar payload', () => {
    const { game } = bossGame('beast-titan')
    game.player.pos.set(20, 2, 0)
    stepGame(game, neutralInput(), DT)
    const engaged = eventsOf(game, 'bossEngaged') as Extract<GameEvent, { type: 'bossEngaged' }>[]
    expect(engaged).toHaveLength(1)
    expect(engaged[0]!.name).toBe('Beast Titan')
    expect(engaged[0]!.parts).toHaveLength(3)
    stepGame(game, neutralInput(), DT)
    expect(eventsOf(game, 'bossEngaged')).toHaveLength(0)
  })

  it('breaking a weak point pays 250 and emits the break', () => {
    const { game, fight } = bossGame('beast-titan')
    const part = fight.spec.parts[0]!
    game.player.pos.copy(bossPartCenter(fight.titan, part))
    game.player.vel.set(game.player.config.killSpeed, 0, 0)
    game.player.onGround = true
    stepGame(game, slashInput(), DT)
    const breaks = eventsOf(game, 'bossPartBroken') as Extract<GameEvent, { type: 'bossPartBroken' }>[]
    expect(breaks).toHaveLength(1)
    expect(breaks[0]!.points).toBe(250)
    expect(game.score.score).toBe(250)
    expect(game.score.combo).toBe(1)
    expect(fight.titan.state).toBe('staggered')
  })

  it('the final nape cut kills, jackpots flawless, and clears the wave', () => {
    const { game, fight } = bossGame('beast-titan')
    // choreograph to the last phase: earlier parts broken by single clean cuts
    for (let i = 0; i < fight.state.parts.length - 1; i++) {
      const part = fight.state.parts[i]!
      part.hp = 0
      part.broken = true
      part.hits = 1
      part.chipped = false
    }
    fight.state.phase = fight.state.parts.length - 1
    const napeSpec = fight.spec.parts[fight.spec.parts.length - 1]!
    game.player.pos.copy(bossPartCenter(fight.titan, napeSpec))
    game.player.vel.set(game.player.config.killSpeed, 0, 0)
    game.player.onGround = true
    stepGame(game, slashInput(), DT)
    const killed = eventsOf(game, 'bossKilled') as Extract<GameEvent, { type: 'bossKilled' }>[]
    expect(killed).toHaveLength(1)
    expect(killed[0]!.flawless).toBe(true)
    expect(killed[0]!.points).toBe(3000) // 2000 x flawless 1.5, chain 0, grounded
    const kills = eventsOf(game, 'kill') as Extract<GameEvent, { type: 'kill' }>[]
    expect(kills).toHaveLength(1)
    expect(kills[0]!.kind).toBe('shifter')
    expect(game.phase).toBe('upgrading') // the wave cleared on the same tick
    expect(game.score.score).toBe(3000 + 250 * game.wave)
  })

  it('the boss death dissolves its living summons without paying kills', () => {
    const { game, fight } = bossGame('female-titan')
    const pure = createTitan({ id: 900, kind: 'normal', height: 9, x: 30, z: 30 })
    game.titans.push(pure)
    fight.state.summonIds.push(pure.id)
    for (let i = 0; i < fight.state.parts.length - 1; i++) {
      fight.state.parts[i]!.hp = 0
      fight.state.parts[i]!.broken = true
      fight.state.parts[i]!.hits = 1
    }
    fight.state.phase = fight.state.parts.length - 1
    fight.state.parts[fight.state.phase]!.hp = 100
    const napeSpec = fight.spec.parts[fight.spec.parts.length - 1]!
    game.player.pos.copy(bossPartCenter(fight.titan, napeSpec))
    game.player.vel.set(game.player.config.killSpeed, 0, 0)
    stepGame(game, slashInput(), DT)
    expect(fight.titan.hp).toBe(0)
    expect(pure.hp).toBe(0)
    expect((eventsOf(game, 'kill') as Extract<GameEvent, { type: 'kill' }>[]).every((e) => e.titanId !== pure.id)).toBe(true)
  })

  it('a roar shoves the soldier away', () => {
    const { game } = bossGame('founding-titan')
    game.player.pos.set(12, 1.6, 0)
    game.player.vel.set(0, 0, 0)
    let roared = false
    for (let i = 0; i < 300 && !roared; i++) {
      stepGame(game, neutralInput(), DT)
      if (eventsOf(game, 'bossRoar').length > 0) roared = true
    }
    expect(roared).toBe(true)
  })

  it('the steam aura scalds a soldier inside it while venting', () => {
    const { game, fight } = bossGame('colossus-titan')
    fight.state.steamOn = true
    fight.state.engaged = true
    game.player.pos.set(10, 2, 0) // deep inside a 60m titan's aura
    const hpBefore = game.player.hp
    stepGame(game, neutralInput(), DT)
    expect(game.player.hp).toBe(hpBefore - 1)
    expect(eventsOf(game, 'playerHit')).toHaveLength(1)
  })

  it('a boulder landing next to the soldier costs a heart', () => {
    const { game, fight } = bossGame('beast-titan')
    game.player.pos.set(0, 1.6, 30)
    fight.state.engaged = true
    fight.state.projectiles.push({
      id: 1,
      pos: new Vector3(0, 1, 30),
      vel: new Vector3(0, -40, 0),
    })
    const hpBefore = game.player.hp
    const impacts: GameEvent[] = []
    for (let i = 0; i < 10; i++) {
      stepGame(game, neutralInput(), DT)
      impacts.push(...eventsOf(game, 'bossProjectileImpact'))
    }
    expect(impacts.length).toBeGreaterThan(0)
    expect(game.player.hp).toBe(hpBefore - 1)
  })
})

describe('cardinal resupply stations', () => {
  it('refills at a corner station, far from the plaza', () => {
    const game = playingGame('stations-run')
    expect(game.arena.stations.length).toBeGreaterThanOrEqual(5)
    const corner = game.arena.stations[1]!
    game.player.pos.set(corner.x, 1.7, corner.z)
    game.player.gas = 0
    game.player.blades = 1
    const input = neutralInput()
    input.resupply = true
    stepGame(game, input, DT)
    expect(game.player.gas).toBe(game.player.config.maxGas)
    expect(game.player.blades).toBe(game.player.config.bladePairs)
    expect(game.events.some((e) => e.type === 'resupply')).toBe(true)
  })
})
