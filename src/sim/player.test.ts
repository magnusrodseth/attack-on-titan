import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { emptyArena } from './city'
import { EYE_HEIGHT } from './constants'
import type { InputState } from './player'
import { createPlayer, neutralInput, stepPlayer, tryBoost } from './player'
import { attachHook } from './rope'

const DT = 1 / 120

function idle(): InputState {
  return neutralInput()
}

describe('stepPlayer', () => {
  it('applies gravity while airborne', () => {
    const p = createPlayer()
    p.pos.set(0, 50, 0)
    stepPlayer(p, idle(), DT, emptyArena())
    expect(p.vel.y).toBeLessThan(0)
    expect(p.onGround).toBe(false)
  })

  it('lands on the ground: clamps to eye height and stops falling', () => {
    const p = createPlayer()
    p.pos.set(0, EYE_HEIGHT + 0.01, 0)
    p.vel.set(0, -30, 0)
    stepPlayer(p, idle(), DT, emptyArena())
    expect(p.pos.y).toBeCloseTo(EYE_HEIGHT)
    expect(p.vel.y).toBe(0)
    expect(p.onGround).toBe(true)
  })

  it('jumps with the jump input on the ground', () => {
    const p = createPlayer()
    p.pos.set(0, EYE_HEIGHT, 0)
    p.vel.set(0, 0, 0)
    stepPlayer(p, idle(), DT, emptyArena()) // settle onGround
    const input = idle()
    input.jump = true
    stepPlayer(p, input, DT, emptyArena())
    expect(p.vel.y).toBeGreaterThan(3)
  })

  it('boost burst adds an impulse along the full look direction', () => {
    const p = createPlayer()
    p.pos.set(0, 30, 0)
    p.onGround = false
    const gasBefore = p.gas
    const look = new Vector3(0.6, 0.8, 0).normalize()
    expect(tryBoost(p, look)).toBe(true)
    expect(p.vel.x).toBeGreaterThan(5)
    expect(p.vel.y).toBeGreaterThan(7) // looking up boosts up
    expect(p.gas).toBeLessThan(gasBefore)
    expect(p.boostCooldown).toBeGreaterThan(0)
  })

  it('boost burst refuses on the ground, on cooldown, or without gas', () => {
    const grounded = createPlayer()
    grounded.onGround = true
    expect(tryBoost(grounded, new Vector3(1, 0, 0))).toBe(false)

    const cooling = createPlayer()
    cooling.onGround = false
    cooling.boostCooldown = 0.3
    expect(tryBoost(cooling, new Vector3(1, 0, 0))).toBe(false)

    const empty = createPlayer()
    empty.onGround = false
    empty.gas = 5
    empty.canisters = 0
    expect(tryBoost(empty, new Vector3(1, 0, 0))).toBe(false)
    expect(empty.vel.x).toBe(0)
  })

  it('boost swaps in a spare canister when the tank cannot cover the burst', () => {
    const p = createPlayer()
    p.pos.set(0, 30, 0)
    p.onGround = false
    p.gas = 5 // below the burst cost, but spares remain
    expect(tryBoost(p, new Vector3(1, 0, 0))).toBe(true)
    expect(p.canisters).toBe(p.config.gasCanisters - 1)
    expect(p.gas).toBeGreaterThan(p.config.maxGas * 0.8) // fresh canister minus one burst
    expect(p.vel.x).toBeGreaterThan(5)
  })

  it('auto-swaps a spare canister in when the tank runs dry', () => {
    const p = createPlayer()
    p.pos.set(0, 30, 0)
    p.onGround = false
    p.gas = 0
    stepPlayer(p, idle(), DT, emptyArena())
    expect(p.canisters).toBe(p.config.gasCanisters - 1)
    expect(p.gas).toBe(p.config.maxGas)
  })

  it('preserves tangential speed through a taut swing (pendulum bottom)', () => {
    const p = createPlayer()
    p.pos.set(0, 20, 0)
    p.vel.set(25, 0, 0)
    attachHook(p.hooks[0], new Vector3(0, 50, 0), p.pos) // rope 30, taut, at arc bottom
    stepPlayer(p, idle(), DT, emptyArena())
    expect(p.vel.x).toBeGreaterThan(24) // no meaningful tangential loss in one tick
  })

  it('auto-reels an attached rope, winching harder the faster you move', () => {
    const slow = createPlayer()
    const fast = createPlayer()
    for (const p of [slow, fast]) {
      p.pos.set(0, 20, 0)
      p.onGround = false
      attachHook(p.hooks[0], new Vector3(0, 50, 0), p.pos) // rope 30, taut
    }
    slow.vel.set(2, 0, 0)
    fast.vel.set(30, 0, 0)
    for (let i = 0; i < 60; i++) {
      stepPlayer(slow, idle(), DT, emptyArena())
      stepPlayer(fast, idle(), DT, emptyArena())
    }
    expect(slow.hooks[0].length).toBeLessThan(30)
    expect(fast.hooks[0].length).toBeLessThan(slow.hooks[0].length)
  })

  it('ratchets the rope: slack is taken up and never paid back out', () => {
    const p = createPlayer()
    p.pos.set(0, 20, 0)
    p.onGround = false
    attachHook(p.hooks[0], new Vector3(0, 50, 0), p.pos) // length 30
    p.pos.set(0, 35, 0) // now only 15 from the anchor: 15 of slack
    stepPlayer(p, idle(), DT, emptyArena())
    expect(p.hooks[0].length).toBeLessThanOrEqual(15)
  })

  it('skids instead of stopping when landing at speed (momentum survives ground touches)', () => {
    const p = createPlayer()
    p.pos.set(0, EYE_HEIGHT, 0)
    p.vel.set(30, 0, 0)
    stepPlayer(p, idle(), DT, emptyArena()) // settle onGround
    for (let i = 0; i < 120; i++) stepPlayer(p, idle(), DT, emptyArena()) // 1s sliding
    const speed = Math.hypot(p.vel.x, p.vel.z)
    expect(speed).toBeGreaterThan(12)
    expect(speed).toBeLessThan(30)
  })

  it('steers a ground slide toward the move direction without dumping speed', () => {
    const p = createPlayer()
    p.pos.set(0, EYE_HEIGHT, 0)
    p.vel.set(30, 0, 0)
    stepPlayer(p, idle(), DT, emptyArena()) // settle onGround
    const input = idle()
    input.move.set(0, 0, 1) // hard perpendicular
    for (let i = 0; i < 120; i++) stepPlayer(p, input, DT, emptyArena())
    expect(p.vel.z).toBeGreaterThan(8) // direction actually changed
    expect(Math.hypot(p.vel.x, p.vel.z)).toBeGreaterThan(15) // without scrubbing all speed
  })

  it('redirects airborne momentum toward the move direction', () => {
    const p = createPlayer()
    p.pos.set(0, 80, 0)
    p.vel.set(30, 0, 0)
    const input = idle()
    input.move.set(0, 0, 1)
    for (let i = 0; i < 120; i++) stepPlayer(p, input, DT, emptyArena())
    expect(p.vel.z).toBeGreaterThan(10)
    expect(Math.hypot(p.vel.x, p.vel.z)).toBeGreaterThan(17) // steering redirects; only drag bleeds speed
  })

  it('caps speed at the configured maximum', () => {
    const p = createPlayer()
    p.pos.set(0, 100, 0)
    p.vel.set(500, 0, 0)
    stepPlayer(p, idle(), DT, emptyArena())
    expect(p.vel.length()).toBeLessThanOrEqual(p.config.speedCap + 1e-6)
  })

  it('holding W on the ground never accelerates beyond run speed', () => {
    const p = createPlayer()
    p.pos.set(0, EYE_HEIGHT, 0)
    p.vel.set(12, 0, 0) // landed above run speed
    stepPlayer(p, idle(), DT, emptyArena()) // settle onGround
    const input = idle()
    input.move.set(1, 0, 0)
    for (let i = 0; i < 360; i++) stepPlayer(p, input, DT, emptyArena()) // 3s of held W
    const speed = Math.hypot(p.vel.x, p.vel.z)
    expect(speed).toBeLessThanOrEqual(p.config.runSpeed + 1)
  })

  it('runs along the ground toward the move direction', () => {
    const p = createPlayer()
    p.pos.set(0, EYE_HEIGHT, 0)
    stepPlayer(p, idle(), DT, emptyArena()) // settle
    const input = idle()
    input.move.set(1, 0, 0)
    for (let i = 0; i < 120; i++) stepPlayer(p, input, DT, emptyArena())
    expect(p.vel.x).toBeGreaterThan(4)
    expect(p.vel.x).toBeLessThanOrEqual(p.config.runSpeed + 0.5)
  })
})
