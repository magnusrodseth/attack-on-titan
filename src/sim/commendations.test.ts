import { describe, expect, it } from 'vitest'
import { BOSS_LADDER } from './boss'
import {
  COMMEND_KEY,
  COMMEND_VERSION,
  COMMENDATIONS,
  commendationInfo,
  commendationRows,
  createCommendations,
  flushCommendations,
  loadCommendations,
  resetCommendationRun,
  stepCommendations,
  type CommendationState,
} from './commendations'
import type { GameEvent, GameState, StorageLike } from './game'

const NOW = () => '2026-07-13T00:00:00.000Z'

function fakeStorage(): StorageLike & { data: Map<string, string>; writes: number } {
  const data = new Map<string, string>()
  return {
    data,
    writes: 0,
    getItem(key: string) {
      return data.get(key) ?? null
    },
    setItem(key: string, value: string) {
      this.writes += 1
      data.set(key, value)
    },
  }
}

interface FakeOverrides {
  seed?: string
  phase?: GameState['phase']
  time?: number
  modeId?: string
  hp?: number
  lamp?: number
  pos?: { x: number; y: number; z: number }
  hooks?: { state: string; titanId: number | null }[]
  canal?: { x: number; halfWidth: number; bedY: number; waterY: number } | null
  hunt?: { timeLeft: number; budget: number } | null
}

function fakeGame(over: FakeOverrides = {}): GameState {
  return {
    seed: over.seed ?? 'test',
    phase: over.phase ?? 'playing',
    time: over.time ?? 0,
    events: [] as GameEvent[],
    player: {
      hp: over.hp ?? 5,
      lamp: over.lamp ?? 180,
      pos: over.pos ?? { x: 0, y: 30, z: 0 },
      hooks: over.hooks ?? [],
    },
    arena: { canal: over.canal ?? null },
    hunt: over.hunt ?? null,
    mode: { id: over.modeId ?? 'waves' },
    map: { id: 'district', clockFraction: null },
  } as unknown as GameState
}

function fresh(): CommendationState {
  return createCommendations(loadCommendations(null))
}

function step(cs: CommendationState, g: GameState, dt = 1 / 120): string[] {
  return stepCommendations(cs, g, dt, NOW)
}

function kill(over: Partial<Extract<GameEvent, { type: 'kill' }>> = {}): GameEvent {
  return {
    type: 'kill',
    titanId: 1,
    points: 100,
    oneCut: false,
    speed: 20,
    heartGained: true,
    kind: 'normal',
    weapon: 'blade',
    ...over,
  }
}

describe('registry', () => {
  it('has unique ids and names for every entry', () => {
    const ids = COMMENDATIONS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(commendationInfo('first-blood')).toEqual({ name: 'First Blood', desc: 'Fell your first titan.' })
    expect(commendationInfo('nope')).toEqual({ name: 'nope', desc: '' })
  })

  it('covers the Nine from the boss ladder, plus the capstone', () => {
    for (const spec of BOSS_LADDER) {
      expect(COMMENDATIONS.some((c) => c.id === `felled-${spec.id}`)).toBe(true)
    }
    expect(COMMENDATIONS.some((c) => c.id === 'all-nine-silenced')).toBe(true)
  })
})

describe('persistence', () => {
  it('starts fresh on empty, bad json, and wrong version', () => {
    const storage = fakeStorage()
    expect(loadCommendations(storage).counters.kills).toBe(0)
    storage.data.set(COMMEND_KEY, 'not json')
    expect(loadCommendations(storage).awarded).toEqual({})
    storage.data.set(COMMEND_KEY, JSON.stringify({ version: 0, awarded: {}, counters: {} }))
    expect(loadCommendations(storage).version).toBe(COMMEND_VERSION)
  })

  it('round-trips through flush, and flush no-ops when clean', () => {
    const storage = fakeStorage()
    const cs = fresh()
    const g = fakeGame()
    g.events = [kill()]
    step(cs, g)
    flushCommendations(cs, storage)
    expect(storage.writes).toBe(1)
    flushCommendations(cs, storage) // clean: no second write
    expect(storage.writes).toBe(1)
    const loaded = loadCommendations(storage)
    expect(loaded.awarded['first-blood']).toBe(NOW())
    expect(loaded.counters.kills).toBe(1)
  })
})

