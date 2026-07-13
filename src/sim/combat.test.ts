import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import {
  ankleHitRadius,
  bodyHitRadius,
  napeHitRadius,
  SLASH_BUFFER_S,
  stepSlashBuffer,
  trySlash,
} from './combat'
import { BOSS_LADDER, bossPartCenter, createBossFight } from './boss'
import { createPlayer } from './player'
import { anklePos, bodyCenter, createTitan, napeCenter } from './titan'

const DT = 1 / 120

function setup(speed: number, height = 15) {
  const p = createPlayer()
  const t = createTitan({ id: 1, kind: 'normal', height, x: 0, z: 0 })
  t.facing = 0 // deterministic nape side (spawning at the origin yields atan2(-0,-0) = -π)
  p.pos.copy(napeCenter(t))
  p.vel.set(speed, 0, 0)
  p.onGround = false
  return { p, t }
}

/** Aim from wherever the player stands toward a world point. */
function aimAt(p: { pos: Vector3 }, point: Vector3): Vector3 {
  const dir = point.clone().sub(p.pos)
  return dir.lengthSq() > 0 ? dir.normalize() : new Vector3(0, 0, -1)
}

describe('trySlash', () => {
  it('one-cuts the nape at or above kill speed', () => {
    const { p, t } = setup(25) // killSpeed default 17
    const result = trySlash(p, [t], aimAt(p, napeCenter(t)))
    expect(result.hit).toBe(true)
    expect(result.napeHit).toBe(true)
    expect(result.killed).toBe(true)
    expect(t.hp).toBe(0)
  })

  it('has a generous nape hitbox: a kill lands from 7m off the nape center', () => {
    const { p, t } = setup(25)
    p.pos.copy(napeCenter(t))
    p.pos.y += 7
    const result = trySlash(p, [t], aimAt(p, napeCenter(t)))
    expect(result.napeHit).toBe(true)
    expect(result.killed).toBe(true)
  })

  it('chips the nape below kill speed without killing', () => {
    const { p, t } = setup(10)
    const result = trySlash(p, [t], aimAt(p, napeCenter(t)))
    expect(result.hit).toBe(true)
    expect(result.killed).toBe(false)
    expect(t.hp).toBeGreaterThan(0)
    expect(t.hp).toBeLessThan(t.maxHp)
  })

  it('wears the blade on every connecting slash', () => {
    const { p, t } = setup(25)
    const before = p.bladeHp
    trySlash(p, [t], aimAt(p, napeCenter(t)))
    expect(p.bladeHp).toBeLessThan(before)
  })

  it('body hits do little damage and dull the blade faster', () => {
    const { p, t } = setup(30)
    p.pos.set(0, 5, 3.2) // belly height, in front of the body, beyond the nape radius
    const napeResult = setup(30)
    const bodyWear = (() => {
      const before = p.bladeHp
      const r = trySlash(p, [t], aimAt(p, bodyCenter(t)))
      expect(r.hit).toBe(true)
      expect(r.napeHit).toBe(false)
      expect(r.killed).toBe(false)
      return before - p.bladeHp
    })()
    const napeBefore = napeResult.p.bladeHp
    trySlash(napeResult.p, [napeResult.t], aimAt(napeResult.p, napeCenter(napeResult.t)))
    expect(bodyWear).toBeGreaterThan(napeBefore - napeResult.p.bladeHp)
  })

  it('misses cleanly when nothing is in range', () => {
    const { p, t } = setup(30)
    p.pos.set(100, 5, 100)
    const before = p.bladeHp
    const result = trySlash(p, [t], aimAt(p, napeCenter(t)))
    expect(result.hit).toBe(false)
    expect(p.bladeHp).toBe(before)
  })

  it('breaks blades into the next pair, and refuses to slash with none left', () => {
    const { p, t } = setup(25)
    p.bladeHp = 1
    const pairsBefore = p.blades
    trySlash(p, [t], aimAt(p, napeCenter(t)))
    expect(p.blades).toBe(pairsBefore - 1)
    expect(p.bladeHp).toBe(p.config.bladeDurability)

    const { p: p2, t: t2 } = setup(25)
    p2.blades = 0
    p2.bladeHp = 0
    const result = trySlash(p2, [t2], aimAt(p2, napeCenter(t2)))
    expect(result.hit).toBe(false)
    expect(t2.hp).toBe(t2.maxHp)
  })

  it('slices an ankle when slashing at foot level', () => {
    const { p, t } = setup(12)
    p.pos.copy(anklePos(t, 0))
    const result = trySlash(p, [t], aimAt(p, anklePos(t, 0)))
    expect(result.hit).toBe(true)
    expect(result.ankleHit).toBe(true)
    expect(t.ankles[0]).toBe(true)
    expect(t.ankles[1]).toBe(false)
    expect(result.killed).toBe(false)
    expect(t.state).not.toBe('crippled')
  })

  it('has a forgiving ankle hitbox: the cut lands from 4m off the ankle', () => {
    const { p, t } = setup(12)
    p.pos.copy(anklePos(t, 0))
    p.pos.y += 4
    const result = trySlash(p, [t], aimAt(p, anklePos(t, 0)))
    expect(result.ankleHit).toBe(true)
    expect(t.ankles[0]).toBe(true)
  })

  it('cripples the titan when both ankles are cut', () => {
    const { p, t } = setup(12)
    p.pos.copy(anklePos(t, 0))
    trySlash(p, [t], aimAt(p, anklePos(t, 0)))
    p.slashTimer = 0
    p.pos.copy(anklePos(t, 1))
    const result = trySlash(p, [t], aimAt(p, anklePos(t, 1)))
    expect(result.ankleHit).toBe(true)
    expect(result.crippled).toBe(true)
    expect(t.state).toBe('crippled')
    expect(t.crippleTimer).toBeGreaterThan(50)
  })

  it('does not re-slice an already cut ankle', () => {
    const { p, t } = setup(12)
    p.pos.copy(anklePos(t, 0))
    trySlash(p, [t], aimAt(p, anklePos(t, 0)))
    p.slashTimer = 0
    // the radius spans both feet, so the second cut lands on the other tendon,
    // never the already-cut one
    const result = trySlash(p, [t], aimAt(p, anklePos(t, 1)))
    expect(result.ankleHit).toBe(true)
    expect(result.ankleSide).toBe(1)
  })

  it('respects the slash cooldown', () => {
    const { p, t } = setup(25)
    p.slashTimer = 0.3
    const result = trySlash(p, [t], aimAt(p, napeCenter(t)))
    expect(result.hit).toBe(false)
    expect(t.hp).toBe(t.maxHp)
  })
})

