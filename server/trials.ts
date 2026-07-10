/**
 * Time-trial submissions (wayfinder tt-008): validation and keep-best rules, pure and
 * unit-tested. Solo trial times come from the client sim (unlike co-op scores, which the
 * server sim owns), so these are plausibility gates, not anti-cheat.
 */
export interface RaceTrialPost {
  mode: 'race'
  seed: string
  timeS: number
  splits: number[]
}

export interface HuntTrialPost {
  mode: 'hunt'
  seed: string
  level: number
  score: number
}

export type TrialPost = RaceTrialPost | HuntTrialPost

export const MAX_SEED_LENGTH = 64
const MAX_SPLITS = 30
const MIN_RACE_TIME_S = 5 // no legal line crosses the district faster
const MAX_RACE_TIME_S = 3600
const MAX_HUNT_LEVEL = 1000
const MAX_HUNT_SCORE = 1_000_000_000

export function parseTrialPost(body: Record<string, unknown> | null): TrialPost | null {
  if (!body) return null
  const seed = typeof body.seed === 'string' ? body.seed.trim() : ''
  if (seed.length === 0 || seed.length > MAX_SEED_LENGTH) return null

  if (body.mode === 'race') {
    const timeS = body.timeS
    const splits = body.splits
    if (typeof timeS !== 'number' || !Number.isFinite(timeS)) return null
    if (timeS < MIN_RACE_TIME_S || timeS > MAX_RACE_TIME_S) return null
    if (!Array.isArray(splits) || splits.length === 0 || splits.length > MAX_SPLITS) return null
    let prev = 0
    for (const split of splits) {
      if (typeof split !== 'number' || !Number.isFinite(split) || split <= prev) return null
      prev = split
    }
    // the finish gate IS the last split; a mismatch means a stitched-together payload
    if (Math.abs(splits[splits.length - 1]! - timeS) > 0.01) return null
    return { mode: 'race', seed, timeS, splits }
  }

  if (body.mode === 'hunt') {
    const level = body.level
    const score = body.score
    if (typeof level !== 'number' || !Number.isInteger(level) || level < 1 || level > MAX_HUNT_LEVEL) return null
    if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > MAX_HUNT_SCORE) return null
    return { mode: 'hunt', seed, level, score }
  }

  return null
}

/** Lower time takes the race row. */
export function raceImproves(oldTimeS: number, newTimeS: number): boolean {
  return newTimeS < oldTimeS
}

/** Deeper level takes the hunt row; the score breaks ties (tt-001 decision 11). */
export function huntImproves(
  old: { level: number; score: number },
  next: { level: number; score: number },
): boolean {
  return next.level > old.level || (next.level === old.level && next.score > old.score)
}
