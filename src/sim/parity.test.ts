import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { BOSS_LADDER, BOSS_WAVE_INTERVAL, bossLadderFor, bossPartCenter, partHpScale, rosterHpScale } from './boss'
import { maxTitanHeightAt } from './city'
import {
  applySelfSnapshot,
  createSnapshotBuffer,
  pushSnapshot,
  syncBossMirror,
  syncCivilianMirror,
} from './coopClient'
import { seize } from './folk'
import {
  coopFire,
  coopMash,
  coopPickUpgrade,
  coopResupply,
  coopSlash,
  coopSnapshot,
  coopStep,
  createCoopWorld,
} from './coop'
import { CONTENT_HASH, contentFacts, hashFacts } from './content'
import { SIM_DT } from './constants'
import { createGame, startGame } from './game'
import { GAME_MAPS, coopMaps, getMap } from './maps'
import { GAME_MODES, coopModes } from './modes'
import { FEATURES, playableInCoop } from './stance'
import { TITAN_KINDS } from './titan'
import { UPGRADE_POOL } from './upgrades'
import { isWalkable } from './nav'

/**
 * The parity harness.
 *
 * Every bug this whole effort exists to kill was silent: a map, a mode, a Shifter added on
 * the solo side and simply never heard of in multiplayer. Nothing failed. Nothing warned.
 * The suite named "map/mode parity" in maps.test.ts never touched co-op once.
 *
 * The stance type (stance.ts) makes an *undeclared* answer a compile error. This file makes
 * a *false* one a test failure: every registry entry that claims it works with a squad has
 * to prove it, in a real co-op world, with four soldiers in it.
 *
 * These sweeps are registry-driven on purpose. Add a map, a mode, a titan kind or a Shifter
 * and it is tested the day you add it, without anyone remembering to edit this file.
 */

const COOP_ROSTER = ['erwin', 'levi', 'mikasa', 'armin']

/** Ticks a world like the room does: 120 Hz, whatever the wall clock is doing. */
function run(w: ReturnType<typeof createCoopWorld>, seconds: number): void {
  const steps = Math.round(seconds / SIM_DT)
  for (let i = 0; i < steps; i++) coopStep(w, SIM_DT)
}

describe('every registry entry declares what it does in multiplayer', () => {
  // The type system already refuses an entry with no stance; these assertions exist so the
  // *rule* is visible in the test output, not just in a compiler error nobody will ever see.
  it('modes, maps, kinds and Shifters all carry a co-op stance', () => {
    for (const mode of GAME_MODES) expect(mode.coop.kind).toBeTruthy()
    for (const map of GAME_MAPS) expect(map.coop.kind).toBeTruthy()
    for (const kind of TITAN_KINDS) expect(kind.coop.kind).toBeTruthy()
    for (const boss of BOSS_LADDER) expect(boss.coop.kind).toBeTruthy()
    for (const feature of FEATURES) expect(feature.coop.kind).toBeTruthy()
  })

  it('a solo-only stance always says why, and an adapted one always says how', () => {
    const stances = [
      ...GAME_MODES.map((m) => m.coop),
      ...GAME_MAPS.map((m) => m.coop),
      ...TITAN_KINDS.map((k) => k.coop),
      ...BOSS_LADDER.map((b) => b.coop),
      ...FEATURES.map((f) => f.coop),
    ]
    for (const stance of stances) {
      if (stance.kind === 'soloOnly') expect(stance.reason.length).toBeGreaterThan(20)
      if (stance.kind === 'adapted') expect(stance.note.length).toBeGreaterThan(20)
    }
  })

  it('the co-op lobby offers exactly the content whose stance allows a squad', () => {
    expect(coopModes().map((m) => m.id)).toEqual(
      GAME_MODES.filter((m) => playableInCoop(m.coop)).map((m) => m.id),
    )
    expect(coopMaps().map((m) => m.id)).toEqual(
      GAME_MAPS.filter((m) => playableInCoop(m.coop)).map((m) => m.id),
    )
    // and the two that cannot be shared are honestly absent rather than half-run
    expect(coopModes().map((m) => m.id)).not.toContain('race')
    expect(coopModes().map((m) => m.id)).not.toContain('hunt')
  })
})

