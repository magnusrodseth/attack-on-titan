import { describe, expect, it } from 'vitest'
import { trySlash } from './combat'
import { createPlayer } from './player'
import { anklePos, createTitan, napeCenter } from './titan'

function setup(speed: number) {
  const p = createPlayer()
  const t = createTitan({ id: 1, kind: 'normal', height: 15, x: 0, z: 0 })
  p.pos.copy(napeCenter(t))
  p.vel.set(speed, 0, 0)
  p.onGround = false
  return { p, t }
}

describe('trySlash', () => {
  it('one-cuts the nape at or above kill speed', () => {
    const { p, t } = setup(25) // killSpeed default 22
    const result = trySlash(p, [t])
    expect(result.hit).toBe(true)
    expect(result.napeHit).toBe(true)
    expect(result.killed).toBe(true)
    expect(t.hp).toBe(0)
  })

  it('chips the nape below kill speed without killing', () => {
    const { p, t } = setup(10)
    const result = trySlash(p, [t])
    expect(result.hit).toBe(true)
    expect(result.killed).toBe(false)
    expect(t.hp).toBeGreaterThan(0)
    expect(t.hp).toBeLessThan(t.maxHp)
  })

  it('wears the blade on every connecting slash', () => {
    const { p, t } = setup(25)
    const before = p.bladeHp
    trySlash(p, [t])
    expect(p.bladeHp).toBeLessThan(before)
  })

  it('body hits do little damage and dull the blade faster', () => {
    const { p, t } = setup(30)
    p.pos.set(0, 7.5, 2.5) // torso height, in front of the body, away from nape
    const napeResult = setup(30)
    const bodyWear = (() => {
      const before = p.bladeHp
      const r = trySlash(p, [t])
      expect(r.hit).toBe(true)
      expect(r.napeHit).toBe(false)
      expect(r.killed).toBe(false)
      return before - p.bladeHp
    })()
    const napeBefore = napeResult.p.bladeHp
    trySlash(napeResult.p, [napeResult.t])
    expect(bodyWear).toBeGreaterThan(napeBefore - napeResult.p.bladeHp)
  })

  it('misses cleanly when nothing is in range', () => {
    const { p, t } = setup(30)
    p.pos.set(100, 5, 100)
    const before = p.bladeHp
    const result = trySlash(p, [t])
    expect(result.hit).toBe(false)
    expect(p.bladeHp).toBe(before)
  })

  it('breaks blades into the next pair, and refuses to slash with none left', () => {
    const { p, t } = setup(25)
    p.bladeHp = 1
    const pairsBefore = p.blades
    trySlash(p, [t])
    expect(p.blades).toBe(pairsBefore - 1)
    expect(p.bladeHp).toBe(p.config.bladeDurability)

    const { p: p2, t: t2 } = setup(25)
    p2.blades = 0
    p2.bladeHp = 0
    const result = trySlash(p2, [t2])
    expect(result.hit).toBe(false)
    expect(t2.hp).toBe(t2.maxHp)
  })

  it('slices an ankle when slashing at foot level', () => {
    const { p, t } = setup(12)
    p.pos.copy(anklePos(t, 0))
    const result = trySlash(p, [t])
    expect(result.hit).toBe(true)
    expect(result.ankleHit).toBe(true)
    expect(t.ankles[0]).toBe(true)
    expect(t.ankles[1]).toBe(false)
    expect(result.killed).toBe(false)
    expect(t.state).not.toBe('crippled')
  })

  it('cripples the titan when both ankles are cut', () => {
    const { p, t } = setup(12)
    p.pos.copy(anklePos(t, 0))
    trySlash(p, [t])
    p.slashTimer = 0
    p.pos.copy(anklePos(t, 1))
    const result = trySlash(p, [t])
    expect(result.ankleHit).toBe(true)
    expect(result.crippled).toBe(true)
    expect(t.state).toBe('crippled')
    expect(t.crippleTimer).toBeGreaterThan(50)
  })

  it('does not re-slice an already cut ankle', () => {
    const { p, t } = setup(12)
    p.pos.copy(anklePos(t, 0))
    trySlash(p, [t])
    p.slashTimer = 0
    const result = trySlash(p, [t])
    expect(result.ankleHit).toBe(false) // same spot again: only body remains
  })

  it('respects the slash cooldown', () => {
    const { p, t } = setup(25)
    p.slashTimer = 0.3
    const result = trySlash(p, [t])
    expect(result.hit).toBe(false)
    expect(t.hp).toBe(t.maxHp)
  })
})
