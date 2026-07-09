import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { createGame, startGame, stepGame } from './game'
import { chooseUpgrade } from './game'
import { restoreRun, SAVE_VERSION, serializeRun } from './persist'
import type { InputState } from './player'
import { neutralInput } from './player'

const DT = 1 / 120

/** Deterministic per-tick input script exercising hooks, movement and slashes. */
function scriptedInput(tick: number): InputState {
  const input = neutralInput()
  input.lookDir.set(0.4, 0.35, -0.85).normalize()
  input.hookL = tick > 30 && tick < 220
  input.jump = tick === 10
  input.slash = tick % 90 === 0
  if (tick > 5) input.move.set(0, 0, -1)
  return input
}

describe('serializeRun / restoreRun', () => {
  it('a restored run continues bit-for-bit identical to an uninterrupted one', () => {
    const uninterrupted = createGame('persist-div', null)
    const toBeSaved = createGame('persist-div', null)
    startGame(uninterrupted)
    startGame(toBeSaved)
    for (let t = 0; t < 300; t++) {
      stepGame(uninterrupted, scriptedInput(t), DT)
      stepGame(toBeSaved, scriptedInput(t), DT)
    }
    // snapshot through JSON exactly as localStorage would carry it across a refresh
    const save = JSON.parse(JSON.stringify(serializeRun(toBeSaved)))
    const revived = createGame('persist-div', null)
    expect(restoreRun(save, revived)).toBe(true)
    for (let t = 300; t < 600; t++) {
      stepGame(uninterrupted, scriptedInput(t), DT)
      stepGame(revived, scriptedInput(t), DT)
    }
    expect(revived.player.pos.toArray()).toEqual(uninterrupted.player.pos.toArray())
    expect(revived.player.vel.toArray()).toEqual(uninterrupted.player.vel.toArray())
    expect(revived.player.gas).toBe(uninterrupted.player.gas)
    expect(revived.titans.map((t) => t.pos.toArray())).toEqual(
      uninterrupted.titans.map((t) => t.pos.toArray()),
    )
    expect(revived.titans.map((t) => t.state)).toEqual(uninterrupted.titans.map((t) => t.state))
    expect(revived.score).toEqual(uninterrupted.score)
    expect(revived.wave).toBe(uninterrupted.wave)
  })

  it('round-trips every gameplay field of a mid-run snapshot', () => {
    const g = createGame('persist-rt', null)
    startGame(g)
    for (let t = 0; t < 120; t++) stepGame(g, scriptedInput(t), DT)
    g.player.hp = 2
    g.player.canisters = 1
    g.focus = 41.5
    const save = JSON.parse(JSON.stringify(serializeRun(g, { yaw: 1.2, pitch: -0.3 })))
    expect(save.v).toBe(SAVE_VERSION)
    expect(save.view).toEqual({ yaw: 1.2, pitch: -0.3 })

    const fresh = createGame('persist-rt', null)
    expect(restoreRun(save, fresh)).toBe(true)
    expect(fresh.phase).toBe(g.phase)
    expect(fresh.time).toBe(g.time)
    expect(fresh.focus).toBe(41.5)
    expect(fresh.nextTitanId).toBe(g.nextTitanId)
    expect(fresh.player.pos.toArray()).toEqual(g.player.pos.toArray())
    expect(fresh.player.vel.toArray()).toEqual(g.player.vel.toArray())
    expect(fresh.player.hp).toBe(2)
    expect(fresh.player.canisters).toBe(1)
    expect(fresh.player.bankedSpeed).toBe(g.player.bankedSpeed)
    expect(fresh.player.config).toEqual(g.player.config)
    expect(fresh.player.hooks.map((h) => h.state)).toEqual(g.player.hooks.map((h) => h.state))
    const attached = g.player.hooks.findIndex((h) => h.state === 'attached')
    if (attached >= 0) {
      expect(fresh.player.hooks[attached]!.anchor.toArray()).toEqual(
        g.player.hooks[attached]!.anchor.toArray(),
      )
      expect(fresh.player.hooks[attached]!.length).toBe(g.player.hooks[attached]!.length)
    }
    expect(fresh.titans.length).toBe(g.titans.length)
    expect(fresh.titans[0]!.ankles).toEqual(g.titans[0]!.ankles)
    expect(fresh.titans[0]!.hp).toBe(g.titans[0]!.hp)
  })

  it('restores the upgrade intermission with the same offers, still pickable', () => {
    const g = createGame('persist-upg', null)
    startGame(g)
    for (const t of g.titans) {
      t.hp = 0
      t.state = 'dead'
    }
    stepGame(g, neutralInput(), DT)
    expect(g.phase).toBe('upgrading')
    const save = JSON.parse(JSON.stringify(serializeRun(g)))

    const fresh = createGame('persist-upg', null)
    expect(restoreRun(save, fresh)).toBe(true)
    expect(fresh.phase).toBe('upgrading')
    expect(fresh.offers.map((o) => o.id)).toEqual(g.offers.map((o) => o.id))
    chooseUpgrade(fresh, fresh.offers[0]!.id)
    expect(fresh.phase).toBe('playing')
    expect(fresh.wave).toBe(2)
  })

  it('rejects saves from another seed, another mode, or another version', () => {
    const g = createGame('seed-a', null)
    startGame(g)
    const save = JSON.parse(JSON.stringify(serializeRun(g)))

    expect(restoreRun(save, createGame('seed-b', null))).toBe(false)
    expect(restoreRun({ ...save, v: SAVE_VERSION + 1 }, createGame('seed-a', null))).toBe(false)
    expect(restoreRun({ ...save, modeId: 'time-trial' }, createGame('seed-a', null))).toBe(false)
    expect(restoreRun(null, createGame('seed-a', null))).toBe(false)
    const untouched = createGame('seed-b', null)
    const before = untouched.player.pos.clone()
    restoreRun(save, untouched)
    expect(untouched.player.pos.toArray()).toEqual(before.toArray()) // failed restore mutates nothing
    expect(untouched.phase).toBe('menu')
  })

  it('hooks anchored in titans survive the round trip and keep tracking', () => {
    const g = createGame('persist-hook', null)
    startGame(g)
    g.arena.buildings.length = 0
    g.titans.splice(1)
    const titan = g.titans[0]!
    titan.pos.set(20, 0, 0)
    g.player.pos.set(0, 4, 0)
    const input = neutralInput()
    input.lookDir = new Vector3(titan.pos.x, titan.height * 0.5, titan.pos.z)
      .sub(g.player.pos)
      .normalize()
    input.hookL = true
    stepGame(g, input, DT)
    expect(g.player.hooks[0]!.titanId).toBe(titan.id)

    const save = JSON.parse(JSON.stringify(serializeRun(g)))
    const fresh = createGame('persist-hook', null)
    expect(restoreRun(save, fresh)).toBe(true)
    expect(fresh.player.hooks[0]!.titanId).toBe(titan.id)
    expect(fresh.player.hooks[0]!.local.toArray()).toEqual(g.player.hooks[0]!.local.toArray())
  })
})