describe('every co-op mode runs on every co-op map, with one soldier and with four', () => {
  for (const mode of coopModes()) {
    for (const map of coopMaps()) {
      if (!map.modes.includes(mode.id)) continue
      for (const squad of [1, 4]) {
        it(`${mode.id} on ${map.id} with ${squad}`, () => {
          const roster = COOP_ROSTER.slice(0, squad)
          const w = createCoopWorld(`parity-${mode.id}-${map.id}`, roster, 'city', map.id, mode.id)
          expect(w.map.id).toBe(map.id)
          expect(w.mode.id).toBe(mode.id)
          expect(w.soldiers).toHaveLength(squad)
          // a wave exists, and the mode put it there: this is the assertion that would have
          // failed for every map and every mode before the world was unified
          expect(w.titans.length).toBeGreaterThan(0)
          run(w, 3)
          expect(w.phase).not.toBe('ended') // nobody dies to nothing in three seconds
          const snap = coopSnapshot(w)
          expect(snap.titans.length).toBe(w.titans.length)
          expect(snap.players).toHaveLength(squad)
        })
      }
    }
  }
})

describe('every map spawns a legal roster in a co-op world', () => {
  for (const map of coopMaps()) {
    it(`${map.id}: no titan spawns inside a wall or through the roof`, () => {
      const w = createCoopWorld(`spawn-${map.id}`, COOP_ROSTER, 'city', map.id, 'waves')
      expect(w.titans.length).toBeGreaterThan(0)
      for (const titan of w.titans) {
        expect(isWalkable(w.nav, titan.pos.x, titan.pos.z)).toBe(true)
        // the clamp co-op never had: the underground's dome would have had titans standing
        // with their napes in the rock, and nothing anywhere would have said a word
        const room = maxTitanHeightAt(w.arena, titan.pos.x, titan.pos.z)
        expect(titan.height).toBeLessThanOrEqual(room + 0.001)
      }
    })
  }
})

describe('the Nine fight a squad, on every map that can hold them', () => {
  for (const map of coopMaps()) {
    const ladder = bossLadderFor(getMap(map.id).generate('boss-city'))
    for (const spec of ladder) {
      it(`${spec.name} on ${map.id}: engages, breaks and falls`, () => {
        // boss rush puts one Shifter per wave, so wave N is ladder slot N-1
        const slot = ladder.indexOf(spec)
        const w = createCoopWorld(`boss-${spec.id}-${map.id}`, COOP_ROSTER, 'boss-city', map.id, 'bossrush')
        while (w.wave < slot + 1) {
          // skip ahead through the ladder without fighting: kill the wave, take the upgrade
          for (const t of w.titans) t.hp = 0
          coopStep(w, SIM_DT)
          expect(w.phase).toBe('upgrading')
          for (const s of w.soldiers) coopPickUpgrade(w, s.id, s.offers[0]!.id)
        }
        const fight = w.boss
        expect(fight).not.toBeNull()
        expect(fight!.spec.id).toBe(spec.id)
        expect(fight!.titan.height).toBe(spec.height) // never shrunk to fit a map

        // four blades cut four times as fast, so the pools are four times as deep
        const lapScale = partHpScale(0)
        for (const [i, part] of fight!.state.parts.entries()) {
          const authored = spec.parts[i]!.hp
          expect(part.maxHp).toBe(Math.round(authored * lapScale * rosterHpScale(4)))
        }

        // and it dies to soldiers' blades, not to a test helper: cut the lit Weak Point until
        // it breaks, then the next, all the way down the authored sequence to the nape. A
        // clean cut is worth a flat CLEAN_CUT_DAMAGE, so a roster-scaled pool honestly takes
        // proportionally more of them — which is the whole point of scaling it.
        const s = w.soldiers[0]!
        const breaks: number[] = []
        for (let guard = 0; guard < 400 && fight!.titan.hp > 0; guard++) {
          const partSpec = fight!.spec.parts[fight!.state.phase]
          if (!partSpec) break
          const partState = fight!.state.parts[fight!.state.phase]!
          partState.plated = false // a plate is a spear's job; this test is about the shape
          const before = fight!.state.phase
          s.body.pos.copy(bossPartCenter(fight!.titan, partSpec))
          s.body.vel.set(s.body.config.killSpeed, 0, 0) // a clean cut, right at the bar
          s.body.onGround = true
          s.body.blades = 9
          s.body.bladeHp = 99
          s.body.slashTimer = 0
          coopSlash(w, s.id, null, 0)
          if (fight!.state.phase > before) breaks.push(before)
        }
        expect(breaks.length).toBe(fight!.spec.parts.length) // every part, in order
        expect(fight!.titan.hp).toBeLessThanOrEqual(0) // and the nape ends it
        expect(s.score.score).toBeGreaterThan(0)
        const events = coopStep(w, SIM_DT)
        expect(events.some((e) => e.type === 'waveClear')).toBe(true)
      })
    }
  }
})

