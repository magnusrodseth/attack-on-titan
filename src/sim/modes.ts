import type { GameState } from './game'
import { saveBest } from './game'
import { nearestWalkable } from './nav'
import { createRng, hashSeed } from './rng'
import { createTitan } from './titan'
import { applyUpgrade, offerUpgrades } from './upgrades'
import { waveComposition } from './waves'

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
  step(g: GameState, dt: number): void
  /** Resolves an upgrade pick if this mode uses the 'upgrading' intermission. */
  chooseUpgrade?(g: GameState, id: string): void
}

function spawnWave(g: GameState): void {
  const rng = createRng(hashSeed(`${g.seed}:wave:${g.wave}`))
  g.titans = waveComposition(g.wave, rng).map((s) => {
    // snap spawns onto walkable streets so no titan starts its life inside a house
    const [x, z] = nearestWalkable(g.nav, s.x, s.z)
    return createTitan({ id: g.nextTitanId++, kind: s.kind, height: s.height, x, z })
  })
}

/** The original endless run: clear a wave, pick a field modification, repeat. */
const wavesMode: GameMode = {
  id: 'waves',
  name: 'Wave Survival',
  desc: 'Endless escalating waves. Clear the district, pick a field modification, and hold out as the titans grow bigger, faster and stranger.',

  start(g) {
    g.wave = 1
    spawnWave(g)
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
    spawnWave(g)
    g.phase = 'playing'
  },
}

export const GAME_MODES: GameMode[] = [wavesMode]

export const DEFAULT_MODE_ID = 'waves'

export function getMode(id: string): GameMode {
  return GAME_MODES.find((mode) => mode.id === id) ?? GAME_MODES[0]!
}
