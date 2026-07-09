import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import {
  CHASERS_PER_PLAYER,
  type CoopEvent,
  type CoopWorld,
  applyPlayerUpdate,
  coopPickUpgrade,
  coopResupply,
  coopSlash,
  coopSnapshot,
  coopStep,
  createCoopWorld,
  removePlayer,
} from './coop'
import { SIM_DT } from './constants'
import { createRng, hashSeed } from './rng'
import { napeCenter } from './titan'
import { waveComposition } from './waves'

const TICKS_PER_SEC = Math.round(1 / SIM_DT)

function stepSeconds(w: ReturnType<typeof createCoopWorld>, seconds: number) {
  const events = []
  for (let i = 0; i < seconds * TICKS_PER_SEC; i++) events.push(...coopStep(w, SIM_DT))
  return events
}

describe('createCoopWorld', () => {
  it('is deterministic: same seed and roster produce identical worlds', () => {
    const a = createCoopWorld('trost', ['erwin', 'hange'])
    const b = createCoopWorld('trost', ['erwin', 'hange'])
    expect(coopSnapshot(a)).toEqual(coopSnapshot(b))
  })

  it('scales the first wave with player count (~75% more titans per extra player)', () => {
    const solo = createCoopWorld('trost', ['erwin'])
    const quad = createCoopWorld('trost', ['erwin', 'hange', 'levi', 'mikasa'])
    const base = solo.titans.length
    expect(quad.titans.length).toBe(Math.round(base * (1 + 0.75 * 3)))
  })

  it('keeps waveComposition backwards compatible when countScale is omitted', () => {
    const spawnsA = waveComposition(3, createRng(hashSeed('x')))
    const spawnsB = waveComposition(3, createRng(hashSeed('x')), 1)
    expect(spawnsA).toEqual(spawnsB)
  })

  it('spawns every player alive at the muster point with a personal score', () => {
    const w = createCoopWorld('trost', ['erwin', 'hange'])
    for (const player of w.players.values()) {
      expect(player.alive).toBe(true)
      expect(player.score.score).toBe(0)
      expect(player.body.hp).toBe(player.body.config.maxHp)
    }
  })
})

describe('titan targeting', () => {
  it('chases the nearest player, not the roster head', () => {
    const w = createCoopWorld('trost', ['far', 'near'])
    const titan = w.titans[0]!
    // controlled scene: the tested titan north of the plaza, everyone else in a far corner
    for (const t of w.titans) if (t !== titan) t.pos.set(150, 0, 150)
    titan.pos.set(0, 0, 60)
    const near = new Vector3(0, 2, 20)
    applyPlayerUpdate(w, 'far', { pos: new Vector3(0, 2, -100), vel: new Vector3(), onGround: true })
    applyPlayerUpdate(w, 'near', { pos: near, vel: new Vector3(), onGround: true })
    const before = Math.hypot(titan.pos.x - near.x, titan.pos.z - near.z)
    stepSeconds(w, 3)
    const after = Math.hypot(titan.pos.x - near.x, titan.pos.z - near.z)
    expect(after).toBeLessThan(before - 3) // real approach toward 'near', not drift
  })

  it('caps chasers per hunted player', () => {
    const w = createCoopWorld('wall-rose', ['erwin', 'hange'])
    // pile every titan right next to erwin, far from hange
    for (const t of w.titans) {
      t.pos.set(60 + (t.id % 7) * 4, 0, 60 + (t.id % 5) * 4)
    }
    applyPlayerUpdate(w, 'erwin', { pos: new Vector3(75, 2, 61), vel: new Vector3(), onGround: true })
    applyPlayerUpdate(w, 'hange', { pos: new Vector3(-110, 2, -110), vel: new Vector3(), onGround: true })
    stepSeconds(w, 1)
    const chasing = w.titans.filter((t) => t.state === 'chase' || t.state === 'attack' || t.state === 'leap')
    expect(chasing.length).toBeGreaterThan(0)
    expect(chasing.length).toBeLessThanOrEqual(CHASERS_PER_PLAYER)
  })
})