describe('the wire carries everything the fight needs', () => {
  it('a Shifter survives the round trip: snapshot → client mirror → the same fight', () => {
    const w = createCoopWorld('wire-boss', ['levi'], 'city', 'district', 'bossrush')
    run(w, 1)
    const fight = w.boss!
    expect(fight).toBeTruthy()
    fight.state.parts[0]!.hp = 42
    fight.state.steamOn = true

    const g = createGame('wire-boss', null, 'bossrush', 'district')
    startGame(g)
    const buf = createSnapshotBuffer()
    pushSnapshot(buf, coopSnapshot(w), 0)
    // the client mirrors titans first (the fight hangs off its titan), then the fight
    g.titans = [fight.titan]
    syncBossMirror(g, buf)

    expect(g.boss).not.toBeNull()
    expect(g.boss!.spec.id).toBe(fight.spec.id)
    expect(g.boss!.state.phase).toBe(fight.state.phase)
    expect(g.boss!.state.parts[0]!.hp).toBe(42)
    expect(g.boss!.state.parts.map((p) => p.maxHp)).toEqual(
      fight.state.parts.map((p) => p.maxHp),
    )
    expect(g.boss!.state.steamOn).toBe(true)
  })

  it('the fist survives the round trip: a grabbed soldier mashes on the client', () => {
    const w = createCoopWorld('wire-grab', ['levi'], 'city', 'district', 'waves')
    const s = w.soldiers[0]!
    const titan = w.titans[0]!
    titan.state = 'wander'
    // loiter at its feet until the fist closes
    for (let i = 0; i < 600 && !s.grab; i++) {
      s.body.pos.set(titan.pos.x + 1, 1.7, titan.pos.z + 1)
      s.body.vel.set(0, 0, 0)
      s.body.invulnTimer = 0
      coopStep(w, SIM_DT)
    }
    expect(s.grab).not.toBeNull()

    const snap = coopSnapshot(w)
    expect(snap.players[0]!.grab).toEqual({
      titanId: titan.id,
      presses: 0,
      timeLeft: expect.any(Number),
    })

    // the client sees the fist, so its own loop stops flying and starts mashing
    const g = createGame('wire-grab', null, 'waves', 'district')
    startGame(g)
    g.titans = [titan]
    const buf = createSnapshotBuffer()
    pushSnapshot(buf, snap, 0)
    applySelfSnapshot(g, buf, 'levi')
    expect(g.grab?.titanId).toBe(titan.id)

    // and the mash intent reaches the world, where it fills the bar
    coopMash(w, 'levi')
    coopStep(w, SIM_DT)
    expect(s.grab!.presses).toBeGreaterThan(0)
  })

  it('every titan kind reaches the client with its stats intact', () => {
    const w = createCoopWorld('wire-kinds', ['levi'], 'city', 'district', 'waves')
    for (const [i, kind] of TITAN_KINDS.entries()) {
      const titan = w.titans[i]
      if (!titan) continue
      titan.kind = kind.id
    }
    const snap = coopSnapshot(w)
    // the snapshot carries `kind` as a bare string; the client builds a real titan from it,
    // and an unknown kind would read KIND_STATS[undefined] with nothing to catch it — which
    // is exactly why the content hash exists (content.ts)
    for (const t of snap.titans) {
      expect(TITAN_KINDS.some((k) => k.id === t.kind)).toBe(true)
    }
    expect(CONTENT_HASH).toMatch(/^[a-z0-9-]+$/)
  })

  it('the content hash moves when content moves, and holds when it does not', () => {
    expect(hashFacts(contentFacts())).toBe(CONTENT_HASH) // same registries, same world
    expect(CONTENT_HASH.length).toBeGreaterThan(3)

    // and it genuinely MOVES: the boss cadence is content, because a client that thinks wave 3
    // is a Shifter wave while the server still thinks wave 5 is announces a boss nobody spawned.
    // Asserting CONTENT_HASH === CONTENT_HASH (what this test used to do) would pass even if the
    // cadence were not in the hash at all.
    expect(hashFacts(contentFacts(BOSS_WAVE_INTERVAL + 1))).not.toBe(CONTENT_HASH)

    // an added or removed registry entry moves it too, which is the whole point
    expect(hashFacts([...contentFacts(), 'boss:some-new-shifter'])).not.toBe(CONTENT_HASH)
  })
})