describe('kill feats', () => {
  it('awards each once, never twice', () => {
    const cs = fresh()
    const g = fakeGame()
    g.events = [kill()]
    expect(step(cs, g)).toContain('first-blood')
    g.events = [kill()]
    expect(step(cs, g)).toEqual([])
  })

  it('Clean Cut on a one-cut, Terminal Velocity only at 35 m/s', () => {
    const cs = fresh()
    const g = fakeGame()
    g.events = [kill({ oneCut: true, speed: 34.9 })]
    const got = step(cs, g)
    expect(got).toContain('clean-cut')
    expect(got).not.toContain('terminal-velocity')
    g.events = [kill({ speed: 35 })]
    expect(step(cs, g)).toContain('terminal-velocity')
  })

  it('Lightning Passage on a focus kill', () => {
    const cs = fresh()
    const g = fakeGame()
    g.events = [kill({ weapon: 'focus' })]
    expect(step(cs, g)).toContain('lightning-passage')
  })

  it('Point-Blank uses the previous tick’s hooks (kills tear hooks in-tick)', () => {
    const cs = fresh()
    const g = fakeGame({ hooks: [{ state: 'attached', titanId: 7 }] })
    step(cs, g) // records hook on titan 7
    g.player.hooks = [] as never // the kill tore it this tick
    g.events = [kill({ titanId: 7 })]
    expect(step(cs, g)).toContain('point-blank')

    const cs2 = fresh()
    const g2 = fakeGame({ hooks: [{ state: 'attached', titanId: 8 }] })
    step(cs2, g2)
    g2.events = [kill({ titanId: 7 })]
    expect(step(cs2, g2)).not.toContain('point-blank')
  })

  it('Fireworks needs two spear kills in the same tick', () => {
    const cs = fresh()
    const g = fakeGame()
    g.events = [kill({ weapon: 'spear' })]
    step(cs, g)
    g.events = [kill({ weapon: 'spear' })]
    expect(step(cs, g)).not.toContain('fireworks')

    const cs2 = fresh()
    const g2 = fakeGame()
    g2.events = [kill({ weapon: 'spear' }), kill({ titanId: 2, weapon: 'spear' })]
    expect(step(cs2, g2)).toContain('fireworks')
  })
})

describe('wave feats', () => {
  const clear = (wave = 1): GameEvent => ({ type: 'waveClear', wave, bonus: 250 })

  it('Cold Steel only on a boost-free wave, and a restore taints the wave', () => {
    const cs = fresh()
    const g = fakeGame()
    g.events = [{ type: 'boost' }]
    step(cs, g)
    g.events = [clear()]
    expect(step(cs, g)).not.toContain('cold-steel')
    g.events = [clear(2)] // next wave, no boost fired
    expect(step(cs, g)).toContain('cold-steel')

    const cs2 = fresh()
    resetCommendationRun(cs2, { restored: true })
    const g2 = fakeGame()
    g2.events = [clear()]
    expect(step(cs2, g2)).not.toContain('cold-steel')
    g2.events = [clear(2)]
    expect(step(cs2, g2)).toContain('cold-steel')
  })

  it('Last Heart on clearing at one heart', () => {
    const cs = fresh()
    const g = fakeGame({ hp: 2 })
    g.events = [clear()]
    expect(step(cs, g)).not.toContain('last-heart')
    g.player.hp = 1
    g.events = [clear(2)]
    expect(step(cs, g)).toContain('last-heart')
  })

  it('Cull Five and Buzzer Beater judge hunt clears on the previous tick’s clock', () => {
    const cs = fresh()
    const g = fakeGame({ modeId: 'hunt', hunt: { timeLeft: 2.4, budget: 60 } })
    step(cs, g) // records 2.4 s left
    g.hunt = { timeLeft: 60, budget: 60 } as never // the clear reset the clock in-tick
    g.events = [{ type: 'waveClear', wave: 5, bonus: 250 }]
    const got = step(cs, g)
    expect(got).toContain('cull-five')
    expect(got).toContain('buzzer-beater')

    // outside hunt mode neither fires
    const cs2 = fresh()
    const g2 = fakeGame()
    g2.events = [{ type: 'waveClear', wave: 9, bonus: 250 }]
    const got2 = step(cs2, g2)
    expect(got2).not.toContain('cull-five')
    expect(got2).not.toContain('buzzer-beater')
  })
})

describe('ladders', () => {
  it('Slayer I lands exactly on the tenth lifetime kill', () => {
    const cs = fresh()
    for (let i = 0; i < 9; i++) {
      const g = fakeGame()
      g.events = [kill()]
      expect(step(cs, g)).not.toContain('slayer-1')
    }
    const g = fakeGame()
    g.events = [kill()]
    expect(step(cs, g)).toContain('slayer-1')
  })

  it('counters survive across states via the save', () => {
    const storage = fakeStorage()
    const cs = fresh()
    const g = fakeGame()
    g.events = Array.from({ length: 6 }, () => kill())
    step(cs, g)
    flushCommendations(cs, storage)

    const cs2 = createCommendations(loadCommendations(storage))
    const g2 = fakeGame()
    g2.events = Array.from({ length: 4 }, () => kill())
    expect(step(cs2, g2)).toContain('slayer-1')
  })
})

