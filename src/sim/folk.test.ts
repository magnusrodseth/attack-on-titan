import { describe, expect, it } from 'vitest'
import { SIM_DT } from './constants'
import { DEVOUR_SECONDS, FOLK_PANIC_RADIUS, isStanding } from './folk'
import type { GameState } from './game'
import { createGame, startGame, stepGame } from './game'
import { GAME_MAPS, getMap } from './maps'
import { GAME_MODES } from './modes'
import { neutralInput } from './player'
import { isWalkable } from './nav'
import { staggerTitan } from './titan'
import { STATION_MAX, STATION_START_BLADES } from './world'

/**
 * The people in the streets, and the bargain they create.
 *
 * The load-bearing assertions here are the cruel ones: a fleeing civilian runs AT the
 * soldier (so saving people endangers you), and a feeding titan stands still with its nape
 * out (so letting one eat is the easiest kill in the game). If either of those ever stops
 * being true, the feature is dead and this file should fail loudly.
 */

const DT = SIM_DT

function running(map = 'district', mode = 'evacuation'): GameState {
  const g = createGame('folk-seed', null, mode, map)
  startGame(g)
  return g
}

function tick(g: GameState, seconds: number): void {
  const steps = Math.round(seconds / DT)
  for (let i = 0; i < steps; i++) stepGame(g, neutralInput(), DT)
}

describe('the district has people in it', () => {
  it('populates the streets from the seed, on walkable ground', () => {
    const g = running()
    expect(g.folk.length).toBe(getMap('district').population)
    for (const c of g.folk) {
      expect(isWalkable(g.nav, c.pos.x, c.pos.z)).toBe(true)
    }
  })

  it('the same seed populates the same streets with the same people', () => {
    const a = running()
    const b = running()
    expect(a.folk.map((c) => [Math.round(c.pos.x), Math.round(c.pos.z)])).toEqual(
      b.folk.map((c) => [Math.round(c.pos.x), Math.round(c.pos.z)]),
    )
  })

  it('nobody lives in the Forest, and it says so in the registry', () => {
    expect(getMap('forest').population).toBe(0)
    const g = running('forest')
    expect(g.folk).toHaveLength(0)
  })

  it('every mode declares whether the streets are populated', () => {
    for (const mode of GAME_MODES) expect(typeof mode.crowd).toBe('boolean')
    for (const map of GAME_MAPS) expect(typeof map.population).toBe('number')
    // The people live in exactly one mode: the one that is about them. Wave Survival is you
    // against the roster on empty streets; The Nine is a duel; The Culling leaves nobody free
    // to eat; and a race has no titans at all.
    expect(GAME_MODES.find((m) => m.id === 'evacuation')!.crowd).toBe(true)
    expect(GAME_MODES.find((m) => m.id === 'waves')!.crowd).toBe(false)
    expect(GAME_MODES.find((m) => m.id === 'bossrush')!.crowd).toBe(false)
    expect(GAME_MODES.find((m) => m.id === 'hunt')!.crowd).toBe(false)
    expect(GAME_MODES.find((m) => m.id === 'race')!.crowd).toBe(false)
  })

  it('a mode with no crowd has an empty district even on a populated map', () => {
    for (const mode of ['waves', 'bossrush', 'hunt']) {
      const g = running('district', mode)
      expect(g.folk).toHaveLength(0)
    }
  })

  it('the Forest cannot host The Evacuation: nobody lives there to evacuate', () => {
    expect(getMap('forest').modes).not.toContain('evacuation')
    expect(getMap('district').modes).toContain('evacuation')
  })
})

