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

  it('jumps when gas is pressed on the ground', () => {
    const p = createPlayer()
    p.pos.set(0, EYE_HEIGHT, 0)
    p.vel.set(0, 0, 0)
    stepPlayer(p, idle(), DT, emptyArena()) // settle onGround
    const input = idle()
    input.gas = true
    stepPlayer(p, input, DT, emptyArena())
    expect(p.vel.y).toBeGreaterThan(3)
  })

  it('gas thrust while hooked accelerates toward the anchor and burns gas', () => {
    const p = createPlayer()
    p.pos.set(0, 30, 0)
    attachHook(p.hooks[0], new Vector3(40, 50, 0), p.pos)
    const gasBefore = p.gas
    const input = idle()
    input.gas = true
    stepPlayer(p, input, DT, emptyArena())
    expect(p.vel.x).toBeGreaterThan(0) // pulled toward +x anchor
    expect(p.gas).toBeLessThan(gasBefore)
  })

  it('launches off the ground when gassing with a hook attached', () => {
    const p = createPlayer()
    p.pos.set(0, EYE_HEIGHT, 0)
    stepPlayer(p, idle(), DT, emptyArena()) // settle onGround
    attachHook(p.hooks[0], new Vector3(30, 40, 0), p.pos)
    const input = idle()
    input.gas = true
    for (let i = 0; i < 60; i++) stepPlayer(p, input, DT, emptyArena())
    expect(p.onGround).toBe(false)
    expect(p.pos.y).toBeGreaterThan(EYE_HEIGHT + 0.5)
    expect(p.vel.x).toBeGreaterThan(1) // pulled toward the anchor, not pinned by ground friction
  })

  it('makes gas input a no-op when the tank is empty', () => {
    const withGasHeld = createPlayer()
    const baseline = createPlayer()
    for (const p of [withGasHeld, baseline]) {
      p.pos.set(0, 30, 0)
      p.gas = 0
      p.onGround = false
      attachHook(p.hooks[0], new Vector3(40, 50, 0), p.pos)
    }
    const input = idle()
    input.gas = true
    stepPlayer(withGasHeld, input, DT, emptyArena())
    stepPlayer(baseline, idle(), DT, emptyArena())
    expect(withGasHeld.vel.toArray()).toEqual(baseline.vel.toArray())
    expect(withGasHeld.gas).toBe(0)
  })

  it('preserves tangential speed through a taut swing (pendulum bottom)', () => {
    const p = createPlayer()
    p.pos.set(0, 20, 0)
    p.vel.set(25, 0, 0)
    attachHook(p.hooks[0], new Vector3(0, 50, 0), p.pos) // rope 30, taut, at arc bottom
    stepPlayer(p, idle(), DT, emptyArena())
    expect(p.vel.x).toBeGreaterThan(24) // no meaningful tangential loss in one tick
  })

  it('reels in the rope while holding reel', () => {
    const p = createPlayer()
    p.pos.set(0, 30, 0)
    attachHook(p.hooks[0], new Vector3(0, 60, 0), p.pos)
    const before = p.hooks[0].length
    const input = idle()
    input.reel = true
    stepPlayer(p, input, DT, emptyArena())
    expect(p.hooks[0].length).toBeLessThan(before)
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
