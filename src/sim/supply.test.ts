import { describe, expect, it } from 'vitest'
import { DULL_PENALTY, oneCutSpeed, trySlash } from './combat'
import { createPlayer } from './player'
import { createTitan, napeCenter } from './titan'
import type { GameState } from './game'
import { createGame, startGame, stepGame } from './game'
import { neutralInput } from './player'
import { SIM_DT } from './constants'
import { SUPPLY_LOW_FRACTION, bladeFraction, gasFraction } from './world'

/**
 * The supply economy's demand side: blades that dull, and the warnings that let you do
 * something about it before you are standing on a rooftop with nothing to swing.
 */

const DT = SIM_DT

function napeSwing(speed: number, bladeHp: number) {
  const p = createPlayer()
  p.bladeHp = bladeHp
  const titan = createTitan({ id: 1, kind: 'normal', height: 15, x: 0, z: 0 })
  p.pos.copy(napeCenter(titan))
  p.vel.set(speed, 0, 0)
  p.onGround = false
  return { p, titan, result: trySlash(p, [titan], null) }
}

describe('dull blades raise the one-cut bar', () => {
  it('a fresh pair kills at exactly killSpeed', () => {
    const p = createPlayer()
    expect(oneCutSpeed(p)).toBeCloseTo(p.config.killSpeed, 5)
    const { titan, result } = napeSwing(p.config.killSpeed, p.config.bladeDurability)
    expect(result.killed).toBe(true)
    expect(titan.hp).toBe(0)
  })

  it('a nearly spent pair needs meaningfully more speed for the same cut', () => {
    const fresh = createPlayer()
    const bar = fresh.config.killSpeed * (1 + DULL_PENALTY * (1 - 1 / fresh.config.bladeDurability))
    const worn = createPlayer()
    worn.bladeHp = 1
    expect(oneCutSpeed(worn)).toBeCloseTo(bar, 5)
    expect(oneCutSpeed(worn)).toBeGreaterThan(20) // ~21.5 against a base of 17

    // the speed that used to take a head off now only chips
    const chip = napeSwing(fresh.config.killSpeed, 1)
    expect(chip.result.killed).toBe(false)
    expect(chip.titan.hp).toBeGreaterThan(0)

    // and the raised bar still kills, cleanly
    const clean = napeSwing(oneCutSpeed(worn) + 0.1, 1)
    expect(clean.result.killed).toBe(true)
  })

  it('the bar rises monotonically as the edge goes', () => {
    const bars = [6, 5, 4, 3, 2, 1].map((hp) => {
      const p = createPlayer()
      p.bladeHp = hp
      return oneCutSpeed(p)
    })
    for (let i = 1; i < bars.length; i++) expect(bars[i]!).toBeGreaterThan(bars[i - 1]!)
  })

  it('chip damage below the bar is NOT double-punished: it stays keyed on base killSpeed', () => {
    // the same sub-threshold swing does the same damage on fresh steel and on worn steel;
    // only the kill bar moved, which is the whole scope note
    const speed = 12
    const sharp = napeSwing(speed, 6)
    const dull = napeSwing(speed, 2)
    expect(sharp.result.killed).toBe(false)
    expect(dull.result.killed).toBe(false)
    expect(dull.result.damage).toBeCloseTo(sharp.result.damage, 5)
  })

  it('a broken pair reloads to a fresh edge, and the bar drops back to killSpeed', () => {
    const p = createPlayer()
    p.bladeHp = 1
    expect(oneCutSpeed(p)).toBeGreaterThan(p.config.killSpeed)
    const titan = createTitan({ id: 1, kind: 'normal', height: 15, x: 0, z: 0 })
    p.pos.copy(napeCenter(titan))
    p.vel.set(30, 0, 0)
    const result = trySlash(p, [titan], null)
    expect(result.bladeBroke).toBe(true)
    expect(oneCutSpeed(p)).toBeCloseTo(p.config.killSpeed, 5) // fresh pair in hand
  })
})

describe('the warnings that let you prepare', () => {
  function runningGame(): GameState {
    const g = createGame('supply', null, 'waves', 'district')
    startGame(g)
    return g
  }

  it('gas warns once on the way down, and re-arms after a resupply', () => {
    const g = runningGame()
    const p = g.player
    p.gas = p.config.maxGas * 0.1
    p.canisters = 0
    expect(gasFraction(p)).toBeLessThan(SUPPLY_LOW_FRACTION)

    stepGame(g, neutralInput(), DT)
    expect(g.events.filter((e) => e.type === 'gasLow')).toHaveLength(1)

    // it does not nag every tick while you stay dry
    stepGame(g, neutralInput(), DT)
    stepGame(g, neutralInput(), DT)
    expect(g.events.filter((e) => e.type === 'gasLow')).toHaveLength(0)

    // top up, and the warning re-arms for the next time
    p.gas = p.config.maxGas
    p.canisters = p.config.gasCanisters
    stepGame(g, neutralInput(), DT)
    p.gas = 0
    p.canisters = 0
    stepGame(g, neutralInput(), DT)
    expect(g.events.filter((e) => e.type === 'gasLow')).toHaveLength(1)
  })

  it('blades warn with the risen bar, so the warning says what it will cost you', () => {
    const g = runningGame()
    const p = g.player
    p.blades = 1
    p.bladeHp = 1
    expect(bladeFraction(p)).toBeLessThan(SUPPLY_LOW_FRACTION)

    stepGame(g, neutralInput(), DT)
    const warned = g.events.find((e) => e.type === 'bladesLow')
    expect(warned).toBeDefined()
    if (warned && warned.type === 'bladesLow') {
      // it does not just say "low", it says the titans stopped dying at your usual speed
      expect(warned.oneCutSpeed).toBeGreaterThan(p.config.killSpeed)
      expect(warned.fraction).toBeLessThan(SUPPLY_LOW_FRACTION)
    }
  })

  it('a full rack says nothing at all', () => {
    const g = runningGame()
    stepGame(g, neutralInput(), DT)
    expect(g.events.some((e) => e.type === 'gasLow' || e.type === 'bladesLow')).toBe(false)
  })
})