// The exported radii are what the dev hitbox overlay draws; these pin them to the exact
// boundaries trySlash judges, so the outlines can never lie.
describe('hit radii', () => {
  it('napeHitRadius is the exact nape boundary', () => {
    const { p, t } = setup(25)
    const r = napeHitRadius(p.config.slashRange, t)
    p.pos.copy(napeCenter(t)).add(new Vector3(0, r + 0.01, 0))
    expect(trySlash(p, [t], aimAt(p, napeCenter(t))).hit).toBe(false)
    p.slashTimer = 0
    p.pos.copy(napeCenter(t)).add(new Vector3(0, r - 0.01, 0))
    const result = trySlash(p, [t], aimAt(p, napeCenter(t)))
    expect(result.napeHit).toBe(true)
    expect(result.killed).toBe(true)
  })

  it('ankleHitRadius is the exact ankle boundary', () => {
    const { p, t } = setup(12)
    const r = ankleHitRadius(p.config.slashRange, t)
    // step laterally outward from the left ankle, away from every other volume
    p.pos.copy(anklePos(t, 0)).add(new Vector3(-(r + 0.01), 0, 0))
    expect(trySlash(p, [t], aimAt(p, anklePos(t, 0))).hit).toBe(false)
    p.slashTimer = 0
    p.pos.copy(anklePos(t, 0)).add(new Vector3(-(r - 0.01), 0, 0))
    const result = trySlash(p, [t], aimAt(p, anklePos(t, 0)))
    expect(result.ankleHit).toBe(true)
    expect(result.ankleSide).toBe(0)
  })

  it('bodyHitRadius is the exact body boundary', () => {
    const { p, t } = setup(30)
    const r = bodyHitRadius(p.config.slashRange, t)
    p.pos.copy(bodyCenter(t)).add(new Vector3(r + 0.01, 0, 0))
    expect(trySlash(p, [t], aimAt(p, bodyCenter(t))).hit).toBe(false)
    p.slashTimer = 0
    p.pos.copy(bodyCenter(t)).add(new Vector3(r - 0.01, 0, 0))
    const result = trySlash(p, [t], aimAt(p, bodyCenter(t)))
    expect(result.hit).toBe(true)
    expect(result.napeHit).toBe(false)
    expect(result.ankleHit).toBe(false)
  })

  it('radii scale with the titan: a small titan wears proportionally small volumes', () => {
    const small = createTitan({ id: 2, kind: 'abnormal', height: 8.5, x: 0, z: 0 })
    const big = createTitan({ id: 3, kind: 'normal', height: 15, x: 0, z: 0 })
    expect(napeHitRadius(6, small)).toBeLessThan(napeHitRadius(6, big) * 0.75)
    expect(ankleHitRadius(6, small)).toBeLessThan(ankleHitRadius(6, big))
    expect(bodyHitRadius(6, small)).toBeLessThan(bodyHitRadius(6, big))
  })
})

