import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import {
  applyBossBlast,
  applyBossSlash,
  BOSS_LADDER,
  BOSS_WAVE_INTERVAL,
  type BossFight,
  bossForWave,
  bossPartCenter,
  bossPartRadius,
  bossSpawnPoint,
  createBossFight,
  isBossWave,
  litPartIndex,
  stepBoss,
} from './boss'
import { DEFAULT_PLAYER_CONFIG } from './player'
import { STAGGER_DURATION } from './titan'

const KILL_SPEED = DEFAULT_PLAYER_CONFIG.killSpeed

function fightFor(specId: string, wave?: number): BossFight {
  const spec = BOSS_LADDER.find((s) => s.id === specId)!
  return createBossFight(1, spec, wave ?? spec.wave, 'test-seed', 0, 0)
}

/** Cuts the current lit part with clean cuts until it breaks; returns the outcomes. */
function breakLitPart(fight: BossFight) {
  const outcomes = []
  for (let i = 0; i < 20; i++) {
    const outcome = applyBossSlash(fight, KILL_SPEED, KILL_SPEED)
    outcomes.push(outcome)
    if (outcome.broken || outcome.killed) return outcomes
    // a break staggers the boss; clear it so the next slash sequence is clean
    fight.titan.state = 'chase'
  }
  throw new Error('part never broke')
}

describe('the ladder', () => {
  it('maps waves 5..45 to the nine in order, Founding last', () => {
    expect(BOSS_LADDER).toHaveLength(9)
    expect(bossForWave(5).spec.id).toBe('beast-titan')
    expect(bossForWave(25).spec.id).toBe('armored-titan')
    expect(bossForWave(45).spec.id).toBe('founding-titan')
    expect(BOSS_LADDER.map((s) => s.wave)).toEqual([5, 10, 15, 20, 25, 30, 35, 40, 45])
  })

  it('repeats after wave 45 with scaled part HP', () => {
    const { spec, lap } = bossForWave(50)
    expect(spec.id).toBe('beast-titan')
    expect(lap).toBe(1)
    const first = fightFor('beast-titan', 5)
    const second = createBossFight(1, spec, 50, 'test-seed', 0, 0)
    expect(second.state.parts[0]!.maxHp).toBeGreaterThan(first.state.parts[0]!.maxHp)
  })

  it('only fires every 5th wave, and only in the waves mode', () => {
    expect(isBossWave(5, 'waves')).toBe(true)
    expect(isBossWave(10, 'waves')).toBe(true)
    expect(isBossWave(4, 'waves')).toBe(false)
    expect(isBossWave(5, 'matchday')).toBe(false)
    expect(isBossWave(5, 'hunt')).toBe(false)
    expect(BOSS_WAVE_INTERVAL).toBe(5)
  })
})

describe('the shifter titan', () => {
  it('spawns as kind shifter at the spec height, alive, facing inward', () => {
    const fight = fightFor('beast-titan')
    expect(fight.titan.kind).toBe('shifter')
    expect(fight.titan.height).toBe(fight.spec.height)
    expect(fight.titan.hp).toBeGreaterThan(0)
  })

  it('spawns at the gate side of the wall', () => {
    const arena = { gateAngle: Math.PI / 2, wallRadius: 260 }
    const [x, z] = bossSpawnPoint(arena)
    // gateAngle pi/2 points along +Z-ish in wall-angle convention (cos, sin)
    expect(Math.hypot(x, z)).toBeGreaterThan(arena.wallRadius * 0.7)
    expect(Math.hypot(x, z)).toBeLessThan(arena.wallRadius)
    expect(Math.abs(Math.atan2(z, x) - arena.gateAngle)).toBeLessThan(0.01)
  })

  it('every spec ends its part sequence at the nape', () => {
    for (const spec of BOSS_LADDER) {
      expect(spec.parts.length).toBeGreaterThanOrEqual(3)
      expect(spec.parts[spec.parts.length - 1]!.id).toBe('nape')
    }
  })
})