function byType(events: CoopEvent[], type: CoopEvent['type']) {
  return events.filter((e) => e.type === type)
}

describe('coopSlash', () => {
  it('credits a nape kill to the slashing player only, with a heart back', () => {
    const w = createCoopWorld('trost', ['levi', 'armin'])
    const titan = w.titans[0]!
    const levi = w.players.get('levi')!
    levi.body.hp = 3
    applyPlayerUpdate(w, 'levi', { pos: napeCenter(titan), vel: new Vector3(30, 0, 0), onGround: false })
    const events = coopSlash(w, 'levi')
    const kills = byType(events, 'kill')
    expect(kills).toHaveLength(1)
    expect(kills[0]).toMatchObject({ playerId: 'levi', titanId: titan.id, oneCut: true, heartGained: true })
    expect(titan.hp).toBe(0)
    expect(levi.body.hp).toBe(4)
    expect(levi.score.kills).toBe(1)
    expect(levi.score.score).toBeGreaterThan(0)
    expect(w.players.get('armin')!.score.score).toBe(0)
  })

  it('lag compensation: a slash lands where the client saw the titan, not where it is now', () => {
    const setup = (seed: string) => {
      const w = createCoopWorld(seed, ['levi'])
      // park levi far away so titans just wander while history accumulates
      applyPlayerUpdate(w, 'levi', { pos: new Vector3(-150, 2, -150), vel: new Vector3(), onGround: true })
      stepSeconds(w, 0.5)
      const titan = w.titans[0]!
      const seen = napeCenter(titan).clone() // where the client last saw the nape
      titan.pos.x += 14 // titan teleports ahead of the report
      applyPlayerUpdate(w, 'levi', { pos: seen, vel: new Vector3(30, 0, 0), onGround: false })
      return { w, titan }
    }
    const rewound = setup('maria')
    expect(byType(coopSlash(rewound.w, 'levi'), 'kill')).toHaveLength(1)
    expect(rewound.titan.hp).toBe(0)
    // titan pose is restored after validation: only hp sticks
    expect(rewound.titan.pos.x).toBeGreaterThan(rewound.w.history.get(rewound.titan.id)!.at(-1)!.pos.x + 10)

    const raw = setup('maria')
    expect(byType(coopSlash(raw.w, 'levi', 0), 'kill')).toHaveLength(0)
    expect(raw.titan.hp).toBe(raw.titan.maxHp)
  })

  it('ignores slashes from dead players and outside the playing phase', () => {
    const w = createCoopWorld('trost', ['levi'])
    const titan = w.titans[0]!
    const levi = w.players.get('levi')!
    applyPlayerUpdate(w, 'levi', { pos: napeCenter(titan), vel: new Vector3(30, 0, 0), onGround: false })
    levi.alive = false
    expect(coopSlash(w, 'levi')).toHaveLength(0)
    expect(titan.hp).toBe(titan.maxHp)
  })
})

