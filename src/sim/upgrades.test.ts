import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { nearestStationDist } from './city'
import { startGrab, stepGrab } from './grab'
import { BLAST_DAMAGE, fireSpear, stepSpears } from './spear'
import { RESUPPLY_RADIUS } from './world'
import { raycastHookTarget } from './city'
import type { Arena } from './city'
import { trySlash } from './combat'
import type { GameState } from './game'
import { chooseUpgrade, createGame, startGame, stepGame } from './game'
import type { InputState, PlayerState } from './player'
import { DEFAULT_PLAYER_CONFIG, createPlayer, neutralInput, stepPlayer, tryBoost } from './player'
import { createRng } from './rng'
import { attachHook } from './rope'
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

/** Cuts landed in one second of working a nape as fast as the rig will let the blade come back. */
function cutsInOneSecond(p: PlayerState, arena: Arena): number {
  const titan = createTitan({ id: 9000, kind: 'normal', height: 15, x: 0, z: 0 })
  titan.facing = 0
  let cuts = 0
  for (let i = 0; i < 120; i++) {
    // this probe is about cadence, so nothing else may end the run early: the titan is healed,
    // the racks are refilled, and the speed stays under killSpeed so every cut only chips
    titan.hp = titan.maxHp
    p.blades = p.config.bladePairs
    p.bladeHp = p.config.bladeDurability
    p.pos.copy(napeCenter(titan))
    p.vel.set(2, 0, 0)
    p.onGround = false
    if (trySlash(p, [titan], aimAt(p, napeCenter(titan))).hit) cuts++
    stepPlayer(p, neutralInput(), DT, arena) // the real tick that runs slashTimer back down
  }
  return cuts
}

/**
 * Napes a swing can still find from a standoff ring. Reach widens napeHitRadius, so a swing
 * that whiffed at 9 m connects — this is the "did the bubble actually grow" probe, and it runs
 * trySlash, never a radius formula.
 */
function napesReachedFromStandoff(p: PlayerState): number {
  let connects = 0
  // napeHitRadius is (slashRange + height) * 0.35: 7.35 m on a stock rig against a 15 m titan,
  // 7.88 m with the reach. These samples straddle exactly that gap — sit them outside both and
  // the probe reads zero either way, which is a green test that proves nothing.
  for (const dist of [7.0, 7.2, 7.4, 7.6, 7.8, 8.0, 8.2]) {
    const titan = createTitan({ id: 7000 + dist, kind: 'normal', height: 15, x: 0, z: 0 })
    titan.facing = 0
    const nape = napeCenter(titan)
    p.pos.copy(nape).add(new Vector3(dist, 0, 0)) // back off along +x, aim back at the nape
    p.vel.set(2, 0, 0)
    p.onGround = false
    p.slashTimer = 0
    p.blades = p.config.bladePairs
    p.bladeHp = p.config.bladeDurability
    if (trySlash(p, [titan], aimAt(p, nape)).napeHit) connects++
  }
  return connects
}

/** Titans one thunder spear kills out of a ring standing just outside the stock blast. */
function titansKilledByOneBlast(p: PlayerState, arena: Arena): number {
  const titans = [0, 1, 2, 3, 4, 5].map((i) => {
    const angle = (i / 6) * Math.PI * 2
    // the blast measures to the body CYLINDER, not the center: a 15 m titan is 2.1 m thick, so
    // standing it 7.6 m out puts its hide 5.5 m from the spear — clear of the stock 5 m blast,
    // caught by the 6.5 m one. Ring them at 5.6 m and the stock blast already kills all six.
    const t = createTitan({
      id: 8000 + i,
      kind: 'normal',
      height: 15,
      x: Math.cos(angle) * 7.6,
      z: Math.sin(angle) * 7.6,
    })
    t.facing = 0
    t.hp = BLAST_DAMAGE // one blast is lethal, so a catch is a kill and the probe counts kills
    return t
  })
  p.pos.set(0, 1, 0)
  const spear = fireSpear(p, 1, new Vector3(0, -1, 0))! // straight down: it sticks at our feet
  const spears = [spear]
  let killed = 0
  for (let i = 0; i < 400 && spears.length > 0; i++) {
    const result = stepSpears(spears, titans, null, arena, DT)
    for (const blast of result.blasts) killed += blast.kills.length
  }
  return killed
}

/** Mashes it actually takes to tear out of a fist, driven through stepGrab. */
function mashesToEscape(p: PlayerState): number {
  const titan = createTitan({ id: 9100, kind: 'normal', height: 15, x: 0, z: 0 })
  const grab = startGrab(titan)
  for (let presses = 1; presses <= 100; presses++) {
    if (stepGrab(grab, true, 0, p.config.grabEscapePresses) === 'escaped') return presses
  }
  return 999
}

/** Gas a soldier has after calling for resupply while stranded far from every station. */
function gasAfterResupplyInTheField(game: GameState): number {
  const p = game.player
  p.gas = 5
  p.hp = 1
  // dead center of the district is 0.62R from every cardinal station and far from the plaza's
  // ring; assert the standoff rather than trust it, or a moved station turns this probe green
  p.pos.set(game.arena.wallRadius * 0.35, 2, game.arena.wallRadius * 0.35)
  expect(nearestStationDist(game.arena, p.pos.x, p.pos.z)).toBeGreaterThan(RESUPPLY_RADIUS)
  stepGame(game, { ...neutralInput(), resupply: true }, DT)
  return p.gas
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
  // same probe as extra-blades, honestly: more edge per pair and more pairs both buy you cuts.
  // The pick is a placebo if and only if the rig runs dry no later than a stock one — which is
  // exactly what this counts, so sharing it is the assertion, not a shortcut.
  whetstone: { probe: (p) => cutsUntilBladesGone(p), wants: 'up' },
  'hair-trigger': { probe: (p, g) => cutsInOneSecond(p, g.arena), wants: 'up' },
  'long-reach': { probe: (p) => napesReachedFromStandoff(p), wants: 'up' },
  'heavy-ordnance': { probe: (p, g) => titansKilledByOneBlast(p, g.arena), wants: 'up' },
  // fewer mashes is a better rig, so this is the one probe that must go DOWN
  'escape-artist': { probe: (p) => mashesToEscape(p), wants: 'down' },
  'field-kit': { probe: (_p, g) => gasAfterResupplyInTheField(g), wants: 'up' },
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
