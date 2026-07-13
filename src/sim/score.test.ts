import { describe, expect, it } from 'vitest'
import {
  createScore,
  registerBossBreak,
  registerBossKill,
  registerKill,
  registerSpearKill,
  stepScore,
} from './score'

const KILL_SPEED = 22

describe('registerKill', () => {
  it('awards the base score for a plain grounded kill', () => {
    const s = createScore()
    const points = registerKill(s, { speed: KILL_SPEED, airborne: false, oneCut: false }, KILL_SPEED)
    expect(points).toBe(100)
    expect(s.score).toBe(100)
    expect(s.combo).toBe(1)
  })

  it('scales with overspeed', () => {
    const s = createScore()
    const points = registerKill(s, { speed: KILL_SPEED * 2, airborne: false, oneCut: false }, KILL_SPEED)
    expect(points).toBe(200)
  })

  it('rewards airborne one-cut kills multiplicatively', () => {
    const s = createScore()
    const points = registerKill(s, { speed: KILL_SPEED, airborne: true, oneCut: true }, KILL_SPEED)
    expect(points).toBe(Math.round(100 * 1.25 * 1.5))
  })

  it('pays 3x for a footballer, above the abnormal 1.75x', () => {
    const s = createScore()
    const star = registerKill(s, { speed: KILL_SPEED, airborne: false, oneCut: false, footballer: true }, KILL_SPEED)
    expect(star).toBe(Math.round(100 * 3 * (1 + 0.25 * 0))) // first kill of the chain
    const s2 = createScore()
    const rare = registerKill(s2, { speed: KILL_SPEED, airborne: false, oneCut: false, abnormal: true }, KILL_SPEED)
    expect(star).toBeGreaterThan(rare)
  })

  it('builds a kill-chain multiplier', () => {
    const s = createScore()
    registerKill(s, { speed: KILL_SPEED, airborne: false, oneCut: false }, KILL_SPEED)
    const second = registerKill(s, { speed: KILL_SPEED, airborne: false, oneCut: false }, KILL_SPEED)
    expect(second).toBe(125) // 100 * (1 + 0.25 * combo of 1)
    expect(s.combo).toBe(2)
  })
})

describe('registerSpearKill', () => {
  it('pays a flat base below the blade baseline, ignoring speed entirely', () => {
    const s = createScore()
    expect(registerSpearKill(s, {})).toBe(75)
    expect(s.kills).toBe(1)
  })

  it('keeps the rarity bonus and extends the chain like any kill', () => {
    const s = createScore()
    expect(registerSpearKill(s, { abnormal: true })).toBe(Math.round(75 * 1.75))

    const chained = createScore()
    registerKill(chained, { speed: KILL_SPEED, airborne: false, oneCut: false }, KILL_SPEED)
    expect(registerSpearKill(chained, {})).toBe(Math.round(75 * 1.25)) // combo of 1 carried in
    expect(chained.combo).toBe(2)
  })

  it('pays the footballer jackpot tier, same as a blade kill', () => {
    const s = createScore()
    expect(registerSpearKill(s, { footballer: true })).toBe(75 * 3)
  })
})

describe('boss scoring', () => {
  it('a weak point break banks 250 x chain and sustains the combo without counting a kill', () => {
    const s = createScore()
    expect(registerBossBreak(s)).toBe(250)
    expect(s.combo).toBe(1)
    expect(s.kills).toBe(0)
    expect(s.comboTimer).toBeGreaterThan(0)
    expect(registerBossBreak(s)).toBe(Math.round(250 * 1.25)) // chain carried in
  })

  it('the boss kill jackpots 2000 with speed, air and chain multipliers', () => {
    const s = createScore()
    const base = registerBossKill(s, { speed: KILL_SPEED, airborne: false, flawless: false }, KILL_SPEED)
    expect(base).toBe(2000)
    expect(s.kills).toBe(1)

    const styled = createScore()
    const points = registerBossKill(
      styled,
      { speed: KILL_SPEED * 2, airborne: true, flawless: false },
      KILL_SPEED,
    )
    expect(points).toBe(Math.round(2000 * 2 * 1.25))
  })

  it('a flawless kill (every part in one clean cut) pays +50%', () => {
    const s = createScore()
    const points = registerBossKill(s, { speed: KILL_SPEED, airborne: false, flawless: true }, KILL_SPEED)
    expect(points).toBe(3000)
  })
})

describe('stepScore', () => {
  it('drops the combo when the chain window expires', () => {
    const s = createScore()
    registerKill(s, { speed: KILL_SPEED, airborne: false, oneCut: false }, KILL_SPEED)
    stepScore(s, 3)
    expect(s.combo).toBe(1)
    stepScore(s, 4)
    expect(s.combo).toBe(0)
  })
})
