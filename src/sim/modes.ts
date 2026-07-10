import type { GameState } from './game'
import { saveBest } from './game'
import { createHuntMode } from './hunt'
import { nearestWalkable } from './nav'
import type { InputState } from './player'
import { raceMode } from './race'
import { createRng, hashSeed } from './rng'
import { spawnPickups } from './spear'
import { createTitan } from './titan'
import { applyUpgrade, offerUpgrades } from './upgrades'
import type { TitanSpawn } from './waves'
import { matchdayComposition, waveComposition } from './waves'

/**
 * A game mode owns a run's objective: what a fresh run spawns, how it progresses each
 * tick, and how intermissions (like the upgrade screen) resolve. Core systems — movement,
 * hooks, combat, titan AI, scoring, resupply — stay in game.ts and are shared by every
 * mode. To add a mode (time trial, parkour rings, ...): implement this interface with its
 * own seeded rng streams (`hashSeed(seed + ':<purpose>:N')` so runs stay replayable) and
 * append it to GAME_MODES; the menu picks it up from the registry.
 */
export interface GameMode {
  id: string
  name: string
  desc: string
  /** Seeds the mode's objectives on a fresh run (startGame resets player/score first). */
  start(g: GameState): void
  /** Runs at the end of every playing tick; drives progression, phases and win/lose. */
  step(g: GameState, dt: number, input: InputState): void
  /** Resolves an upgrade pick if this mode uses the 'upgrading' intermission. */
  chooseUpgrade?(g: GameState, id: string): void
}

type Composition = (
  wave: number,
  rng: () => number,
  countScale?: number,
  wallRadius?: number,
) => TitanSpawn[]

function spawnWave(g: GameState, composition: Composition): void {
  const rng = createRng(hashSeed(`${g.seed}:wave:${g.wave}`))
  g.titans = composition(g.wave, rng, 1, g.arena.wallRadius).map((s) => {
    // snap spawns onto walkable streets so no titan starts its life inside a house
    const [x, z] = nearestWalkable(g.nav, s.x, s.z)
    return createTitan({ id: g.nextTitanId++, kind: s.kind, height: s.height, x, z })
  })
  // fresh spear caches each wave; spears riding last wave's corpses go with them
  g.pickups = spawnPickups(g.seed, g.wave, g.nav)
  g.spears = g.spears.filter((s) => s.titanId === null)
}

/** The wave-loop skeleton shared by every wave-based mode; only the roster differs. */
function waveLoop(composition: Composition): Pick<GameMode, 'start' | 'step' | 'chooseUpgrade'> {
  return {
    start(g) {
      g.wave = 1
      spawnWave(g, composition)
    },

    step(g) {
      if (g.titans.length > 0 && g.titans.every((t) => t.hp <= 0)) {
        const bonus = 250 * g.wave
        g.score.score += bonus
        g.offers = offerUpgrades(createRng(hashSeed(`${g.seed}:offers:${g.wave}`)))
        g.phase = 'upgrading'
        saveBest(g)
        g.events.push({ type: 'waveClear', wave: g.wave, bonus })
      }
    },

    chooseUpgrade(g, id) {
      applyUpgrade(g.player, id)
      g.player.hp = g.player.config.maxHp // a fresh wave starts at full health
      g.offers = []
      g.wave += 1
      spawnWave(g, composition)
      g.phase = 'playing'
    },
  }
}

/** The original endless run: clear a wave, pick a field modification, repeat. */
const wavesMode: GameMode = {
  id: 'waves',
  name: 'Wave Survival',
  desc: 'Endless escalating waves. Clear the district, pick a field modification, and hold out as the titans grow bigger, faster and stranger.',
  ...waveLoop(waveComposition),
}

/** Matchday, all ninety minutes of it: nothing takes the pitch but footballers. */
const matchdayMode: GameMode = {
  id: 'matchday',
  name: 'Matchday',
  desc: 'The fixture list from hell: every titan on the pitch is a Striker or a Captain. Faster, hungrier, higher-leaping, and worth triple score. Survive full time.',
  ...waveLoop(matchdayComposition),
}

/** The Culling rides the same wave skeleton; the countdown and relentless rule wrap it. */
const huntMode: GameMode = createHuntMode(waveLoop(waveComposition))

export const GAME_MODES: GameMode[] = [wavesMode, matchdayMode, raceMode, huntMode]

export const DEFAULT_MODE_ID = 'waves'

export function getMode(id: string): GameMode {
  return GAME_MODES.find((mode) => mode.id === id) ?? GAME_MODES[0]!
}
