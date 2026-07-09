import { describe, expect, it } from 'vitest'
import { createScore, registerKill, registerSpearKill, stepScore } from './score'

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
