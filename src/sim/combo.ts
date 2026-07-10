export interface ComboState {
  count: number
  multiplier: number
  ticksSinceKill: number
  bonusHistory: number[]
}

/** Kills must land within this window of each other to keep the streak alive. */
export const COMBO_WINDOW_SECONDS = 4

const TICKS_PER_SECOND = 60
const BASE_BONUS = 50

export function createComboState(): ComboState {
  return { count: 0, multiplier: 1, ticksSinceKill: 0, bonusHistory: [] }
}

/**
 * Advance the combo clock one sim tick. The streak expires quietly when the
 * window closes -- no penalty, the multiplier just goes home.
 */
export function stepCombo(c: ComboState): void {
  c.ticksSinceKill += 1
  if (c.ticksSinceKill > COMBO_WINDOW_SECONDS * TICKS_PER_SECOND && c.count > 0) {
    c.count = 0
    c.multiplier = 1
  }
}

/**
 * Register a titan kill: bumps the streak, escalates the multiplier, and
 * returns the score bonus for this kill. One-cut nape kills are worth double,
 * with a little jitter so back-to-back kills don't read as identical popups.
 */
export function registerKill(c: ComboState, oneCut: boolean): number {
  c.count += 1
  c.ticksSinceKill = 0
  c.multiplier = multiplierFor(c.count)
  const jitter = 0.9 + Math.random() * 0.2
  const bonus = Math.round(BASE_BONUS * c.multiplier * (oneCut ? 2 : 1) * jitter)
  c.bonusHistory.push(bonus)
  return bonus
}

/** Multiplier tiers: x2 at 4 kills, x3 at 8, x4 at 15. */
export function multiplierFor(count: number): number {
  if (count > 15) return 4
  if (count > 8) return 3
  if (count > 4) return 2
  return 1
}

/** Highest single-kill bonus this run, for the end-of-round summary. */
export function bestBonus(c: ComboState): number {
  return Math.max(...c.bonusHistory)
}