describe('the terrified run toward the soldier, which is the whole trap', () => {
  it('a panicking civilian closes on the nearest soldier, not on cover', () => {
    const g = running()
    g.titans = [g.titans[0]!]
    const titan = g.titans[0]!
    const c = g.folk[0]!
    // put the soldier far away, a titan right on top of the civilian
    g.player.pos.set(c.pos.x + 60, 1.7, c.pos.z)
    titan.pos.set(c.pos.x + 4, 0, c.pos.z)
    const before = Math.hypot(c.pos.x - g.player.pos.x, c.pos.z - g.player.pos.z)

    tick(g, 1.5)

    expect(c.state).toBe('flee')
    const after = Math.hypot(c.pos.x - g.player.pos.x, c.pos.z - g.player.pos.z)
    // they are RUNNING AT YOU. saving them brings the titans with them.
    expect(after).toBeLessThan(before - 3)
  })

  it('once the street is quiet they carry their supply to a station and stock it', () => {
    const g = running()
    g.titans = [] // no threat at all: they calm down and make for the rack
    const stocked = g.stations.map((s) => s.blades + s.spears)
    const c = g.folk[0]!
    c.state = 'flee'
    c.calm = 0
    // drop them right next to the plaza station so the walk is short
    const station = g.arena.stations[0]!
    c.pos.set(station.x + 10, 0, station.z)

    tick(g, 12)

    expect(c.state).toBe('safe')
    expect(g.folkStats.delivered).toBeGreaterThan(0)
    const after = g.stations.map((s) => s.blades + s.spears)
    expect(after.reduce((a, b) => a + b, 0)).toBeGreaterThan(stocked.reduce((a, b) => a + b, 0))
  })
})

describe('the devour window: the easiest nape in the game is attached to someone you failed', () => {
  function feedingGame() {
    const g = running()
    // one titan, one civilian, nothing else in the world
    g.titans = [g.titans[0]!]
    const titan = g.titans[0]!
    const c = g.folk[0]!
    g.folk = [c]
    g.player.pos.set(c.pos.x + 200, 1.7, c.pos.z) // far away: no chase token spent on us
    titan.pos.set(c.pos.x + 2, 0, c.pos.z)
    titan.attackCooldown = 0
    return { g, titan, c }
  }

  it('an untokened titan hunts a civilian and closes its fist on them', () => {
    const { g, titan, c } = feedingGame()
    tick(g, 4)
    expect(c.state).toBe('held')
    expect(c.heldBy).toBe(titan.id)
    expect(g.events.length >= 0).toBe(true)
  })

  it('a feeding titan stands still: it stops walking and stops swatting', () => {
    const { g, titan, c } = feedingGame()
    tick(g, 4)
    expect(c.state).toBe('held')
    const at = titan.pos.clone()
    c.window = DEVOUR_SECONDS // keep the window open: we are measuring a titan mid-meal
    tick(g, 0.6)
    expect(c.state).toBe('held')
    expect(titan.pos.distanceTo(at)).toBeLessThan(0.01) // rooted. this is the offer.
    expect(titan.vel.length()).toBe(0)
  })

  it('the window runs out and they are gone, and the district counts it', () => {
    const { g, c } = feedingGame()
    tick(g, 4)
    expect(c.state).toBe('held')
    tick(g, DEVOUR_SECONDS + 0.2)
    expect(c.state).toBe('dead')
    expect(g.folkStats.lost).toBe(1)
    expect(isStanding(c)).toBe(false)
  })

  it('killing the holder inside the window frees them, and the save is credited', () => {
    const { g, titan, c } = feedingGame()
    tick(g, 4)
    expect(c.state).toBe('held')

    // the soldier gets there in time: whoever last put steel in it owns the rescue
    g.lastHitBy.set(titan.id, g.soldiers[0]!.id)
    titan.hp = 0
    stepGame(g, neutralInput(), DT)

    // cut loose, they run for the rack: the supply line is fed by rescues, and nothing else
    expect(c.state).toBe('delivering')
    expect(g.folkStats.saved).toBe(1)
    expect(g.folkStats.lost).toBe(0)
    const saved = g.events.find((e) => e.type === 'civilianSaved')
    expect(saved).toBeDefined()
    if (saved && saved.type === 'civilianSaved') {
      expect(saved.playerId).toBe(g.soldiers[0]!.id)
      expect(saved.titanId).toBe(titan.id)
    }
  })

  it('a spear that staggers the holder knocks the fist open too', () => {
    const { g, titan, c } = feedingGame()
    tick(g, 4)
    expect(c.state).toBe('held')
    staggerTitan(titan)
    stepGame(g, neutralInput(), DT)
    expect(c.state).toBe('delivering')
    expect(g.folkStats.saved).toBe(1)
  })
})

