import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { raycastHookTarget } from './city'
import type { Arena } from './city'
import { trySlash } from './combat'
import type { GameState } from './game'
import { chooseUpgrade, createGame, startGame, stepGame } from './game'
import type { InputState, PlayerState } from './player'
import { DEFAULT_PLAYER_CONFIG, createPlayer, neutralInput, stepPlayer, tryBoost } from './player'
import { createRng } from './rng'
import { attachHook } from './rope'
import { fireSpear } from './spear'
import { createTitan, napeCenter } from './titan'
import { applyUpgrade, offerUpgrades, UPGRADE_POOL } from './upgrades'

const DT = 1 / 120
const FORWARD = new Vector3(0, 0, -1)

describe('offerUpgrades', () => {
  it('offers three distinct upgrades, deterministically per seed', () => {
    const a = offerUpgrades(createRng(4))
    const b = offerUpgrades(createRng(4))
    expect(a.map((u) => u.id)).toEqual(b.map((u) => u.id))
    expect(new Set(a.map((u) => u.id)).size).toBe(3)
  })
})

// --- the placebo guard -------------------------------------------------------
//
// Three PlayerConfig fields once shipped mutated-but-never-read, which made "Tuned Thrusters"
// a pure no-op and "Wind Dancer" half dead — and the tests passed, because they only asserted
// that a config number had moved. A stat is not alive until some sim module READS it. So every
// upgrade below is pinned by a probe that runs real sim code and returns a number: if a stat
// goes dangling again, its probe stops moving and this suite goes red.

/** Aim from the player toward a world point. */
function aimAt(p: PlayerState, point: Vector3): Vector3 {
  const dir = point.clone().sub(p.pos)
  return dir.lengthSq() > 0 ? dir.normalize() : FORWARD.clone()
}

/** Dashes the tank and its spare canisters can pay for before the boost goes dead. */
function dashesUntilDry(p: PlayerState): number {
  p.onGround = false
  let dashes = 0
  while (dashes < 500) {
    p.boostCooldown = 0
    if (!tryBoost(p, FORWARD)) break
    dashes++
  }
  return dashes
}

/** Speed one dash adds from a standstill. */
function dashSpeedGain(p: PlayerState): number {
  p.onGround = false
  p.vel.set(0, 0, 0)
  tryBoost(p, FORWARD)
  return p.vel.length()
}

/** Horizontal speed that air steering alone builds from a standstill over three seconds. */
function airSpeedAfter3s(p: PlayerState, arena: Arena): number {
  p.pos.set(0, 400, 0) // nothing to land on up here for the duration
  p.vel.set(0, 0, 0)
  p.onGround = false
  const input: InputState = { ...neutralInput(), move: new Vector3(0, 0, -1) }
  for (let i = 0; i < 360; i++) {
    p.vel.y = 0 // this probe is about horizontal air authority, not about falling
    stepPlayer(p, input, DT, arena)
  }
  return Math.hypot(p.vel.x, p.vel.z)
}

/** Metres of rope the winch pulls in over one second on a taut line. */
function reeledInOneSecond(p: PlayerState, arena: Arena): number {
  const anchor = new Vector3(0, 100, 0)
  p.pos.set(0, 60, 0)
  p.onGround = false
  attachHook(p.hooks[0], anchor, p.pos)
  const before = p.hooks[0].length
  for (let i = 0; i < 120; i++) {
    // pin the body each tick: the delta must be the winch, not the swing it would induce
    p.pos.set(0, 60, 0)
    p.vel.set(0, 0, 0)
    stepPlayer(p, neutralInput(), DT, arena)
  }
  return before - p.hooks[0].length
}

/** Anchors a sweep of sightlines can actually reach from a rooftop perch. */
function anchorsInReach(p: PlayerState, arena: Arena): number {
  const origin = new Vector3(0, 40, 0)
  let reachable = 0
  for (const pitch of [-0.35, -0.15, 0, 0.1]) {
    for (let i = 0; i < 72; i++) {
      const yaw = (i / 72) * Math.PI * 2
      const dir = new Vector3(Math.cos(yaw), pitch, Math.sin(yaw)).normalize()
      if (raycastHookTarget(arena, origin, dir, p.config.hookRange)) reachable++
    }
  }
  return reachable
}

/** Nape cuts landed before the blade racks run dry. */
function cutsUntilBladesGone(p: PlayerState): number {
  let cuts = 0
  while (cuts < 200) {
    const titan = createTitan({ id: 1000 + cuts, kind: 'normal', height: 15, x: 0, z: 0 })
    titan.facing = 0
    p.pos.copy(napeCenter(titan))
    p.vel.set(2, 0, 0) // under killSpeed: the cut chips and wears the blade instead of killing
    p.onGround = false
    p.slashTimer = 0
    if (!trySlash(p, [titan], aimAt(p, napeCenter(titan))).hit) break
    cuts++
  }
  return cuts
}