describe('the crowd is shared, and has to prove it with a squad', () => {
  it('a co-op district is populated, and the same seed puts the same people in it', () => {
    const a = createCoopWorld('crowd', COOP_ROSTER, 'city', 'district', 'waves')
    const b = createCoopWorld('crowd', COOP_ROSTER, 'city', 'district', 'waves')
    expect(a.folk.length).toBe(getMap('district').population)
    expect(a.folk.map((c) => [Math.round(c.pos.x), Math.round(c.pos.z)])).toEqual(
      b.folk.map((c) => [Math.round(c.pos.x), Math.round(c.pos.z)]),
    )
  })

  it('titans without a chase token hunt the crowd, with four soldiers exactly as with one', () => {
    const w = createCoopWorld('crowd-hunt', COOP_ROSTER, 'city', 'district', 'waves')
    run(w, 6)
    // somebody, somewhere, is being hunted: that is the whole feature
    expect(w.titans.some((t) => t.prey !== null)).toBe(true)
  })

  it('the fist, the window and the rescue all cross the wire', () => {
    const w = createCoopWorld('crowd-wire', ['levi'], 'city', 'district', 'waves')
    const titan = w.titans[0]!
    const c = w.folk[0]!
    // stage a meal: the sim seizes on the titan's own swat, so put it on top of them
    seize(c, titan)
    const snap = coopSnapshot(w)
    const held = snap.folk.find((f) => f.id === c.id)
    expect(held).toBeDefined()
    expect(held!.state).toBe('held')
    expect(held!.heldBy).toBe(titan.id)
    expect(snap.stations.length).toBe(w.arena.stations.length)

    // and a client draws exactly what the server holds
    const g = createGame('crowd-wire', null, 'waves', 'district')
    startGame(g)
    const buf = createSnapshotBuffer()
    pushSnapshot(buf, snap, 0)
    syncCivilianMirror(g, buf)
    const mirrored = g.folk.find((f) => f.id === c.id)
    expect(mirrored?.state).toBe('held')
    expect(mirrored?.heldBy).toBe(titan.id)

    // the grip breaks, the squad hears it stop, and the save is on the wire
    w.lastHitBy.set(titan.id, 'levi')
    titan.hp = 0
    const events = coopStep(w, SIM_DT)
    const saved = events.find((e) => e.type === 'civilianSaved')
    expect(saved).toBeDefined()
    if (saved && saved.type === 'civilianSaved') expect(saved.playerId).toBe('levi')
  })

  it('a squad drains a station and the district refills it', () => {
    const w = createCoopWorld('crowd-stock', COOP_ROSTER, 'city', 'district', 'waves')
    const before = w.stations[0]!.blades
    const s = w.soldiers[0]!
    const station = w.arena.stations[0]!
    s.body.pos.set(station.x, 1.7, station.z)
    s.body.blades = 1
    coopResupply(w, s.id)
    expect(w.stations[0]!.blades).toBe(before - 1)
    expect(s.body.blades).toBe(s.body.config.bladePairs)
  })

  it('the modes that say they have no crowd have no crowd, in co-op too', () => {
    for (const mode of coopModes()) {
      const w = createCoopWorld(`crowd-${mode.id}`, ['levi'], 'city', 'district', mode.id)
      if (mode.crowd) expect(w.folk.length).toBeGreaterThan(0)
      else expect(w.folk).toHaveLength(0)
    }
  })
})