describe('the Nine', () => {
  it('one Felled per Shifter, capstone on the ninth, Untouched on a flawless', () => {
    const cs = fresh()
    for (const [i, spec] of BOSS_LADDER.entries()) {
      const g = fakeGame()
      g.events = [
        { type: 'bossKilled', titanId: 1, name: spec.name, points: 2000, flawless: i === 0 },
      ]
      const got = step(cs, g)
      expect(got).toContain(`felled-${spec.id}`)
      if (i === 0) expect(got).toContain('untouched')
      if (i < BOSS_LADDER.length - 1) expect(got).not.toContain('all-nine-silenced')
      else expect(got).toContain('all-nine-silenced')
    }
  })
})

describe('Signal Run', () => {
  const gate = (delta: number | null): GameEvent => ({
    type: 'gatePass',
    index: 0,
    total: 3,
    split: 10,
    delta,
  })
  const finish = (delta: number | null): GameEvent => ({
    type: 'raceFinished',
    time: 30,
    splits: [10, 20, 30],
    pb: true,
    delta,
  })

  it('Flare Runner on any finish; Perfect Line only when every gate is ahead', () => {
    const cs = fresh()
    const g = fakeGame({ modeId: 'race' })
    g.events = [{ type: 'raceArmed' }, gate(-0.5), gate(-0.1), finish(-1)]
    const got = step(cs, g)
    expect(got).toContain('flare-runner')
    expect(got).toContain('perfect-line')
  })

  it('a first run (null deltas) or a lost gate spoils Perfect Line', () => {
    const cs = fresh()
    const g = fakeGame({ modeId: 'race' })
    g.events = [{ type: 'raceArmed' }, gate(null), gate(-1), finish(null)]
    expect(step(cs, g)).not.toContain('perfect-line')

    const cs2 = fresh()
    const g2 = fakeGame({ modeId: 'race' })
    g2.events = [{ type: 'raceArmed' }, gate(-1), gate(0.2), finish(-1)]
    expect(step(cs2, g2)).not.toContain('perfect-line')
  })

  it('a restart re-arms the attempt', () => {
    const cs = fresh()
    const g = fakeGame({ modeId: 'race' })
    g.events = [{ type: 'raceArmed' }, gate(0.5)]
    step(cs, g)
    g.events = [{ type: 'raceRestart' }, gate(-1), finish(-1)]
    expect(step(cs, g)).toContain('perfect-line')
  })
})

describe('ambient survival', () => {
  it('Night Watch at dawn and Lights Out after 60 dead-lamp seconds, over one cycle', () => {
    const cs = fresh()
    const g = fakeGame({ lamp: 0 })
    const awarded = new Set<string>()
    for (let t = 0; t <= 900; t += 1) {
      g.time = t
      for (const id of step(cs, g, 1)) awarded.add(id)
    }
    expect(awarded).toContain('night-watch')
    expect(awarded).toContain('lights-out')
  })

  it('a live lamp resets the Lights Out clock; menus pause ambient checks', () => {
    const cs = fresh()
    const g = fakeGame({ lamp: 180 })
    for (let t = 0; t <= 900; t += 1) {
      g.time = t
      for (const id of step(cs, g, 1)) expect(id).not.toBe('lights-out')
    }
    const cs2 = fresh()
    const g2 = fakeGame({ lamp: 0, phase: 'dead' })
    for (let t = 0; t <= 900; t += 1) {
      g2.time = t
      expect(step(cs2, g2, 1)).toEqual([])
    }
  })

  it('Mudlark when swimming in the canal, not when swinging over it', () => {
    const canal = { x: 68, halfWidth: 6.5, bedY: -1.8, waterY: -0.9 }
    const cs = fresh()
    const g = fakeGame({ canal, pos: { x: 68, y: 20, z: 0 } })
    expect(step(cs, g)).not.toContain('mudlark')
    g.player.pos.y = 0.5
    expect(step(cs, g)).toContain('mudlark')
  })
})

describe('grab and cripple feats', () => {
  it('Slipped the Fist and Hamstrung fire on their events', () => {
    const cs = fresh()
    const g = fakeGame()
    g.events = [
      { type: 'grabEscaped', titanId: 3 },
      { type: 'crippled', titanId: 4 },
    ]
    const got = step(cs, g)
    expect(got).toContain('slipped-the-fist')
    expect(got).toContain('hamstrung')
  })
})

