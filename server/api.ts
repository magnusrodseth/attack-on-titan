import { eq } from 'drizzle-orm'
import { MIN_PASSWORD_LENGTH, USERNAME_RE, hashPassword, verifyPassword } from './auth'
import { createDb } from './db/client'
import { readLeaderboard } from './db/matches'
import { users } from './db/schema'
import { createSession, validateSessionToken } from './db/sessions'
import type { Env } from './env'

/** Origins allowed to call the API and open rooms: prod, previews, local dev. */
export function isAllowedOrigin(origin: string): boolean {
  if (origin === 'https://attack-on-titan.magnusrodseth.com') return true
  if (/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.vercel\.app$/.test(origin)) return true
  if (/^http:\/\/localhost(:\d+)?$/.test(origin) || /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return true
  return false
}

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('Origin') ?? ''
  if (!isAllowedOrigin(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  }
}

function json(request: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
  })
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as Record<string, unknown>
    return typeof body === 'object' && body !== null ? body : null
  } catch {
    return null
  }
}

function bearerToken(request: Request): string {
  const header = request.headers.get('Authorization') ?? ''
  return header.startsWith('Bearer ') ? header.slice(7) : ''
}

export async function handleApi(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) })
  }
  const path = new URL(request.url).pathname
  const db = createDb(env.DATABASE_URL)

  if (path === '/api/health') return json(request, 200, { ok: true })

  if (path === '/api/register' && request.method === 'POST') {
    const body = await readBody(request)
    const username = typeof body?.username === 'string' ? body.username.trim() : ''
    const password = typeof body?.password === 'string' ? body.password : ''
    if (!USERNAME_RE.test(username)) {
      return json(request, 400, { error: 'Handle must be 3-16 letters, digits, - or _' })
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return json(request, 400, { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` })
    }
    const taken = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.usernameLower, username.toLowerCase()))
      .limit(1)
    if (taken.length > 0) return json(request, 409, { error: 'That handle is already enlisted' })
    try {
      const inserted = await db
        .insert(users)
        .values({
          username,
          usernameLower: username.toLowerCase(),
          passwordHash: await hashPassword(password),
        })
        .returning({ id: users.id })
      const token = await createSession(db, inserted[0]!.id)
      return json(request, 201, { token, username })
    } catch {
      // unique-constraint race: two registrations of the same handle at once
      return json(request, 409, { error: 'That handle is already enlisted' })
    }
  }

  if (path === '/api/login' && request.method === 'POST') {
    const body = await readBody(request)
    const username = typeof body?.username === 'string' ? body.username.trim() : ''
    const password = typeof body?.password === 'string' ? body.password : ''
    const rows = await db
      .select({ id: users.id, username: users.username, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.usernameLower, username.toLowerCase()))
      .limit(1)
    const user = rows[0]
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return json(request, 401, { error: 'Wrong handle or password' })
    }
    const token = await createSession(db, user.id)
    return json(request, 200, { token, username: user.username })
  }

  if (path === '/api/me' && request.method === 'GET') {
    const session = await validateSessionToken(db, bearerToken(request))
    if (!session) return json(request, 401, { error: 'Not signed in' })
    return json(request, 200, { username: session.username })
  }

  if (path === '/api/leaderboard' && request.method === 'GET') {
    return json(request, 200, await readLeaderboard(db))
  }

  return json(request, 404, { error: 'Not found' })
}
