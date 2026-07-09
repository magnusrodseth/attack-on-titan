import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { applyRopeConstraint, attachHook, createHook, reelHook, releaseHook } from './rope'

describe('attachHook', () => {
  it('sets rope length to the distance between player and anchor at attach time', () => {
    const hook = createHook()
    attachHook(hook, new Vector3(0, 30, 40), new Vector3(0, 0, 0))
    expect(hook.state).toBe('attached')
    expect(hook.length).toBeCloseTo(50)
  })
})

describe('applyRopeConstraint', () => {
  it('does nothing while the rope is slack (inside the sphere)', () => {
    const hook = createHook()
    attachHook(hook, new Vector3(0, 30, 0), new Vector3(0, 0, 0))
    const pos = new Vector3(0, 10, 0)
    const vel = new Vector3(3, -4, 5)
    applyRopeConstraint(pos, vel, hook)
    expect(pos.toArray()).toEqual([0, 10, 0])
    expect(vel.toArray()).toEqual([3, -4, 5])
  })

  it('clamps position back onto the rope sphere when taut', () => {
    const hook = createHook()
    attachHook(hook, new Vector3(0, 30, 0), new Vector3(0, 0, 0))
    const pos = new Vector3(0, -5, 0) // 35 from anchor, rope is 30
    const vel = new Vector3(0, 0, 0)
    applyRopeConstraint(pos, vel, hook)
    expect(pos.distanceTo(new Vector3(0, 30, 0))).toBeCloseTo(30)
  })

  it('removes only the outward radial velocity and preserves tangential momentum', () => {
    const hook = createHook()
    attachHook(hook, new Vector3(0, 30, 0), new Vector3(0, 0, 0))
    const pos = new Vector3(0, -5, 0) // straight below anchor, outward = -y
    const vel = new Vector3(10, -8, 0)
    applyRopeConstraint(pos, vel, hook)
    expect(vel.x).toBeCloseTo(10)
    expect(vel.y).toBeCloseTo(0)
    expect(vel.z).toBeCloseTo(0)
  })

  it('keeps inward radial velocity (moving toward the anchor is never damped)', () => {
    const hook = createHook()
    attachHook(hook, new Vector3(0, 30, 0), new Vector3(0, 0, 0))
    const pos = new Vector3(0, -5, 0)
    const vel = new Vector3(10, 8, 0) // +y is toward the anchor here
    applyRopeConstraint(pos, vel, hook)
    expect(vel.x).toBeCloseTo(10)
    expect(vel.y).toBeCloseTo(8)
  })

  it('is a no-op for a released hook', () => {
    const hook = createHook()
    attachHook(hook, new Vector3(0, 30, 0), new Vector3(0, 0, 0))
    releaseHook(hook)
    const pos = new Vector3(0, -50, 0)
    const vel = new Vector3(0, -9, 0)
    applyRopeConstraint(pos, vel, hook)
    expect(pos.y).toBe(-50)
    expect(vel.y).toBe(-9)
  })
})

describe('reelHook', () => {
  it('shortens the rope by the given amount, down to the minimum', () => {
    const hook = createHook()
    attachHook(hook, new Vector3(0, 30, 0), new Vector3(0, 0, 0))
    reelHook(hook, 14, 3)
    expect(hook.length).toBeCloseTo(16)
    reelHook(hook, 100, 3)
    expect(hook.length).toBe(3)
  })
})
