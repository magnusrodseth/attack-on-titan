import { and, asc, desc, eq } from 'drizzle-orm'
import type { TrialBoards } from '../../src/net/protocol'
import type { TrialPost } from '../trials'
import { huntImproves, raceImproves } from '../trials'
import type { Db } from './client'
import { trials, users } from './schema'

/** Upserts a soldier's row for (mode, seed), keeping the better result. */
export async function writeTrial(
  db: Db,
  userId: string,
  post: TrialPost,
): Promise<{ improved: boolean }> {
  const key = and(eq(trials.userId, userId), eq(trials.mode, post.mode), eq(trials.seed, post.seed))
  const existing = await db
    .select({ timeS: trials.timeS, level: trials.level, score: trials.score })
    .from(trials)
    .where(key)
    .limit(1)
  const row = existing[0]

  const values =
    post.mode === 'race'
      ? { timeS: post.timeS, splits: JSON.stringify(post.splits) }
      : { level: post.level, score: post.score }

  if (!row) {
    await db.insert(trials).values({ userId, mode: post.mode, seed: post.seed, ...values })
    return { improved: true }
  }
  const improves =
    post.mode === 'race'
      ? row.timeS !== null && raceImproves(row.timeS, post.timeS)
      : row.level !== null && huntImproves({ level: row.level, score: row.score ?? 0 }, post)
  if (!improves) return { improved: false }
  await db
    .update(trials)
    .set({ ...values, updatedAt: new Date() })
    .where(key)
  return { improved: true }
}

/** Top-10 boards for one seed: race by time, hunt by depth with score tiebreak. */
export async function readTrialBoards(db: Db, seed: string): Promise<TrialBoards> {
  const race = await db
    .select({ username: users.username, timeS: trials.timeS, endedAt: trials.updatedAt })
    .from(trials)
    .innerJoin(users, eq(trials.userId, users.id))
    .where(and(eq(trials.mode, 'race'), eq(trials.seed, seed)))
    .orderBy(asc(trials.timeS), asc(users.username))
    .limit(10)

  const hunt = await db
    .select({
      username: users.username,
      level: trials.level,
      score: trials.score,
      endedAt: trials.updatedAt,
    })
    .from(trials)
    .innerJoin(users, eq(trials.userId, users.id))
    .where(and(eq(trials.mode, 'hunt'), eq(trials.seed, seed)))
    .orderBy(desc(trials.level), desc(trials.score), asc(users.username))
    .limit(10)

  return {
    race: race.map((r) => ({
      username: r.username,
      timeS: r.timeS ?? 0,
      endedAt: r.endedAt.toISOString(),
    })),
    hunt: hunt.map((r) => ({
      username: r.username,
      level: r.level ?? 0,
      score: r.score ?? 0,
      endedAt: r.endedAt.toISOString(),
    })),
  }
}