describe('volume resolution', () => {
  it('standing at a small titan ankle cuts the tendon, not the nape', () => {
    // regression from the 2026-07-10 overlay session: the old flat-radius nape sphere
    // contained an 8.5m titan's ankle centers, so foot-level slashes came up as nape hits
    const { p, t } = setup(12, 8.5)
    p.pos.copy(anklePos(t, 0))
    const result = trySlash(p, [t], aimAt(p, anklePos(t, 0)))
    expect(result.ankleHit).toBe(true)
    expect(result.napeHit).toBe(false)
  })

  it('the nearer volume wins the overlap: shin-level slashes cut the ankle even inside the nape sphere', () => {
    const { p, t } = setup(12, 10.5)
    p.pos.set(-1.26, 3.5, 0)
    // sanity: the point is genuinely contested between both volumes
    expect(p.pos.distanceTo(napeCenter(t))).toBeLessThan(napeHitRadius(p.config.slashRange, t))
    expect(p.pos.distanceTo(anklePos(t, 0))).toBeLessThan(ankleHitRadius(p.config.slashRange, t))
    // aim at the nape so the outcome is decided by proximity, not by the aim gate
    const result = trySlash(p, [t], aimAt(p, napeCenter(t)))
    expect(result.ankleHit).toBe(true)
    expect(result.napeHit).toBe(false)
  })

  it('nape hits need the crosshair near the nape', () => {
    const { p, t } = setup(25)
    const r = napeHitRadius(p.config.slashRange, t)
    p.pos.copy(napeCenter(t)).add(new Vector3(0, r * 0.85, 0)) // inside, but not point-blank
    const whiff = trySlash(p, [t], new Vector3(0, 0, -1)) // staring at the horizon
    expect(whiff.napeHit).toBe(false)
    expect(whiff.hit).toBe(false) // nothing else reaches up here
    p.slashTimer = 0
    p.slashBuffer = 0
    const result = trySlash(p, [t], aimAt(p, napeCenter(t)))
    expect(result.napeHit).toBe(true)
    expect(result.killed).toBe(true)
  })

  it('point-blank at the nape any swing connects, no aim needed', () => {
    const { p, t } = setup(25)
    p.pos.copy(napeCenter(t)).add(new Vector3(0, 1, 0))
    const result = trySlash(p, [t], new Vector3(0, 0, -1))
    expect(result.napeHit).toBe(true)
  })

  it('a null aim (legacy coop intent) skips the cone gate', () => {
    const { p, t } = setup(25)
    p.pos.copy(napeCenter(t)).add(new Vector3(0, 6, 0))
    const result = trySlash(p, [t], null)
    expect(result.napeHit).toBe(true)
  })
})