/** Spears the rack fires before it clicks empty. */
function spearsUntilEmpty(p: PlayerState): number {
  let fired = 0
  while (fired < 50) {
    p.fireTimer = 0
    if (!fireSpear(p, fired, FORWARD)) break
    fired++
  }
  return fired
}

/** 1 if a cut at this speed kills outright, 0 if it only chips. */
function oneCutsAt(p: PlayerState, speed: number): number {
  const titan = createTitan({ id: 1, kind: 'normal', height: 15, x: 0, z: 0 })
  titan.facing = 0
  p.pos.copy(napeCenter(titan))
  p.vel.set(speed, 0, 0)
  p.onGround = false
  p.slashTimer = 0
  return trySlash(p, [titan], aimAt(p, napeCenter(titan))).killed ? 1 : 0
}

/** Drives one real kill through stepGame, from a given starting hp and gas. */
function afterOneKill(game: GameState, startHp: number, startGas: number): PlayerState {
  const p = game.player
  p.hp = startHp
  p.gas = startGas
  const titan = createTitan({ id: 5000, kind: 'normal', height: 15, x: p.pos.x + 40, z: p.pos.z })
  titan.facing = 0
  game.titans.push(titan)
  p.pos.copy(napeCenter(titan))
  p.vel.set(30, 0, 0) // well over killSpeed: a clean one-cut
  p.onGround = false
  p.slashTimer = 0
  stepGame(game, { ...neutralInput(), slash: true, lookDir: aimAt(p, napeCenter(titan)) }, DT)
  return p
}

interface Probe {
  probe: (p: PlayerState, game: GameState) => number
  wants: 'up' | 'down'
}

/**
 * One probe per upgrade: a number real sim code produces, and the direction the pick must move
 * it. Deliberately NOT `p.config.x` reads — that is the assertion that let the placebos ship.
 */
const PROBES: Record<string, Probe> = {
  'gas-tank': { probe: (p) => dashesUntilDry(p), wants: 'up' },
  'spare-canister': { probe: (p) => dashesUntilDry(p), wants: 'up' },
  thrusters: { probe: (p) => dashSpeedGain(p), wants: 'up' },
  'wind-dancer': { probe: (p, g) => airSpeedAfter3s(p, g.arena), wants: 'up' },
  'fast-reel': { probe: (p, g) => reeledInOneSecond(p, g.arena), wants: 'up' },
  'long-cables': { probe: (p, g) => anchorsInReach(p, g.arena), wants: 'up' },
  'extra-blades': { probe: (p) => cutsUntilBladesGone(p), wants: 'up' },
  'spear-racks': { probe: (p) => spearsUntilEmpty(p), wants: 'up' },
  // a cut at 15.5 m/s chips at the stock threshold (17) and kills at the sharpened one (14.45)
  'sharp-blades': { probe: (p) => oneCutsAt(p, 15.5), wants: 'up' },
  // starting at the stock ceiling, the kill's heart-back only lands if the ceiling moved
  heart: { probe: (_p, g) => afterOneKill(g, DEFAULT_PLAYER_CONFIG.maxHp, 50).hp, wants: 'up' },
  'gas-refund': { probe: (_p, g) => afterOneKill(g, 3, 10).gas, wants: 'up' },
}

describe('every upgrade changes how the sim behaves', () => {
  it('pins a behavioural probe to every upgrade — a new pick cannot ship unpinned', () => {
    expect(Object.keys(PROBES).sort()).toEqual(UPGRADE_POOL.map((u) => u.id).sort())
  })

  for (const upgrade of UPGRADE_POOL) {
    it(`${upgrade.id} (${upgrade.name}) moves its probe, so the pick is never a placebo`, () => {
      const { probe, wants } = PROBES[upgrade.id]!

      const stock = createGame('probe-seed')
      startGame(stock)
      const before = probe(stock.player, stock)

      const picked = createGame('probe-seed')
      startGame(picked)
      applyUpgrade(picked.player, upgrade.id)
      const after = probe(picked.player, picked)

      if (wants === 'up') expect(after).toBeGreaterThan(before)
      else expect(after).toBeLessThan(before)
    })
  }
})

describe('the wave-clear pick reaches the live soldier', () => {
  it('carries the chosen upgrade into the running game, not just into a fresh player', () => {
    const game = createGame('upgrade-path')
    startGame(game)
    for (const titan of game.titans) {
      titan.hp = 0
      titan.state = 'dead'
    }
    stepGame(game, neutralInput(), DT) // wave cleared: the offer comes up
    expect(game.phase).toBe('upgrading')

    const offer = game.offers[0]!
    const stockConfig = { ...game.player.config }
    chooseUpgrade(game, offer.id)
    expect(game.phase).not.toBe('upgrading') // the pick resumes the run

    // the live run's soldier now differs from a stock one exactly where the pick says it does
    const expected = createPlayer()
    applyUpgrade(expected, offer.id)
    for (const key of Object.keys(stockConfig) as (keyof typeof stockConfig)[]) {
      if (expected.config[key] !== DEFAULT_PLAYER_CONFIG[key]) {
        expect(game.player.config[key]).not.toBe(stockConfig[key])
      }
    }
  })
})