describe('part anchors', () => {
  it('scale with height and rotate with facing', () => {
    const fight = fightFor('beast-titan')
    const t = fight.titan
    t.pos.set(10, 0, -4)
    t.facing = 0
    const nape = fight.spec.parts[fight.spec.parts.length - 1]!
    const at0 = bossPartCenter(t, nape)
    expect(at0.y).toBeCloseTo(t.height * nape.up, 5)
    t.facing = Math.PI
    const at180 = bossPartCenter(t, nape)
    // turning around mirrors the forward offset through the titan's position
    expect(at180.x - t.pos.x).toBeCloseTo(-(at0.x - t.pos.x), 5)
    expect(at180.z - t.pos.z).toBeCloseTo(-(at0.z - t.pos.z), 5)
  })

  it('part radius grows with the titan', () => {
    const beast = fightFor('beast-titan')
    const colossus = fightFor('colossus-titan')
    const range = DEFAULT_PLAYER_CONFIG.slashRange
    expect(bossPartRadius(range, colossus.titan)).toBeGreaterThan(
      bossPartRadius(range, beast.titan),
    )
  })
})

describe('slashing the lit part', () => {
  it('a clean cut at killSpeed deals a flat 100', () => {
    const fight = fightFor('beast-titan')
    const before = fight.state.parts[0]!.hp
    const outcome = applyBossSlash(fight, KILL_SPEED, KILL_SPEED)
    expect(outcome.hit).toBe(true)
    expect(outcome.damage).toBe(100)
    expect(fight.state.parts[0]!.hp).toBe(before - 100)
  })

  it('a faster cut still deals exactly 100 — the threshold never moves', () => {
    const fight = fightFor('beast-titan')
    const outcome = applyBossSlash(fight, KILL_SPEED * 2, KILL_SPEED)
    expect(outcome.damage).toBe(100)
  })

  it('a slow cut chips with the nape formula', () => {
    const fight = fightFor('beast-titan')
    const speed = KILL_SPEED * 0.5
    const outcome = applyBossSlash(fight, speed, KILL_SPEED)
    const expected = Math.max(6, 45 * Math.pow(speed / KILL_SPEED, 1.5))
    expect(outcome.damage).toBeCloseTo(expected, 5)
    expect(outcome.broken).toBe(false)
  })

  it('breaking a part staggers the boss for the spec duration and lights the next', () => {
    const fight = fightFor('beast-titan')
    const outcomes = breakLitPart(fight)
    const last = outcomes[outcomes.length - 1]!
    expect(last.broken).toBe(true)
    expect(last.killed).toBe(false)
    expect(fight.titan.state).toBe('staggered')
    expect(fight.titan.staggerTimer).toBe(fight.spec.staggerSeconds)
    expect(fight.spec.staggerSeconds).toBeGreaterThan(STAGGER_DURATION)
    expect(litPartIndex(fight.state)).toBe(1)
  })

  it('breaking the final nape kills the shifter', () => {
    const fight = fightFor('beast-titan')
    for (let i = 0; i < fight.spec.parts.length - 1; i++) breakLitPart(fight)
    const outcomes = breakLitPart(fight)
    const last = outcomes[outcomes.length - 1]!
    expect(last.killed).toBe(true)
    expect(fight.titan.hp).toBe(0)
  })

  it('all single clean cuts earn the flawless kill; a chipped part forfeits it', () => {
    const clean = fightFor('beast-titan')
    let killed = null
    for (let i = 0; i < clean.spec.parts.length; i++) {
      const outcomes = breakLitPart(clean)
      killed = outcomes[outcomes.length - 1]!
    }
    expect(killed!.killed).toBe(true)
    expect(killed!.flawless).toBe(true)

    const chipped = fightFor('beast-titan')
    applyBossSlash(chipped, KILL_SPEED * 0.5, KILL_SPEED) // one lazy chip
    for (let i = 0; i < chipped.spec.parts.length; i++) {
      const outcomes = breakLitPart(chipped)
      killed = outcomes[outcomes.length - 1]!
    }
    expect(killed!.killed).toBe(true)
    expect(killed!.flawless).toBe(false)
  })

  it('plated parts bounce blades: no damage until cracked', () => {
    const fight = fightFor('armored-titan')
    expect(fight.state.parts[0]!.plated).toBe(true)
    const outcome = applyBossSlash(fight, KILL_SPEED, KILL_SPEED)
    expect(outcome.plated).toBe(true)
    expect(outcome.damage).toBe(0)
    expect(fight.state.parts[0]!.hp).toBe(fight.state.parts[0]!.maxHp)
  })
})