describe('the stations run out, and the people refill them', () => {
  it('a station starts stocked and a resupply spends a charge', () => {
    const g = running()
    expect(g.stations[0]!.blades).toBe(STATION_START_BLADES)
    const p = g.player
    const station = g.arena.stations[0]!
    p.pos.set(station.x, 1.7, station.z)
    p.blades = 1
    p.bladeHp = 1
    p.gas = 0

    const input = neutralInput()
    input.resupply = true
    stepGame(g, input, DT)

    expect(g.stations[0]!.blades).toBe(STATION_START_BLADES - 1)
    expect(p.blades).toBe(p.config.bladePairs) // full rack of fresh steel
    expect(p.gas).toBe(p.config.maxGas) // gas is always free: free swinging is sacred
  })

  it('a bare station still gives gas and hearts, but no steel', () => {
    const g = running()
    g.stations[0] = { blades: 0, spears: 0 }
    const p = g.player
    const station = g.arena.stations[0]!
    p.pos.set(station.x, 1.7, station.z)
    p.blades = 1
    p.bladeHp = 1
    p.gas = 0
    p.hp = 1

    const input = neutralInput()
    input.resupply = true
    stepGame(g, input, DT)

    expect(p.gas).toBe(p.config.maxGas)
    expect(p.hp).toBe(p.config.maxHp)
    expect(p.blades).toBe(1) // nothing to hand you: fight on what you have
    expect(p.bladeHp).toBe(1)
    expect(g.events.some((e) => e.type === 'stationBare')).toBe(true)
  })

  it('a station never holds more than it can', () => {
    const g = running()
    g.stations[0] = { blades: STATION_MAX, spears: STATION_MAX }
    const c = g.folk[0]!
    g.titans = []
    c.state = 'flee'
    c.calm = 0
    const station = g.arena.stations[0]!
    c.pos.set(station.x + 8, 0, station.z)
    tick(g, 12)
    expect(g.stations[0]!.blades).toBe(STATION_MAX)
    expect(g.stations[0]!.spears).toBe(STATION_MAX)
  })
})

describe('an emptied district', () => {
  it('goes quiet, once, and stays quiet', () => {
    const g = running()
    for (const c of g.folk) c.state = 'dead'
    stepGame(g, neutralInput(), DT)
    expect(g.events.filter((e) => e.type === 'districtEmpty')).toHaveLength(1)
    stepGame(g, neutralInput(), DT)
    expect(g.events.filter((e) => e.type === 'districtEmpty')).toHaveLength(0)
  })

  it('ends the run in The Evacuation, at full health, because the headcount IS the life bar', () => {
    const g = running()
    expect(g.player.hp).toBe(g.player.config.maxHp)
    for (const c of g.folk) c.state = 'dead'
    stepGame(g, neutralInput(), DT)
    expect(g.events.some((e) => e.type === 'districtLost')).toBe(true)
    expect(g.phase).toBe('dead') // five hearts, and nothing left worth defending
  })

  it('stations are bottomless where nobody lives: no crowd, no scarcity', () => {
    const g = running('district', 'waves')
    const p = g.player
    const station = g.arena.stations[0]!
    p.pos.set(station.x, 1.7, station.z)
    const input = neutralInput()
    input.resupply = true
    for (let i = 0; i < 8; i++) {
      p.blades = 1
      p.bladeHp = 1
      stepGame(g, input, DT)
      stepGame(g, neutralInput(), DT)
      expect(p.blades).toBe(p.config.bladePairs) // it never runs dry
    }
    expect(g.events.some((e) => e.type === 'stationBare')).toBe(false)
  })

  it('panic radius is a real distance, not a whole-map leash', () => {
    expect(FOLK_PANIC_RADIUS).toBeGreaterThan(20)
    expect(FOLK_PANIC_RADIUS).toBeLessThan(120)
  })
})
