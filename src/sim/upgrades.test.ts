import { describe, expect, it } from 'vitest'
import { createPlayer } from './player'
import { createRng } from './rng'
import { applyUpgrade, offerUpgrades, UPGRADE_POOL } from './upgrades'

describe('offerUpgrades', () => {
  it('offers three distinct upgrades, deterministically per seed', () => {
    const a = offerUpgrades(createRng(4))
    const b = offerUpgrades(createRng(4))
    expect(a.map((u) => u.id)).toEqual(b.map((u) => u.id))
    expect(new Set(a.map((u) => u.id)).size).toBe(3)
  })
})

describe('applyUpgrade', () => {
  it('gas-tank grows the tank and refills it', () => {
    const p = createPlayer()
    const before = p.config.maxGas
    applyUpgrade(p, 'gas-tank')
    expect(p.config.maxGas).toBeGreaterThan(before)
    expect(p.gas).toBe(p.config.maxGas)
  })

  it('sharp-blades lowers the one-cut speed threshold', () => {
    const p = createPlayer()
    const before = p.config.killSpeed
    applyUpgrade(p, 'sharp-blades')
    expect(p.config.killSpeed).toBeLessThan(before)
  })

  it('extra-blades adds spare pairs immediately', () => {
    const p = createPlayer()
    const before = p.blades
    applyUpgrade(p, 'extra-blades')
    expect(p.blades).toBe(before + 2)
  })

  it('heart raises max hp and heals to full', () => {
    const p = createPlayer()
    const baseMax = p.config.maxHp
    p.hp = 1
    applyUpgrade(p, 'heart')
    expect(p.config.maxHp).toBe(baseMax + 1)
    expect(p.hp).toBe(baseMax + 1)
  })

  it('spear-racks grows capacity toward the canon eight when stacked', () => {
    const p = createPlayer()
    applyUpgrade(p, 'spear-racks')
    expect(p.config.spearCapacity).toBe(4)
    expect(p.spears).toBe(4)
    applyUpgrade(p, 'spear-racks')
    applyUpgrade(p, 'spear-racks')
    expect(p.config.spearCapacity).toBe(8)
    expect(p.spears).toBe(8)
  })

  it('every pool upgrade applies without throwing', () => {
    for (const upgrade of UPGRADE_POOL) {
      const p = createPlayer()
      expect(() => applyUpgrade(p, upgrade.id)).not.toThrow()
    }
  })
})
