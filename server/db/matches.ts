import { desc, gt, gte, inArray } from 'drizzle-orm'
import { asc, eq } from 'drizzle-orm'
import type { Leaderboard, LeaderboardSoldier, LeaderboardTeam } from '../../src/net/protocol'
import type { MatchResults } from '../../src/sim/coop'
import type { Db } from './client'
import { matchPlayers, matches, users } from './schema'

/**
 * Persists a finished match. Scores come from the server-side sim, so these rows are
 * the trustworthy source for the global leaderboard. Skips soldiers whose user id is
 * unknown (should not happen; belt and braces).
 */
export async function writeMatch(
  db: Db,
  roomCode: string,
  seed: string,
  results: MatchResults,
  userIdByHandle: Map<string, string>,
): Promise<void> {
  const players = results.players.filter((p) => userIdByHandle.has(p.id))
  if (players.length === 0) return
  const matchId = crypto.randomUUID()
  await db.batch([
    db.insert(matches).values({
      id: matchId,
      roomCode,
      seed,
      playersCount: players.length,
      wavesCleared: results.wavesCleared,
      durationS: Math.round(results.durationS * 10) / 10,
    }),
    ...players.map((p) =>
      db.insert(matchPlayers).values({
        matchId,
        userId: userIdByHandle.get(p.id)!,
        score: p.score,
        kills: p.kills,
        deaths: p.deaths,
        mvp: p.mvp,
      }),
    ),
  ] as unknown as Parameters<Db['batch']>[0])
}

export async function readLeaderboard(db: Db): Promise<Leaderboard> {
  // a "longest stand" needs at least one cleared wave: instant wipes and dev-bot
  // smoke tests would otherwise wallpaper the board with zero-wave rows
  const topMatches = await db
    .select({
      id: matches.id,
      wavesCleared: matches.wavesCleared,
      durationS: matches.durationS,
      endedAt: matches.endedAt,
    })
    .from(matches)
    .where(gte(matches.wavesCleared, 1))
    .orderBy(desc(matches.wavesCleared), asc(matches.durationS))
    .limit(10)

  const rosterRows =
    topMatches.length === 0
      ? []
      : await db
          .select({
            matchId: matchPlayers.matchId,
            username: users.username,
            score: matchPlayers.score,
            mvp: matchPlayers.mvp,
          })
          .from(matchPlayers)
          .innerJoin(users, eq(matchPlayers.userId, users.id))
          .where(
            inArray(
              matchPlayers.matchId,
              topMatches.map((m) => m.id),
            ),
          )

  const teams: LeaderboardTeam[] = topMatches.map((m) => ({
    wavesCleared: m.wavesCleared,
    durationS: m.durationS,
    endedAt: m.endedAt.toISOString(),
    players: rosterRows
      .filter((r) => r.matchId === m.id)
      .sort((a, b) => b.score - a.score)
      .map((r) => ({ username: r.username, score: r.score, mvp: r.mvp })),
  }))

  // a deadliest soldier scored something; zero-score rows are connection tests
  const soldierRows = await db
    .select({
      username: users.username,
      score: matchPlayers.score,
      kills: matchPlayers.kills,
      wavesCleared: matches.wavesCleared,
      endedAt: matches.endedAt,
    })
    .from(matchPlayers)
    .innerJoin(users, eq(matchPlayers.userId, users.id))
    .innerJoin(matches, eq(matchPlayers.matchId, matches.id))
    .where(gt(matchPlayers.score, 0))
    .orderBy(desc(matchPlayers.score), asc(users.username))
    .limit(50)

  // one row per soldier: their single best match, not ten copies of one strong player
  const seen = new Set<string>()
  const soldiers: LeaderboardSoldier[] = []
  for (const row of soldierRows) {
    if (seen.has(row.username)) continue
    seen.add(row.username)
    soldiers.push({ ...row, endedAt: row.endedAt.toISOString() })
    if (soldiers.length === 10) break
  }

  return { teams, soldiers }
}
