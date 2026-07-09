import { eq } from 'drizzle-orm'
import { SESSION_TTL_MS, newSessionToken, sha256Hex } from '../auth'
import type { Db } from './client'
import { sessions, users } from './schema'

export interface SessionUser {
  userId: string
  username: string
}

/** Creates a session row and returns the bearer token (never stored in the clear). */
export async function createSession(db: Db, userId: string): Promise<string> {
  const token = newSessionToken()
  await db.insert(sessions).values({
    tokenHash: await sha256Hex(token),
    userId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  })
  return token
}

export async function validateSessionToken(db: Db, token: string): Promise<SessionUser | null> {
  if (!token) return null
  const rows = await db
    .select({ userId: users.id, username: users.username, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, await sha256Hex(token)))
    .limit(1)
  const row = rows[0]
  if (!row || row.expiresAt.getTime() < Date.now()) return null
  return { userId: row.userId, username: row.username }
}