describe('reachability', () => {
  it('every commendation in the registry is awardable (no dead entries ship)', () => {
    const cs = fresh()
    const collect = (ids: string[]) => ids.forEach((id) => awarded.add(id))
    const awarded = new Set<string>()

    // point-blank needs a remembered hook
    const hookGame = fakeGame({ hooks: [{ state: 'attached', titanId: 1 }] })
    collect(step(cs, hookGame))

    // 1000 one-cut spear kills in pairs at speed: kills every kill feat and kill ladder
    for (let i = 0; i < 500; i++) {
      const g = fakeGame()
      g.events = [
        kill({ titanId: 1, oneCut: true, speed: 40, weapon: 'spear' }),
        kill({ titanId: 2, oneCut: true, speed: 40, weapon: 'spear' }),
      ]
      collect(step(cs, g))
    }
    // one focus kill
    const gFocus = fakeGame()
    gFocus.events = [kill({ weapon: 'focus' })]
    collect(step(cs, gFocus))

    // 500 boost-free wave clears at one heart
    for (let i = 0; i < 500; i++) {
      const g = fakeGame({ hp: 1 })
      g.events = [{ type: 'waveClear', wave: i + 1, bonus: 250 }]
      collect(step(cs, g))
    }

    // hunt clears on a dying clock
    const gHuntPrev = fakeGame({ modeId: 'hunt', hunt: { timeLeft: 1, budget: 60 } })
    collect(step(cs, gHuntPrev))
    const gHunt = fakeGame({ modeId: 'hunt', hunt: { timeLeft: 60, budget: 60 } })
    gHunt.events = [{ type: 'waveClear', wave: 5, bonus: 250 }]
    collect(step(cs, gHunt))

    // grab escape and cripple
    const gGrab = fakeGame()
    gGrab.events = [
      { type: 'grabEscaped', titanId: 3 },
      { type: 'crippled', titanId: 4 },
    ]
    collect(step(cs, gGrab))

    // 100 Weak Point breaks, then the Nine with one flawless
    for (let i = 0; i < 100; i++) {
      const g = fakeGame()
      g.events = [{ type: 'bossPartBroken', titanId: 1, partIndex: 0, partName: 'Ankle', points: 250 }]
      collect(step(cs, g))
    }
    for (const spec of BOSS_LADDER) {
      const g = fakeGame()
      g.events = [{ type: 'bossKilled', titanId: 1, name: spec.name, points: 2000, flawless: true }]
      collect(step(cs, g))
    }

    // a perfect Signal Run
    const gRace = fakeGame({ modeId: 'race' })
    gRace.events = [
      { type: 'raceArmed' },
      { type: 'gatePass', index: 0, total: 1, split: 10, delta: -1 },
      { type: 'raceFinished', time: 30, splits: [10], pb: true, delta: -1 },
    ]
    collect(step(cs, gRace))

    // a dead-lamp night, dusk to dawn, and a canal swim
    const canal = { x: 68, halfWidth: 6.5, bedY: -1.8, waterY: -0.9 }
    const gNight = fakeGame({ lamp: 0, canal, pos: { x: 68, y: 0.5, z: 0 } })
    for (let t = 0; t <= 900; t += 1) {
      gNight.time = t
      collect(step(cs, gNight, 1))
    }

    const missing = COMMENDATIONS.map((c) => c.id).filter((id) => !awarded.has(id))
    expect(missing).toEqual([])
  })
})

describe('panel rows', () => {
  it('folds ladder tiers into one row with pips and next-target progress', () => {
    const cs = fresh()
    const g = fakeGame()
    g.events = Array.from({ length: 12 }, (_, i) => kill({ titanId: i }))
    step(cs, g)
    const rows = commendationRows(cs.save)
    const slayer = rows.find((r) => r.name === 'Slayer')
    expect(slayer).toBeDefined()
    expect(slayer?.tiers).toEqual([true, false, false])
    expect(slayer?.awarded).toBe(false)
    expect(slayer?.progress).toEqual({ value: 12, target: 100 })
    // one row per ladder, not per tier
    expect(rows.filter((r) => r.name.startsWith('Slayer')).length).toBe(1)
  })

  it('shows capstone progress out of nine', () => {
    const cs = fresh()
    const g = fakeGame()
    g.events = [
      { type: 'bossKilled', titanId: 1, name: BOSS_LADDER[0]?.name ?? '', points: 2000, flawless: false },
    ]
    step(cs, g)
    const rows = commendationRows(cs.save)
    const capstone = rows.find((r) => r.name === 'All Nine Silenced')
    expect(capstone?.progress).toEqual({ value: 1, target: 9 })
  })
})
