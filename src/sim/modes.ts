import { createHuntMode } from './hunt'
import type { InputState } from './player'
import { raceMode } from './race'
import type { CoopStance } from './stance'
import type { World } from './world'
import { clearWave, pickUpgrade, populateFolk, spawnWave } from './world'

/**
 * A game mode owns a run's objective: what a fresh run spawns, how it progresses each
 * tick, and how intermissions (like the upgrade screen) resolve. Core systems — movement,
 * hooks, combat, titan AI, bosses, scoring, resupply — live in world.ts and are shared by
 * every mode, on every map, in singleplayer and multiplayer alike.
 *
 * To add a mode: implement this interface with its own seeded rng streams
 * (`hashSeed(seed + ':<purpose>:N')` so runs stay replayable), declare its `coop` stance,
 * and append it to GAME_MODES. The menu and the co-op lobby both read the registry, so a
 * new mode appears in singleplayer and multiplayer at once — or is honestly refused in one
 * of them, if that is what its stance says. There is no third option: `coop` is required,
 * and a mode without it does not compile (ADR 0003).
 */
export interface GameMode {
  id: string
  name: string
  desc: string
  /** What this mode does in multiplayer. Required: silence is what we are fixing. */
  coop: CoopStance
  /**
   * Whether the district has people in it while this mode runs. Required, and 'false' is a
   * legitimate answer: The Culling is relentless (every titan hunts the soldiers, so nobody
   * is ever free to eat) and Signal Run has no titans at all. Saying so out loud is the
   * point — the same medicine as the co-op stance (ADR 0003).
   */
  crowd: boolean
  /** Seeds the mode's objectives on a fresh run (the driver resets soldiers/score first). */
  start(w: World): void
  /** Runs at the end of every playing tick; drives progression, phases and win/lose. */
  step(w: World, dt: number, input: InputState): void
  /** Resolves an upgrade pick if this mode uses the 'upgrading' intermission. */
  chooseUpgrade?(w: World, soldierId: string, id: string): void
}

/** The wave-loop skeleton shared by every wave-based mode; only the roster differs. */
export function waveLoop(): Pick<GameMode, 'start' | 'step' | 'chooseUpgrade'> {
  return {
    start(w) {
      w.wave = 1
      populateFolk(w) // the streets fill once, at the start of a run; losses are permanent
      spawnWave(w)
    },

    step(w) {
      if (w.titans.length > 0 && w.titans.every((t) => t.hp <= 0)) clearWave(w)
    },

    chooseUpgrade(w, soldierId, id) {
      pickUpgrade(w, soldierId, id)
    },
  }
}

/** The original endless run: clear a wave, pick a field modification, repeat. */
const wavesMode: GameMode = {
  id: 'waves',
  name: 'Wave Survival',
  desc: 'Endless escalating waves. Clear the ground, pick a field modification, and hold out as the titans grow bigger, faster and stranger.',
  coop: {
    kind: 'shared',
    note: 'The roster scales with the squad; every soldier picks their own upgrade.',
  },
  // Wave Survival is about the roster and nothing else: an empty district, and you against
  // what walks in. The people live in their own mode (The Evacuation), where protecting them
  // IS the game rather than a distraction from it.
  crowd: false,
  ...waveLoop(),
}

/**
 * The Evacuation: the district is full of people and the titans are already inside.
 *
 * Mechanically it is the wave skeleton, but the objective is inverted: the roster is not the
 * thing you are clearing, it is the thing eating the thing you are protecting. Every titan
 * without a chase token is hunting someone who cannot fight back, and a titan that catches one
 * stands still to eat — which makes it the easiest nape in the game, attached to someone you
 * are failing. Letting it feed is tactically correct and morally awful, and the mode never
 * resolves that for you.
 *
 * The headcount is the life bar. Lose the last civilian and the run is over, even at full
 * health, because there is nothing left in the district worth standing in.
 */
const evacuationMode: GameMode = {
  id: 'evacuation',
  name: 'The Evacuation',
  desc: 'The district is full of people and the titans are in the streets. Every titan that is not hunting you is eating someone. Cut them out of the fists, get them to the stations, and hold the district — the run ends when the last civilian does, however many hearts you have left.',
  coop: {
    kind: 'shared',
    note: 'A squad is BETTER at this, not merely compatible with it: you cannot be everywhere, and now there are four of you deciding where to be. Rescue credit goes to whoever breaks the grip; a restocked station belongs to everyone.',
  },
  crowd: true,
  ...waveLoop(),
}

/**
 * The Nine: nothing but the Shifter ladder, one boss per wave, upgrades between fights.
 * spawnWave treats every wave as a milestone here, so the composition never fires.
 */
const bossRushMode: GameMode = {
  id: 'bossrush',
  name: 'The Nine',
  desc: 'The Shifter gauntlet: the Nine walk one after another through the gate, Beast to Founding, then the ladder hardens and laps. Break every Weak Point or die trying.',
  coop: {
    kind: 'adapted',
    note: 'Part HP pools scale with the squad (rosterHpScale), so a four-hand Shifter fight lasts a fight. The ladder itself never changes.',
  },
  // the Nine get a cleared district: a Shifter duel is a duel, and a crowd underfoot would be
  // a second game played badly on top of the first one. (The Colossal stepping over a living
  // city is a hell of an image, and it belongs to The Evacuation if it ever wants a boss wave.)
  crowd: false,
  ...waveLoop(),
}

/** The Culling rides the same wave skeleton; the countdown and relentless rule wrap it. */
const huntMode: GameMode = createHuntMode(waveLoop())

export const GAME_MODES: GameMode[] = [
  wavesMode,
  evacuationMode,
  bossRushMode,
  raceMode,
  huntMode,
]

/** Modes where the district is populated; a map with no people cannot host them. */
export function crowdModes(): GameMode[] {
  return GAME_MODES.filter((mode) => mode.crowd)
}

export const DEFAULT_MODE_ID = 'waves'

export function getMode(id: string): GameMode {
  return GAME_MODES.find((mode) => mode.id === id) ?? GAME_MODES[0]!
}

/** The modes a co-op lobby may pick: the ones whose stance says they work with a squad. */
export function coopModes(): GameMode[] {
  return GAME_MODES.filter((mode) => mode.coop.kind !== 'soloOnly')
}