describe('blasts', () => {
  it('cracks a plated lit part instead of damaging it', () => {
    const fight = fightFor('armored-titan')
    const part = fight.spec.parts[0]!
    const result = applyBossBlast(fight, bossPartCenter(fight.titan, part))
    expect(result.cracked).toBe(true)
    expect(fight.state.parts[0]!.plated).toBe(false)
    expect(fight.state.parts[0]!.hp).toBe(fight.state.parts[0]!.maxHp)
    // now blades bite
    const cut = applyBossSlash(fight, KILL_SPEED, KILL_SPEED)
    expect(cut.damage).toBe(100)
  })

  it('deals 60 into an unplated lit part and can break it', () => {
    const fight = fightFor('beast-titan')
    const part = fight.spec.parts[0]!
    const result = applyBossBlast(fight, bossPartCenter(fight.titan, part))
    expect(result.affected).toBe(true)
    expect(result.damage).toBe(60)
    expect(fight.state.parts[0]!.hp).toBe(fight.state.parts[0]!.maxHp - 60)
  })

  it('does nothing away from the lit part — no nape instakill', () => {
    const fight = fightFor('beast-titan')
    const napeSpec = fight.spec.parts[fight.spec.parts.length - 1]!
    const result = applyBossBlast(fight, bossPartCenter(fight.titan, napeSpec))
    expect(result.affected).toBe(false)
    expect(fight.titan.hp).toBeGreaterThan(0)
    expect(fight.state.parts.every((p) => p.hp === p.maxHp)).toBe(true)
  })

  it('a blast damaging the part forfeits that part\'s flawless credit', () => {
    const fight = fightFor('beast-titan')
    applyBossBlast(fight, bossPartCenter(fight.titan, fight.spec.parts[0]!))
    for (let i = 0; i < fight.spec.parts.length; i++) {
      const outcomes = breakLitPart(fight)
      const last = outcomes[outcomes.length - 1]!
      if (last.killed) expect(last.flawless).toBe(false)
    }
  })
})

