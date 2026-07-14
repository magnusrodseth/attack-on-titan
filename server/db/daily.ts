import { and, eq, isNotNull } from 'drizzle-orm'
import type { DailyBoard, DailyBoardEntry, StandingsEntry } from '../../src/net/protocol'
import { dailyRoll } from '../../src/sim/daily'
import { mapScopedSeed } from '../../src/sim/maps'
import type { DailyResult, RankableRun } from '../daily'
import { buildStandings, metricForMode, rankDay } from '../daily'
import type { TrialPost } from '../trials'
import { parseTrialPost } from '../trials'
import type { Db } from './client'
import { dailyRuns, users } from './schema'
import { writeTrial } from './trials'

/** The row as claimed: the orders are authoritative from here on. */
export interface DailyClaimRow {
  date: string
  mode: string
  map: string
  seed: string
  submittedAt: Date | null
  metric: string | null
  timeS: number | null
  level: number | null
  score: number | null
  wave: number | null
}

const claimColumns = {
  date: dailyRuns.date,
  mode: dailyRuns.mode,
  map: dailyRuns.map,
  seed: dailyRuns.seed,
  submittedAt: dailyRuns.submittedAt,
  metric: dailyRuns.metric,
  timeS: dailyRuns.timeS,
  level: dailyRuns.level,
  score: dailyRuns.score,
  wave: dailyRuns.wave,
}

export async function findClaim(db: Db, userId: string, date: string): Promise<DailyClaimRow | null> {
  const rows = await db
    .select(claimColumns)
    .from(dailyRuns)
    .where(and(eq(dailyRuns.userId, userId), eq(dailyRuns.date, date)))
    .limit(1)
  return rows[0] ?? null
}

/**
 * Take the field (de-003). The row IS the attempt: it exists, so the day is spent — whether or not
 * a result ever lands on it. There is no unclaim and no heartbeat, deliberately, because that is
 * what makes rage-quitting pointless (quitting costs you the run *and* the placement).
 *
 * Already claimed → the existing row comes back so the UI can show what you did with the day
 * rather than a bare 409.
 */
export async function claimDaily(
  db: Db,
  userId: string,
  orders: { date: string; modeId: string; mapId: string },
  seed: string,
): Promise<{ spent: boolean; run: DailyClaimRow }> {
  const existing = await findClaim(db, userId, orders.date)
  if (existing) return { spent: true, run: existing }

  // onConflictDoNothing, not a bare insert: two clicks on Deploy race each other, and the primary
  // key is the thing enforcing one-attempt-per-day. Losing that race must be a no-op, not a 500.
  await db
    .insert(dailyRuns)
    .values({ userId, date: orders.date, mode: orders.modeId, map: orders.mapId, seed })
    .onConflictDoNothing()

  const run = await findClaim(db, userId, orders.date)
  return { spent: false, run: run ?? { ...orders, date: orders.date, mode: orders.modeId, map: orders.mapId, seed, submittedAt: null, metric: null, timeS: null, level: null, score: null, wave: null } }
}

export type SubmitOutcome = 'posted' | 'no-claim' | 'already-posted'

/**
 * Post a result against a claim (de-007). A result with no claim row is rejected outright — a
 * claim nobody has to hold is decorative, and de-003 §3 says so.
 *
 * The result also **double-writes to `trials`** (de-004 §6): the daily is one-attempt, but the
 * *course* is a normal keep-best PB board, and the daily's course is the one course a crowd
 * contests each day. Same run, two honest readings — and it is what keeps the per-arena boards
 * from reading "no times on this course yet" once free play rolls a random seed.
 *
 * Wave Survival double-writes nothing: there is no per-arena board for it (the trials table only
 * knows race and hunt). Writing a row nothing reads is the placebo defect this repo keeps killing.
 */
export async function submitDaily(
  db: Db,
  userId: string,
  date: string,
  result: DailyResult,
  splits: number[] | null,
): Promise<SubmitOutcome> {
  const claim = await findClaim(db, userId, date)
  if (!claim) return 'no-claim'
  if (claim.submittedAt !== null) return 'already-posted'

  await db
    .update(dailyRuns)
    .set({
      metric: result.metric,
      timeS: result.timeS,
      level: result.level,
      score: result.score,
      wave: result.wave,
      submittedAt: new Date(),
    })
    .where(and(eq(dailyRuns.userId, userId), eq(dailyRuns.date, date)))

  const scope = mapScopedSeed(claim.map, claim.seed)
  const candidate: Record<string, unknown> | null =
    claim.mode === 'race'
      ? { mode: 'race', seed: scope, timeS: result.timeS, splits }
      : claim.mode === 'hunt'
        ? { mode: 'hunt', seed: scope, level: result.level, score: result.score ?? 0 }
        : null
  // back through the trials gates rather than straight into the table: the PB board has had its own
  // plausibility rules since tt-008 and they should not be bypassed just because the run came in via
  // the daily. If the double-write fails its own validation it is dropped, and the daily result
  // still stands — a bad splits array must not cost a player the day they actually ran.
  const trial: TrialPost | null = candidate ? parseTrialPost(candidate) : null
  if (trial) await writeTrial(db, userId, trial)

  return 'posted'
}