describe('swats', () => {
  function stageSwat(w: CoopWorld, titanIndex = 0) {
    const titan = w.titans[titanIndex]!
    titan.state = 'attack'
    titan.stateTime = 0.449
    return titan
  }

  it('hits every soldier in the blast radius; lethal hits kill', () => {
    const w = createCoopWorld('trost', ['eren', 'sasha'])
    const titan = stageSwat(w)
    const near = titan.pos.clone().add(new Vector3(0, 2, 0))
    applyPlayerUpdate(w, 'eren', { pos: near, vel: new Vector3(), onGround: true })
    applyPlayerUpdate(w, 'sasha', { pos: near, vel: new Vector3(), onGround: true })
    w.players.get('sasha')!.body.hp = 1
    // move every other titan away so only the staged swat can interact
    for (const t of w.titans) if (t !== titan) t.pos.set(-150, 0, -150)
    const events = coopStep(w, SIM_DT)
    const hits = byType(events, 'playerHit')
    expect(hits.length).toBeGreaterThanOrEqual(1)
    const died = byType(events, 'playerDied')
    expect(died).toHaveLength(1)
    expect(died[0]).toMatchObject({ playerId: 'sasha' })
    expect(w.players.get('sasha')!.alive).toBe(false)
    expect(w.players.get('sasha')!.deaths).toBe(1)
  })

  it('team wipe ends the match with ranked results and an MVP', () => {
    const w = createCoopWorld('trost', ['eren', 'sasha'])
    const titan = stageSwat(w)
    const near = titan.pos.clone().add(new Vector3(0, 2, 0))
    applyPlayerUpdate(w, 'eren', { pos: near, vel: new Vector3(), onGround: true })
    applyPlayerUpdate(w, 'sasha', { pos: near, vel: new Vector3(), onGround: true })
    for (const p of w.players.values()) p.body.hp = 1
    w.players.get('sasha')!.score.score = 900
    w.players.get('eren')!.score.score = 400
    for (const t of w.titans) if (t !== titan) t.pos.set(-150, 0, -150)
    const events = coopStep(w, SIM_DT)
    const wipe = byType(events, 'teamWipe')
    expect(wipe).toHaveLength(1)
    expect(w.phase).toBe('ended')
    const results = w.results!
    expect(results.wavesCleared).toBe(0)
    expect(results.players.map((p) => p.id)).toEqual(['sasha', 'eren'])
    expect(results.players[0]!.mvp).toBe(true)
    expect(results.players[1]!.mvp).toBe(false)
    expect(coopStep(w, SIM_DT)).toHaveLength(0) // ended worlds are inert
  })
})

describe('wave cycle', () => {
  function clearWave(w: CoopWorld) {
    for (const t of w.titans) t.hp = 0
    return coopStep(w, SIM_DT)
  }

  it('wave clear pays the bonus, deals personal offers, and respawns the dead', () => {
    const w = createCoopWorld('trost', ['erwin', 'hange'])
    const hange = w.players.get('hange')!
    hange.alive = false
    hange.body.hp = 0
    const events = clearWave(w)
    expect(byType(events, 'waveClear')).toHaveLength(1)
    expect(w.phase).toBe('upgrading')
    expect(byType(events, 'offers')).toHaveLength(2)
    expect(byType(events, 'respawn')).toHaveLength(1)
    expect(hange.alive).toBe(true)
    expect(hange.body.hp).toBe(hange.body.config.maxHp)
    for (const p of w.players.values()) {
      expect(p.score.score).toBe(250)
      expect(p.offers).toHaveLength(3)
    }
    // offers are deterministic per player and seed
    const again = createCoopWorld('trost', ['erwin', 'hange'])
    clearWave(again)
    expect(again.players.get('erwin')!.offers.map((u) => u.id)).toEqual(
      w.players.get('erwin')!.offers.map((u) => u.id),
    )
  })

  it('next wave starts when everyone picks; picks apply to the server body', () => {
    const w = createCoopWorld('trost', ['erwin', 'hange'])
    clearWave(w)
    const erwin = w.players.get('erwin')!
    const pickId = erwin.offers[0]!.id
    const events1 = coopPickUpgrade(w, 'erwin', pickId)
    expect(byType(events1, 'upgradePicked')).toHaveLength(1)
    expect(w.phase).toBe('upgrading') // hange has not picked yet
    const events2 = coopPickUpgrade(w, 'hange', w.players.get('hange')!.offers[0]!.id)
    expect(byType(events2, 'waveStart')).toHaveLength(1)
    expect(w.wave).toBe(2)
    expect(w.phase).toBe('playing')
    expect(w.titans.length).toBeGreaterThan(0)
    expect(w.titans.every((t) => t.hp > 0)).toBe(true)
  })

  it('the pick timer auto-picks for stragglers', () => {
    const w = createCoopWorld('trost', ['erwin', 'hange'])
    clearWave(w)
    coopPickUpgrade(w, 'erwin', w.players.get('erwin')!.offers[0]!.id)
    const events = stepSeconds(w, 16)
    expect(events.some((e) => e.type === 'upgradePicked' && e.auto && e.playerId === 'hange')).toBe(true)
    expect(events.some((e) => e.type === 'waveStart')).toBe(true)
    expect(w.wave).toBe(2)
  })

  it('rejects picks that were not offered', () => {
    const w = createCoopWorld('trost', ['erwin'])
    clearWave(w)
    const offered = new Set(w.players.get('erwin')!.offers.map((u) => u.id))
    const bogus = ['gas-tank', 'sharp-blades', 'long-cables', 'fast-reel', 'extra-blades'].find(
      (id) => !offered.has(id),
    )!
    expect(coopPickUpgrade(w, 'erwin', bogus)).toHaveLength(0)
    expect(w.phase).toBe('upgrading')
  })
})

