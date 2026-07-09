import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { chooseUpgrade, createGame, MAX_CHASERS, startGame, stepGame } from './game'
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

describe('focus (bullet time)', () => {
  it('activates on press with a full meter, drains, and deactivates on release', () => {
    const game = playingGame()
    const input = neutralInput()
    input.focus = true
    stepGame(game, input, DT)
    expect(game.focusActive).toBe(true)
    const before = game.focus
    stepGame(game, input, DT)
    expect(game.focus).toBeLessThan(before)
    stepGame(game, neutralInput(), DT)
    expect(game.focusActive).toBe(false)
  })

  it('will not start below the threshold, and the meter refills on its own', () => {
    const game = playingGame()
    game.focus = 10
    const input = neutralInput()
    input.focus = true
    stepGame(game, input, DT)
    expect(game.focusActive).toBe(false)
    for (let i = 0; i < 360; i++) stepGame(game, neutralInput(), DT) // 3 sim-seconds
    expect(game.focus).toBeGreaterThan(40)
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