describe('slash buffer', () => {
  it('a swing pressed a beat early connects during the pass', () => {
    const { p, t } = setup(25)
    const r = napeHitRadius(p.config.slashRange, t)
    p.pos.copy(napeCenter(t)).add(new Vector3(0, r + 2, 0))
    p.vel.set(0, -25, 0)
    const aim = new Vector3(0, -1, 0)
    const pressed = trySlash(p, [t], aim)
    expect(pressed.hit).toBe(false)
    expect(p.slashBuffer).toBeCloseTo(SLASH_BUFFER_S)
    const bladeBefore = p.bladeHp // the press itself must not wear the edge
    let connected = null
    for (let i = 0; i < 24 && !connected; i++) {
      p.pos.addScaledVector(p.vel, DT)
      connected = stepSlashBuffer(p, [t], aim, DT)
    }
    expect(connected?.napeHit).toBe(true)
    expect(connected?.killed).toBe(true)
    expect(p.bladeHp).toBeLessThan(bladeBefore) // the edge wears at contact
    expect(p.slashBuffer).toBe(0)
  })

  it('the window expires: a press far too early stays a whiff', () => {
    const { p, t } = setup(25)
    p.pos.copy(napeCenter(t)).add(new Vector3(0, 30, 0))
    const aim = new Vector3(0, -1, 0)
    trySlash(p, [t], aim)
    for (let i = 0; i < 30; i++) {
      expect(stepSlashBuffer(p, [t], aim, DT)).toBeNull() // 30 ticks = 0.25s > the window
    }
    expect(p.slashBuffer).toBe(0)
    p.pos.copy(napeCenter(t)) // drifting into range after expiry must not connect
    expect(stepSlashBuffer(p, [t], aim, DT)).toBeNull()
    expect(t.hp).toBe(t.maxHp)
  })
})

describe('slashing a shifter', () => {
  function bossSetup(speed: number) {
    const spec = BOSS_LADDER[0]!
    const fight = createBossFight(1, spec, 5, 'combat-test', 0, 0)
    fight.titan.facing = 0
    const p = createPlayer()
    p.pos.copy(bossPartCenter(fight.titan, spec.parts[0]!))
    p.vel.set(speed, 0, 0)
    p.onGround = false
    return { p, fight }
  }

  it('a swing at the lit part damages the pool and wears the blade once', () => {
    const { p, fight } = bossSetup(25)
    const bladeBefore = p.bladeHp
    const result = trySlash(p, [fight.titan], null, fight)
    expect(result.hit).toBe(true)
    expect(result.boss?.damage).toBe(100)
    expect(fight.state.parts[0]!.hp).toBe(fight.state.parts[0]!.maxHp - 100)
    expect(p.bladeHp).toBe(bladeBefore - 1)
  })

  it('the shifter nape is NOT a normal kill target before its phase', () => {
    const { p, fight } = bossSetup(25)
    const napeSpec = fight.spec.parts[fight.spec.parts.length - 1]!
    p.pos.copy(bossPartCenter(fight.titan, napeSpec))
    const result = trySlash(p, [fight.titan], null, fight)
    expect(result.napeHit).toBe(false)
    expect(result.killed).toBe(false)
    expect(fight.titan.hp).toBeGreaterThan(0)
  })

  it('an off-part swing near the body clinks: double blade wear, zero damage', () => {
    const { p, fight } = bossSetup(25)
    p.pos.copy(bodyCenter(fight.titan))
    const bladeBefore = p.bladeHp
    const result = trySlash(p, [fight.titan], null, fight)
    expect(result.hit).toBe(true)
    expect(result.boss).toBeUndefined()
    expect(result.bossBody).toBe(true)
    expect(p.bladeHp).toBe(bladeBefore - 2)
    expect(fight.titan.hp).toBe(fight.titan.maxHp)
    expect(fight.state.parts.every((part) => part.hp === part.maxHp)).toBe(true)
  })

  it('a normal titan in the same swing still resolves by proximity', () => {
    const { p, fight } = bossSetup(25)
    const pure = createTitan({ id: 2, kind: 'normal', height: 15, x: 2, z: 0 })
    pure.facing = 0
    p.pos.copy(napeCenter(pure))
    const result = trySlash(p, [fight.titan, pure], aimAt(p, napeCenter(pure)), fight)
    expect(result.napeHit).toBe(true)
    expect(result.titanId).toBe(2)
    expect(pure.hp).toBe(0)
  })

  it('the buffered swing connects with the lit part too', () => {
    const { p, fight } = bossSetup(25)
    const partPos = bossPartCenter(fight.titan, fight.spec.parts[0]!)
    p.pos.copy(partPos).add(new Vector3(0, 40, 0))
    trySlash(p, [fight.titan], null, fight) // arms the buffer, nothing in reach
    p.pos.copy(partPos)
    const connected = stepSlashBuffer(p, [fight.titan], null, DT, fight)
    expect(connected?.boss?.damage).toBe(100)
  })
})
