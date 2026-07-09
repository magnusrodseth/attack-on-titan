import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { emptyArena } from './city'
import { EYE_HEIGHT } from './constants'
import type { InputState } from './player'
import { createPlayer, neutralInput, stepPlayer } from './player'
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

  it('boost thrusts horizontally along the move direction and burns gas', () => {
    const p = createPlayer()
    p.pos.set(0, 30, 0)
    p.onGround = false
    const gasBefore = p.gas
    const input = idle()
    input.gas = true
    input.move.set(1, 0, 0)
    stepPlayer(p, input, DT, emptyArena())
    expect(p.vel.x).toBeGreaterThan(0)
    expect(p.gas).toBeLessThan(gasBefore)
  })

  it('boost falls back to the horizontal look direction with no move input', () => {
    const p = createPlayer()
    p.pos.set(0, 30, 0)
    p.onGround = false
    const input = idle()
    input.gas = true
    input.lookDir.set(0.6, 0.8, 0).normalize() // steep look: boost must stay horizontal
    stepPlayer(p, input, DT, emptyArena())
    expect(p.vel.x).toBeGreaterThan(0)
    expect(p.vel.y).toBeLessThan(0.01) // gravity only; no vertical thrust from boost
  })

  it('boost does nothing on the ground (airborne-only)', () => {
    const boosted = createPlayer()
    const baseline = createPlayer()
    for (const p of [boosted, baseline]) {
      p.pos.set(0, EYE_HEIGHT, 0)
      stepPlayer(p, idle(), DT, emptyArena()) // settle onGround
    }
    const withGas = idle()
    withGas.gas = true
    withGas.move.set(1, 0, 0)
    const noGas = idle()
    noGas.move.set(1, 0, 0)
    stepPlayer(boosted, withGas, DT, emptyArena())
    stepPlayer(baseline, noGas, DT, emptyArena())
    expect(boosted.gas).toBe(boosted.config.maxGas) // no burn
    expect(boosted.vel.toArray()).toEqual(baseline.vel.toArray())
  })

  it('jump then boost gets a hooked player moving', () => {
    const p = createPlayer()
    p.pos.set(0, EYE_HEIGHT, 0)
    stepPlayer(p, idle(), DT, emptyArena()) // settle onGround
    attachHook(p.hooks[0], new Vector3(30, 40, 0), p.pos)
    const jumpInput = idle()
    jumpInput.jump = true
    stepPlayer(p, jumpInput, DT, emptyArena())
    const boostInput = idle()
    boostInput.gas = true
    boostInput.move.set(1, 0, 0)
    for (let i = 0; i < 60; i++) stepPlayer(p, boostInput, DT, emptyArena())
    expect(p.onGround).toBe(false)
    expect(p.vel.x).toBeGreaterThan(1)
  })

  it('makes boost a no-op when tank and all canisters are empty', () => {
    const withGasHeld = createPlayer()
    const baseline = createPlayer()
    for (const p of [withGasHeld, baseline]) {
      p.pos.set(0, 30, 0)
      p.gas = 0
      p.canisters = 0
      p.onGround = false
      attachHook(p.hooks[0], new Vector3(40, 50, 0), p.pos)
    }
    const input = idle()
    input.gas = true
    input.move.set(1, 0, 0)
    const sameMoveNoGas = idle()
    sameMoveNoGas.move.set(1, 0, 0)
    stepPlayer(withGasHeld, input, DT, emptyArena())
    stepPlayer(baseline, sameMoveNoGas, DT, emptyArena())
    expect(withGasHeld.vel.toArray()).toEqual(baseline.vel.toArray())
    expect(withGasHeld.gas).toBe(0)
  })

  it('auto-swaps a spare canister in when the tank runs dry', () => {
    const p = createPlayer()
    p.pos.set(0, 30, 0)
    p.onGround = false
    p.gas = 0.01
    const input = idle()
    input.gas = true
    input.move.set(1, 0, 0)
    stepPlayer(p, input, DT, emptyArena())
    stepPlayer(p, input, DT, emptyArena())
    expect(p.canisters).toBe(p.config.gasCanisters - 1)
    expect(p.gas).toBeGreaterThan(p.config.maxGas * 0.9)
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
