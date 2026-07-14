import { createHuntMode } from './hunt'
import type { InputState } from './player'
import { raceMode } from './race'
import type { CoopStance } from './stance'
import type { World } from './world'
import { clearWave, pickUpgrade, spawnWave } from './world'

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
  ...waveLoop(),
}

/** The Culling rides the same wave skeleton; the countdown and relentless rule wrap it. */
const huntMode: GameMode = createHuntMode(waveLoop())

export const GAME_MODES: GameMode[] = [wavesMode, bossRushMode, raceMode, huntMode]

export const DEFAULT_MODE_ID = 'waves'

export function getMode(id: string): GameMode {
  return GAME_MODES.find((mode) => mode.id === id) ?? GAME_MODES[0]!
}

/** The modes a co-op lobby may pick: the ones whose stance says they work with a squad. */
export function coopModes(): GameMode[] {
  return GAME_MODES.filter((mode) => mode.coop.kind !== 'soloOnly')
}
