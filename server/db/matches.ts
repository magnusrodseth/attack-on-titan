import { desc, inArray } from 'drizzle-orm'
import { asc, eq } from 'drizzle-orm'
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

export interface LeaderboardTeam {
  wavesCleared: number
  durationS: number
  endedAt: string
  players: { username: string; score: number; mvp: boolean }[]
}

export interface LeaderboardSoldier {
  username: string
  score: number
  kills: number
  wavesCleared: number
  endedAt: string
}

export interface Leaderboard {
  teams: LeaderboardTeam[]
  soldiers: LeaderboardSoldier[]
}

export async function readLeaderboard(db: Db): Promise<Leaderboard> {
  const topMatches = await db
    .select({
      id: matches.id,
      wavesCleared: matches.wavesCleared,
      durationS: matches.durationS,
      endedAt: matches.endedAt,
    })
    .from(matches)
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
    .orderBy(desc(matchPlayers.score))
    .limit(10)

  return {
    teams,
    soldiers: soldierRows.map((r) => ({ ...r, endedAt: r.endedAt.toISOString() })),
  }
}