/**
 * Today's board, fetched **by date, not by seed** (de-004): while the day is live the seed is still
 * sealed, so the client cannot ask for the board by course — but it must still be able to see who
 * is ahead of it, because that is half the reason to run the thing.
 *
 * The mode and arena come from the roll, not from the rows: an empty board still has to announce
 * what today's expedition IS.
 */
export async function readDailyBoard(db: Db, date: string, today: string): Promise<DailyBoard> {
  const orders = dailyRoll(date)
  const metric = metricForMode(orders.modeId)

  const rows = await db
    .select({
      username: users.username,
      metric: dailyRuns.metric,
      timeS: dailyRuns.timeS,
      level: dailyRuns.level,
      score: dailyRuns.score,
      wave: dailyRuns.wave,
      submittedAt: dailyRuns.submittedAt,
    })
    .from(dailyRuns)
    .innerJoin(users, eq(dailyRuns.userId, users.id))
    .where(and(eq(dailyRuns.date, date), isNotNull(dailyRuns.submittedAt)))

  const rankable: RankableRun[] = rows.map((r) => ({
    username: r.username,
    metric: (r.metric ?? metric ?? 'score') as RankableRun['metric'],
    timeS: r.timeS,
    level: r.level,
    score: r.score,
    wave: r.wave,
    submittedAt: r.submittedAt?.getTime() ?? 0,
  }))

  const entries: DailyBoardEntry[] = rankDay(rankable).map((r) => ({
    username: r.username,
    metric: r.metric,
    timeS: r.timeS,
    level: r.level,
    score: r.score,
    wave: r.wave,
    submittedAt: new Date(r.submittedAt).toISOString(),
  }))

  return {
    date,
    modeId: orders.modeId,
    mapId: orders.mapId,
    metric: metric ?? 'score',
    // a live day credits nobody: wins are rank-at-read on *closed* days (de-004 §2), which is why
    // there is no cron anywhere in this feature.
    provisional: date >= today,
    entries,
  }
}

/**
 * The Standings: expeditions, finished, won, streak (de-004 §4).
 *
 * Read every row and aggregate in TypeScript rather than in SQL. Two reasons, and neither is
 * laziness: the win rule ("rank 1 on a closed day") is the *same* metric table the board ranks
 * with, and expressing it a second time as a SQL CASE is exactly the duplicated-formula bug de-003
 * §4 was written to prevent; and de-004 §5 already settled that this is computed live at hobby
 * scale, one source of truth, revisit only if it is ever actually slow.
 */
export async function readStandings(db: Db, today: string): Promise<StandingsEntry[]> {
  const rows = await db
    .select({
      username: users.username,
      date: dailyRuns.date,
      metric: dailyRuns.metric,
      timeS: dailyRuns.timeS,
      level: dailyRuns.level,
      score: dailyRuns.score,
      wave: dailyRuns.wave,
      submittedAt: dailyRuns.submittedAt,
    })
    .from(dailyRuns)
    .innerJoin(users, eq(dailyRuns.userId, users.id))

  const claimed = new Map<string, string[]>()
  const finished = new Map<string, string[]>()
  const byDate = new Map<string, RankableRun[]>()

  for (const r of rows) {
    push(claimed, r.username, r.date)
    if (r.submittedAt === null) continue
    push(finished, r.username, r.date)
    // only closed days can be won; today is provisional and credits nobody
    if (r.date >= today) continue
    const run: RankableRun = {
      username: r.username,
      metric: (r.metric ?? 'score') as RankableRun['metric'],
      timeS: r.timeS,
      level: r.level,
      score: r.score,
      wave: r.wave,
      submittedAt: r.submittedAt.getTime(),
    }
    const day = byDate.get(r.date)
    if (day) day.push(run)
    else byDate.set(r.date, [run])
  }

  const won = new Map<string, string[]>()
  for (const [date, runs] of byDate) {
    const top = rankDay(runs)[0]
    if (top) push(won, top.username, date)
  }

  const names = new Set([...claimed.keys()])
  return buildStandings(
    [...names].map((username) => ({
      username,
      claimed: claimed.get(username) ?? [],
      finished: finished.get(username) ?? [],
      won: won.get(username) ?? [],
    })),
    today,
  )
}

function push(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}
