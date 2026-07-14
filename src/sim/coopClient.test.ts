import { describe, expect, it } from 'vitest'
import type { CoopSnapshot } from './coop'
import {
  INTERP_DELAY_MS,
  applySelfSnapshot,
  createSnapshotBuffer,
  pushSnapshot,
  stepCoopClient,
  syncSoldierMirror,
  syncSpearMirror,
  syncTitanMirror,
  type RemoteSoldier,
} from './coopClient'
import { SIM_DT } from './constants'
import { CYCLE_SECONDS, startFraction } from './daynight'
import { createGame } from './game'
import { neutralInput } from './player'

function snapPlayer(id: string, over: Partial<CoopSnapshot['players'][number]> = {}) {
  return {
    id,
    x: 0,
    y: 2,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    onGround: false,
    yaw: 0,
    pitch: 0,
    hooks: [null, null] as [null, null],
    hp: 5,
    maxHp: 5,
    alive: true,
    connected: true,
    score: 0,
    kills: 0,
    combo: 0,
    blades: 4,
    bladeHp: 6,
    spears: 2,
    kits: 0,
    picked: false,
    grab: null,
    ...over,
  }
}

function snapTitan(id: number, over: Partial<CoopSnapshot['titans'][number]> = {}) {
  return {
    id,
    kind: 'normal' as const,
    x: 0,
    y: 0,
    z: 0,
    facing: 0,
    height: 10,
    state: 'wander' as const,
    hp: 100,
    maxHp: 100,
    ankles: [false, false] as [boolean, boolean],
    ...over,
  }
}

function makeSnap(tick: number, titans: CoopSnapshot['titans'], players: CoopSnapshot['players']): CoopSnapshot {
  return {
    tick,
    phase: 'playing',
    wave: 1,
    pickTimer: 0,
    titans,
    boss: null,
    players,
    spears: [],
    pickups: [],
    folk: [],
    stations: [],
    folkStats: { saved: 0, lost: 0, delivered: 0 },
    results: null,
  }
}

describe('stepCoopClient', () => {
  it('emits a coopSlash intent once per press and honours the local cooldown', () => {
    const g = createGame('coop-test', null)
    g.phase = 'playing'
    const input = neutralInput()
    input.slash = true
    stepCoopClient(g, input, SIM_DT)
    expect(g.events.filter((e) => e.type === 'coopSlash')).toHaveLength(1)
    stepCoopClient(g, input, SIM_DT) // still held: no re-trigger
    expect(g.events.filter((e) => e.type === 'coopSlash')).toHaveLength(0)
    expect(g.player.slashTimer).toBeGreaterThan(0)
  })

  it('jams locally when out of blades instead of asking the server', () => {
    const g = createGame('coop-test', null)
    g.player.blades = 0
    const input = neutralInput()
    input.slash = true
    stepCoopClient(g, input, SIM_DT)
    expect(g.events).toContainEqual({ type: 'empty', kind: 'blades' })
    expect(g.events.some((e) => e.type === 'coopSlash')).toBe(false)
  })

  it('emits a resupply intent only near the station and never activates focus', () => {
    const g = createGame('coop-test', null)
    g.player.pos.set(g.arena.stations[0]!.x + 100, 2, g.arena.stations[0]!.z)
    const input = neutralInput()
    input.resupply = true
    input.focus = true
    stepCoopClient(g, input, SIM_DT)
    expect(g.events.some((e) => e.type === 'coopResupply')).toBe(false)
    expect(g.focusActive).toBe(false)

    const g2 = createGame('coop-test', null)
    g2.player.pos.set(g2.arena.stations[0]!.x, 2, g2.arena.stations[0]!.z)
    const input2 = neutralInput()
    input2.resupply = true
    stepCoopClient(g2, input2, SIM_DT)
    expect(g2.events.some((e) => e.type === 'coopResupply')).toBe(true)
  })

  it('drains the flashlight battery at night, same as solo', () => {
    const g = createGame('coop-test', null)
    g.phase = 'playing'
    g.time = (1 - startFraction(g.seed)) * CYCLE_SECONDS // local midnight
    const before = g.player.lamp
    stepCoopClient(g, neutralInput(), SIM_DT)
    expect(g.player.lamp).toBeLessThan(before)
  })
})

