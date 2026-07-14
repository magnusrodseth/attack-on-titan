import { hashSeed } from './rng'

/**
 * The Daily Expedition's roll (wayfinder de-002): which discipline, in which arena, on which
 * date. One expedition per UTC day, one attempt per soldier.
 *
 * Deliberately dependency-light: the Cloudflare Worker imports this module to derive the roll
 * itself (it never trusts the client's word for what today is), and importing GAME_MODES or
 * GAME_MAPS here would drag every arena generator into the Worker bundle. The ids below are
 * therefore data — `daily.test.ts` is what holds them to the registries, and it fails loudly
 * if a map or mode is ever added, renamed or removed.
 */
export const DAILY_MODE_IDS = ['waves', 'race', 'hunt'] as const
export const DAILY_MAP_IDS = ['district', 'underground', 'forest'] as const

/** Bossrush is excluded on purpose: the Nine ladder is the worst thing to hand someone on a
 *  single attempt of the day. It stays a mode you choose deliberately. */

/** Day zero. Fixed forever — moving it reshuffles every future expedition. */
export const DAILY_EPOCH_MS = Date.UTC(2026, 0, 1)

const DAY_MS = 86_400_000

export interface DailyOrders {
  /** UTC calendar date, `YYYY-MM-DD`. */
  date: string
  modeId: string
  mapId: string
}

/** The UTC date a moment falls on. UTC, not local: one world, one day, one expedition. */
export function dailyDate(now: number = Date.now()): string {
  const d = new Date(now)
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${d.getUTCFullYear()}-${month}-${day}`
}

/** Whole UTC days from the epoch to a date. Negative before the epoch; the roll copes. */
export function dayIndex(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  return Math.round((Date.UTC(year!, month! - 1, day!) - DAILY_EPOCH_MS) / DAY_MS)
}

/** Positive modulo — dates before the epoch must not index backwards out of the pools. */
function mod(value: number, n: number): number {
  return ((value % n) + n) % n
}

/**
 * The day's orders, in closed form. Walking the pools like a Latin square gives the two
 * properties the daily needs, without any lookback:
 *
 *   - **Consecutive days never repeat the mode** (the mode index advances by exactly 1).
 *   - **Consecutive days never repeat the map** (the map index advances by 1 or 2, never 0 —
 *     which needs at least three maps to hold, asserted in the tests).
 *   - Every mode × map pairing comes up exactly once per cycle, so nothing is ever starved.
 *
 * The naive alternative — "roll, and re-roll if it matches yesterday" — reads simpler and is a
 * trap: yesterday's roll depends on the day before it, so every client and the Worker would
 * have to replay the whole calendar from the epoch just to agree on today. This is O(1) and
 * two implementations cannot drift.
 */
export function dailyRoll(date: string): DailyOrders {
  const d = dayIndex(date)
  const modes = DAILY_MODE_IDS.length
  const modeId = DAILY_MODE_IDS[mod(d, modes)]!
  const mapId = DAILY_MAP_IDS[mod(d + Math.floor(d / modes), DAILY_MAP_IDS.length)]!
  return { date, modeId, mapId }
}

/**
 * The sealed course (de-004). The mode and the arena are announced; the seed is not, because a
 * seed anyone can derive is a course anyone can rehearse before spending their attempt on it.
 * Derived from a Worker-held secret, so it is reproducible server-side without storing a row,
 * and unguessable everywhere else. **Only the Worker ever calls this** — the client receives the
 * seed from the claim, and the client never sees the secret.
 */
export function dailyCourseSeed(secret: string, date: string): string {
  return `exp-${hashSeed(`${secret}:${date}`).toString(36)}`
}