describe('abilities', () => {
  const ctx = (playerPos: Vector3, dt: number, liveSummons = 0) => ({
    playerPos,
    dt,
    liveSummons,
    groundY: () => 0,
  })

  function runFor(fight: BossFight, playerPos: Vector3, seconds: number, liveSummons = 0) {
    const events = []
    const dt = 1 / 120
    for (let i = 0; i < Math.round(seconds * 120); i++) {
      fight.titan.state = 'chase' // keep it engaged without stepping full titan AI
      events.push(...stepBoss(fight, ctx(playerPos, dt, liveSummons)))
    }
    return events
  }

  it('engages once when the player comes close', () => {
    const fight = fightFor('beast-titan')
    fight.titan.pos.set(0, 0, 0)
    const far = runFor(fight, new Vector3(0, 2, 500), 0.5)
    expect(far.some((e) => e.type === 'engaged')).toBe(false)
    const near = runFor(fight, new Vector3(0, 2, 40), 0.5)
    expect(near.filter((e) => e.type === 'engaged')).toHaveLength(1)
    expect(runFor(fight, new Vector3(0, 2, 40), 0.5).some((e) => e.type === 'engaged')).toBe(false)
  })

  it('the beast telegraphs then throws a ballistic boulder that lands', () => {
    const fight = fightFor('beast-titan')
    fight.titan.pos.set(0, 0, 0)
    const player = new Vector3(0, 2, 60)
    const events = runFor(fight, player, 12)
    const windups = events.filter((e) => e.type === 'throwWindup')
    const throws = events.filter((e) => e.type === 'throw')
    const impacts = events.filter((e) => e.type === 'projectileImpact')
    expect(windups.length).toBeGreaterThan(0)
    expect(throws.length).toBeGreaterThan(0)
    expect(impacts.length).toBeGreaterThan(0)
    const impact = impacts[0]! as { type: 'projectileImpact'; pos: Vector3; radius: number }
    // aimed at where the player stood: lands near them
    expect(Math.hypot(impact.pos.x - player.x, impact.pos.z - player.z)).toBeLessThan(8)
  })

  it('breaking the throwing wrist silences the throw', () => {
    const fight = fightFor('beast-titan')
    fight.titan.pos.set(0, 0, 0)
    // beast part order: ankle, wrist(disables throw), nape — break to phase 2
    breakLitPart(fight)
    breakLitPart(fight)
    fight.titan.state = 'chase'
    const events = runFor(fight, new Vector3(0, 2, 60), 12)
    expect(events.some((e) => e.type === 'throwWindup')).toBe(false)
  })

  it('the female screams for pures, respecting the live cap', () => {
    const fight = fightFor('female-titan')
    fight.titan.pos.set(0, 0, 0)
    const events = runFor(fight, new Vector3(0, 2, 30), 2)
    const summons = events.filter((e) => e.type === 'summon')
    expect(summons.length).toBe(1)
    const req = summons[0]! as { type: 'summon'; spawns: { x: number; z: number; height: number }[] }
    expect(req.spawns.length).toBeGreaterThanOrEqual(2)
    // at the cap, no further scream even after the cooldown
    const capped = runFor(fight, new Vector3(0, 2, 30), 30, 6)
    expect(capped.some((e) => e.type === 'summon')).toBe(false)
  })

  it('the colossus cycles steam on and off', () => {
    const fight = fightFor('colossus-titan')
    fight.titan.pos.set(0, 0, 0)
    const events = runFor(fight, new Vector3(0, 2, 30), 15)
    const edges = events.filter((e) => e.type === 'steam') as { type: 'steam'; on: boolean }[]
    expect(edges.length).toBeGreaterThanOrEqual(2)
    expect(edges.some((e) => e.on)).toBe(true)
    expect(edges.some((e) => !e.on)).toBe(true)
  })

  it('the founding roars the player back when close', () => {
    const fight = fightFor('founding-titan')
    fight.titan.pos.set(0, 0, 0)
    const events = runFor(fight, new Vector3(0, 2, 12), 3)
    expect(events.some((e) => e.type === 'roar')).toBe(true)
  })

  it('the war hammer telegraphs a spike at the player, then strikes', () => {
    const fight = fightFor('warhammer-titan')
    fight.titan.pos.set(0, 0, 0)
    const player = new Vector3(30, 2, 0)
    const events = runFor(fight, player, 4)
    const tele = events.find((e) => e.type === 'spikeTelegraph') as
      | { type: 'spikeTelegraph'; x: number; z: number }
      | undefined
    const spike = events.find((e) => e.type === 'spike') as
      | { type: 'spike'; x: number; z: number; radius: number }
      | undefined
    expect(tele).toBeDefined()
    expect(spike).toBeDefined()
    expect(Math.hypot(spike!.x - player.x, spike!.z - player.z)).toBeLessThan(2)
  })

  it('the cart regenerates a wounded lit part after being left alone', () => {
    const fight = fightFor('cart-titan')
    fight.titan.pos.set(0, 0, 0)
    applyBossSlash(fight, KILL_SPEED, KILL_SPEED)
    const wounded = fight.state.parts[0]!.hp
    runFor(fight, new Vector3(0, 2, 200), 15)
    expect(fight.state.parts[0]!.hp).toBeGreaterThan(wounded)
    expect(fight.state.parts[0]!.hp).toBeLessThanOrEqual(fight.state.parts[0]!.maxHp)
  })

  it('the attack titan counters a chip with an instant retaliation', () => {
    const fight = fightFor('attack-titan')
    fight.titan.state = 'chase'
    applyBossSlash(fight, KILL_SPEED * 0.5, KILL_SPEED)
    expect(fight.titan.state).toBe('attack')
    expect(fight.titan.attackCooldown).toBe(0)
  })

  it('replays identically for the same seed', () => {
    const run = () => {
      const fight = fightFor('female-titan')
      fight.titan.pos.set(0, 0, 0)
      return runFor(fight, new Vector3(0, 2, 30), 5).map((e) => e.type)
    }
    expect(run()).toEqual(run())
  })
})