describe('snapshot interpolation', () => {
  it('drops out-of-order snapshots', () => {
    const buf = createSnapshotBuffer()
    pushSnapshot(buf, makeSnap(10, [], []), 1000)
    pushSnapshot(buf, makeSnap(9, [], []), 1050)
    expect(buf.b?.tick).toBe(10)
  })

  it('interpolates titans between the two newest snapshots', () => {
    const g = createGame('coop-test', null)
    const buf = createSnapshotBuffer()
    pushSnapshot(buf, makeSnap(1, [snapTitan(1, { x: 0, z: 0 })], []), 1000)
    pushSnapshot(buf, makeSnap(2, [snapTitan(1, { x: 10, z: 0 })], []), 1050)
    const halfway = 1000 + INTERP_DELAY_MS + 25
    syncTitanMirror(g, buf, halfway, 1 / 60)
    expect(g.titans).toHaveLength(1)
    expect(g.titans[0]!.pos.x).toBeCloseTo(5, 5)
  })

  it('resets stateTime on state changes and removes vanished titans', () => {
    const g = createGame('coop-test', null)
    const buf = createSnapshotBuffer()
    pushSnapshot(buf, makeSnap(1, [snapTitan(1), snapTitan(2)], []), 0)
    syncTitanMirror(g, buf, 200, 0.1)
    syncTitanMirror(g, buf, 250, 0.1)
    expect(g.titans[0]!.stateTime).toBeCloseTo(0.2, 5)
    pushSnapshot(buf, makeSnap(2, [snapTitan(1, { state: 'dead', hp: 0 })], []), 300)
    syncTitanMirror(g, buf, 500, 0.1)
    expect(g.titans).toHaveLength(1)
    expect(g.titans[0]!.state).toBe('dead')
    expect(g.titans[0]!.stateTime).toBe(0)
  })

  it('mirrors teammates but never myself, and forgets leavers', () => {
    const soldiers = new Map<string, RemoteSoldier>()
    const buf = createSnapshotBuffer()
    pushSnapshot(buf, makeSnap(1, [], [snapPlayer('me'), snapPlayer('friend', { x: 4 })]), 0)
    syncSoldierMirror(soldiers, buf, 'me', 100)
    expect([...soldiers.keys()]).toEqual(['friend'])
    expect(soldiers.get('friend')!.pos.x).toBeCloseTo(4)
    pushSnapshot(buf, makeSnap(2, [], [snapPlayer('me')]), 200)
    syncSoldierMirror(soldiers, buf, 'me', 400)
    expect(soldiers.size).toBe(0)
  })

  it('applies my server-authoritative hp/blades/score onto the local player', () => {
    const g = createGame('coop-test', null)
    const buf = createSnapshotBuffer()
    pushSnapshot(
      buf,
      makeSnap(1, [], [snapPlayer('me', { hp: 2, maxHp: 6, blades: 1, bladeHp: 3, score: 777, kills: 3, combo: 2 })]),
      0,
    )
    applySelfSnapshot(g, buf, 'me')
    expect(g.player.hp).toBe(2)
    expect(g.player.config.maxHp).toBe(6)
    expect(g.player.blades).toBe(1)
    expect(g.player.bladeHp).toBe(3)
    expect(g.score.score).toBe(777)
    expect(g.score.combo).toBe(2)
  })
})

describe('spear and pickup mirror', () => {
  it('keeps g.pickups referentially stable while the wave is unchanged (rack rebuild key)', () => {
    // SpearsView rebuilds every rack when the pickups array identity changes, so a
    // fresh array per frame means ~75 new meshes per frame and a GPU-memory leak
    const g = createGame('coop-test', null)
    const buf = createSnapshotBuffer()
    const snap1 = makeSnap(1, [], [])
    snap1.pickups = [
      { id: 1, x: 10, z: 0, taken: false },
      { id: 2, x: -10, z: 5, taken: false },
    ]
    pushSnapshot(buf, snap1, 0)
    syncSpearMirror(g, buf, 100)
    const firstArray = g.pickups
    expect(firstArray).toHaveLength(2)

    const snap2 = makeSnap(2, [], [])
    snap2.pickups = [
      { id: 1, x: 10, z: 0, taken: true }, // same wave, one cache claimed
      { id: 2, x: -10, z: 5, taken: false },
    ]
    pushSnapshot(buf, snap2, 50)
    syncSpearMirror(g, buf, 150)
    expect(g.pickups).toBe(firstArray) // same identity: no rack rebuild
    expect(g.pickups[0]!.taken).toBe(true) // but the flag still mirrors

    const snap3 = makeSnap(3, [], [])
    snap3.pickups = [
      { id: 3, x: 4, z: 4, taken: false }, // new wave: new cache ids
    ]
    pushSnapshot(buf, snap3, 100)
    syncSpearMirror(g, buf, 200)
    expect(g.pickups).not.toBe(firstArray) // new identity: racks rebuild once
    expect(g.pickups.map((pk) => pk.id)).toEqual([3])
  })
})

describe('local pilot physics', () => {
  it('still runs real movement: gravity pulls the airborne soldier down', () => {
    const g = createGame('coop-test', null)
    g.player.pos.set(0, 40, 8)
    const before = g.player.pos.y
    const input = neutralInput()
    for (let i = 0; i < 30; i++) stepCoopClient(g, input, SIM_DT)
    expect(g.player.pos.y).toBeLessThan(before)
    expect(g.player.vel.y).toBeLessThan(0)
  })
})