describe('leaving and housekeeping', () => {
  it('a leaver during the intermission stops blocking the next wave', () => {
    const w = createCoopWorld('trost', ['erwin', 'hange'])
    for (const t of w.titans) t.hp = 0
    coopStep(w, SIM_DT)
    coopPickUpgrade(w, 'erwin', w.players.get('erwin')!.offers[0]!.id)
    const events = removePlayer(w, 'hange')
    expect(byType(events, 'waveStart')).toHaveLength(1)
    expect(w.wave).toBe(2)
  })

  it('when the last living soldier leaves, the match ends for the dead one watching', () => {
    const w = createCoopWorld('trost', ['erwin', 'hange'])
    const hange = w.players.get('hange')!
    hange.alive = false
    hange.body.hp = 0
    hange.deaths = 1
    const events = removePlayer(w, 'erwin')
    expect(byType(events, 'teamWipe')).toHaveLength(1)
    expect(w.results!.players.map((p) => p.id)).toContain('erwin')
    expect(w.results!.players.map((p) => p.id)).toContain('hange')
  })

  it('resupply refills at the station and nowhere else', () => {
    const w = createCoopWorld('trost', ['erwin'])
    const erwin = w.players.get('erwin')!
    erwin.body.blades = 0
    erwin.body.bladeHp = 0
    applyPlayerUpdate(w, 'erwin', { pos: new Vector3(120, 2, 0), vel: new Vector3(), onGround: true })
    expect(coopResupply(w, 'erwin')).toHaveLength(0)
    applyPlayerUpdate(w, 'erwin', {
      pos: new Vector3(w.arena.station.x, 2, w.arena.station.z),
      vel: new Vector3(),
      onGround: true,
    })
    const events = coopResupply(w, 'erwin')
    expect(byType(events, 'resupply')).toHaveLength(1)
    expect(erwin.body.blades).toBe(erwin.body.config.bladePairs)
  })

  it('clamps insane player reports instead of trusting them', () => {
    const w = createCoopWorld('trost', ['erwin'])
    applyPlayerUpdate(w, 'erwin', {
      pos: new Vector3(5000, -50, 5000),
      vel: new Vector3(500, 0, 0),
      onGround: false,
    })
    const body = w.players.get('erwin')!.body
    expect(Math.hypot(body.pos.x, body.pos.z)).toBeLessThanOrEqual(w.arena.wallRadius + 60 + 1e-6)
    expect(body.pos.y).toBe(0)
    expect(body.vel.length()).toBeLessThanOrEqual(60 + 1e-6)
  })

  it('two identically driven worlds stay bit-for-bit identical', () => {
    const drive = (w: CoopWorld) => {
      applyPlayerUpdate(w, 'a', { pos: new Vector3(10, 30, 10), vel: new Vector3(5, 0, 5), onGround: false })
      applyPlayerUpdate(w, 'b', { pos: new Vector3(-20, 2, 40), vel: new Vector3(), onGround: true })
      stepSeconds(w, 5)
      return coopSnapshot(w)
    }
    expect(drive(createCoopWorld('sina', ['a', 'b']))).toEqual(drive(createCoopWorld('sina', ['a', 'b'])))
  })
})
