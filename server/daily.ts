/**
 * The Daily Expedition, server side (wayfinder de-007): what a result is, how a day is ranked,
 * and what the Standings measure. Pure and unit-tested — the D1 calls live in `server/db/daily.ts`
 * and the routes in `server/api.ts`.
 *
 * The roll itself is NOT here. It is `src/sim/daily.ts`, imported by both the client and this
 * Worker, because de-003 §4 requires the Worker to derive the day's orders itself and never take
 * the client's word for them — and two copies of that formula is a bug waiting to happen.
 */
import type { DailyMetric } from '../src/net/protocol'

/**
 * Which number a discipline is judged on (de-004 §1). Ranking is *data*, not a special case per
 * mode: a new mode adds a row here and the board, the Standings and the wins all keep working.
 */
const METRIC_BY_MODE: Record<string, DailyMetric> = {
  race: 'time', // Signal Run: the clock
  hunt: 'level', // The Culling: how deep you got
  waves: 'score', // Wave Survival: the tally
}

export function metricForMode(modeId: string): DailyMetric | null {
  return METRIC_BY_MODE[modeId] ?? null
}

/** A posted result, already validated. The fields present depend on the metric. */
export interface DailyResult {
  metric: DailyMetric
  timeS: number | null
  level: number | null
  score: number | null
  wave: number | null
}

// the same plausibility envelopes the trials boards have used since tt-008. Solo results come from
// the client sim and always have (the map rules server-authoritative solo out of scope), so these
// are gates against nonsense, not anti-cheat. Do not mistake them for the latter.
const MIN_RACE_TIME_S = 5
const MAX_RACE_TIME_S = 3600
const MAX_HUNT_LEVEL = 1000
const MAX_SCORE = 1_000_000_000
const MAX_WAVE = 1000

/**
 * Read a result for a run of `modeId`. The mode comes from the **claim row**, never from the
 * body: the client says what it scored, not what it was playing. A payload whose numbers do not
 * fit the discipline it claimed is rejected rather than coerced.
 */
export function parseDailyResult(modeId: string, body: Record<string, unknown> | null): DailyResult | null {
  if (!body) return null
  const metric = metricForMode(modeId)
  if (!metric) return null

  if (metric === 'time') {
    const timeS = body.timeS
    if (typeof timeS !== 'number' || !Number.isFinite(timeS)) return null
    if (timeS < MIN_RACE_TIME_S || timeS > MAX_RACE_TIME_S) return null
    return { metric, timeS, level: null, score: null, wave: null }
  }

  if (metric === 'level') {
    const level = body.level
    const score = body.score
    if (typeof level !== 'number' || !Number.isInteger(level) || level < 1 || level > MAX_HUNT_LEVEL) return null
    if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > MAX_SCORE) return null
    return { metric, timeS: null, level, score, wave: null }
  }

  const score = body.score
  const wave = body.wave
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > MAX_SCORE) return null
  if (typeof wave !== 'number' || !Number.isInteger(wave) || wave < 0 || wave > MAX_WAVE) return null
  return { metric, timeS: null, level: null, score, wave }
}

/** A row as the board ranks it: the result, plus who and when. */
export interface RankableRun {
  username: string
  metric: DailyMetric
  timeS: number | null
  level: number | null
  score: number | null
  wave: number | null
  /** ms since epoch; the universal tiebreak is "got there first". */
  submittedAt: number
}

/**
 * Order one day's runs (de-004 §1).
 *
 *   | metric | ranks by | tiebreak            |
 *   | time   | lowest   | earliest submitted  |
 *   | level  | highest  | score, then earliest|
 *   | score  | highest  | wave, then earliest |
 *
 * Every day's rows share a metric (a day has one discipline), so the comparator reads it off the
 * first row rather than re-deciding per pair. Sorting is done here, in TypeScript, and not in SQL
 * on purpose: the metric table would otherwise have to exist twice, once as this table and once as
 * a CASE expression, and de-003 §4 already paid for learning what two copies of a rule costs.
 */
export function rankDay(runs: readonly RankableRun[]): RankableRun[] {
  return [...runs].sort((a, b) => {
    if (a.metric === 'time') {
      const at = a.timeS ?? Infinity
      const bt = b.timeS ?? Infinity
      if (at !== bt) return at - bt
    } else if (a.metric === 'level') {
      const al = a.level ?? -1
      const bl = b.level ?? -1
      if (al !== bl) return bl - al
      const as = a.score ?? -1
      const bs = b.score ?? -1
      if (as !== bs) return bs - as
    } else {
      const as = a.score ?? -1
      const bs = b.score ?? -1
      if (as !== bs) return bs - as
      const aw = a.wave ?? -1
      const bw = b.wave ?? -1
      if (aw !== bw) return bw - aw
    }
    if (a.submittedAt !== b.submittedAt) return a.submittedAt - b.submittedAt
    return a.username.localeCompare(b.username)
  })
}

const DAY_MS = 86_400_000

/** The UTC date `n` days before `date`. */
function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = Date.UTC(y!, m! - 1, d!) + days * DAY_MS
  const dt = new Date(t)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

/**
 * Consecutive UTC days ending in a *posted result* (de-004 §3). A streak is kept by finishing,
 * not by showing up: this counts submissions, and an abandoned claim is simply not in the set.
 *
 * It is alive if the newest result is today **or** yesterday — you have until UTC midnight to keep
 * it. Anything older is a broken streak and reads zero. That "or yesterday" is the whole reason
 * this is not a one-liner: a player mid-streak who has not run *yet today* must not be told their
 * streak is gone, or they will believe it and stop.
 */
export function currentStreak(datesWithResults: readonly string[], today: string): number {
  const days = new Set(datesWithResults)
  const yesterday = shiftDate(today, -1)
  // anchor on today if they have already run, else on yesterday — beyond that the chain is broken
  let cursor = days.has(today) ? today : days.has(yesterday) ? yesterday : null
  if (cursor === null) return 0
  let streak = 0
  while (days.has(cursor)) {
    streak += 1
    cursor = shiftDate(cursor, -1)
  }
  return streak
}

/** One soldier's line in the Standings (de-004 §4). No podium column until the field earns one. */
export interface StandingsRow {
  username: string
  /** days claimed: you took the field. */
  expeditions: number
  /** days with a posted result. The gap to `expeditions` is exactly the abandoned runs, on purpose. */
  finished: number
  /** rank 1 on a *closed* day. Today is provisional and credits nobody (de-004 §2). */
  won: number
  streak: number
}

export interface StandingsInput {
  username: string
  /** every date this soldier claimed. */
  claimed: readonly string[]
  /** every date they posted a result on. */
  finished: readonly string[]
  /** closed dates they topped. */
  won: readonly string[]
}

/**
 * The Standings, ordered. Wins first, because that is the thing the mode is *about*; then the
 * streak (the number a player comes back for), then how many they have actually finished.
 */
export function buildStandings(rows: readonly StandingsInput[], today: string): StandingsRow[] {
  return rows
    .map((r) => ({
      username: r.username,
      expeditions: r.claimed.length,
      finished: r.finished.length,
      won: r.won.length,
      streak: currentStreak(r.finished, today),
    }))
    .sort(
      (a, b) =>
        b.won - a.won ||
        b.streak - a.streak ||
        b.finished - a.finished ||
        a.username.localeCompare(b.username),
    )
}