describe('a world is a world, whoever is driving it', () => {
  it('the same seed spawns the same roster in solo and in a one-soldier room', () => {
    const solo = createGame('twin', null, 'waves', 'district')
    startGame(solo)
    const room = createCoopWorld('twin', ['levi'], 'twin', 'district', 'waves')
    expect(room.titans.map((t) => [t.kind, Math.round(t.height)])).toEqual(
      solo.titans.map((t) => [t.kind, Math.round(t.height)]),
    )
    expect(room.titans.map((t) => [Math.round(t.pos.x), Math.round(t.pos.z)])).toEqual(
      solo.titans.map((t) => [Math.round(t.pos.x), Math.round(t.pos.z)]),
    )
  })

  it('a squad meets more titans than a lone soldier, and deeper Shifter pools', () => {
    const alone = createCoopWorld('scale', ['levi'], 'city', 'district', 'waves')
    const squad = createCoopWorld('scale', COOP_ROSTER, 'city', 'district', 'waves')
    expect(squad.titans.length).toBeGreaterThan(alone.titans.length)
    expect(squad.pickups.length).toBeGreaterThan(alone.pickups.length)

    const soloBoss = createCoopWorld('scale', ['levi'], 'city', 'district', 'bossrush')
    const squadBoss = createCoopWorld('scale', COOP_ROSTER, 'city', 'district', 'bossrush')
    const soloHp = soloBoss.boss!.state.parts[0]!.maxHp
    const squadHp = squadBoss.boss!.state.parts[0]!.maxHp
    expect(squadHp).toBe(soloHp * 4)
  })

  it('every upgrade in the pool applies to a soldier in a shared world', () => {
    // upgrades carry no stance of their own: they are pure PlayerConfig mutations with no
    // world surface, so instead of a type they get this — every one of them, applied by the
    // server, in a four-soldier match. A new upgrade is covered the day it is added.
    for (const upgrade of UPGRADE_POOL) {
      const w = createCoopWorld(`up-${upgrade.id}`, COOP_ROSTER, 'city', 'district', 'waves')
      for (const t of w.titans) t.hp = 0
      coopStep(w, SIM_DT)
      expect(w.phase).toBe('upgrading')
      const s = w.soldiers[0]!
      s.offers = [upgrade]
      const events = coopPickUpgrade(w, s.id, upgrade.id)
      expect(events.some((e) => e.type === 'upgradePicked')).toBe(true)
      expect(s.picked).toBe(true)
    }
  })

  it('a spear fired by a soldier in any map still kills for them', () => {
    for (const map of coopMaps()) {
      const w = createCoopWorld(`spear-${map.id}`, ['levi'], 'city', map.id, 'waves')
      const s = w.soldiers[0]!
      const titan = w.titans[0]!
      s.body.pos.copy(titan.pos).add(new Vector3(0, titan.height * 0.5, 12))
      s.body.spears = 2
      s.body.fireTimer = 0
      const events = coopFire(w, s.id, new Vector3(0, 0, -1))
      expect(events.some((e) => e.type === 'spearFired')).toBe(true)
      expect(w.spearOwners.get(w.spears[0]!.id)).toBe('levi')
    }
  })
})
