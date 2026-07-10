import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { MIN_PASSWORD_LENGTH, USERNAME_RE, hashPassword, verifyPassword } from './auth'
import { createDb } from './db/client'
import { readLeaderboard } from './db/matches'
import { users } from './db/schema'
import { createSession, validateSessionToken } from './db/sessions'
import { readTrialBoards, writeTrial } from './db/trials'
import type { Env } from './env'
import { MAX_SEED_LENGTH, parseTrialPost } from './trials'

/** Origins allowed to call the API and open rooms: prod, previews, local dev. */
export function isAllowedOrigin(origin: string): boolean {
  if (origin === 'https://attack-on-titan.magnusrodseth.com') return true
  // this project's Vercel previews only, not any *.vercel.app deployment
  if (/^https:\/\/attack-on-titan-[a-z0-9-]+\.vercel\.app$/.test(origin)) return true
  if (/^http:\/\/localhost(:\d+)?$/.test(origin) || /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return true
  return false
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as Record<string, unknown>
    return typeof body === 'object' && body !== null ? body : null
  } catch {
    return null
  }
}

/** The REST surface, mounted at /api by the worker entry. */
export const api = new Hono<{ Bindings: Env }>()

api.use(
  '*',
  cors({
    // deny = return null so no CORS headers are set, same as the hand-rolled version
    origin: (origin) => (isAllowedOrigin(origin) ? origin : null),
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  }),
)

api.get('/health', (c) => c.json({ ok: true }))

api.post('/register', async (c) => {
  const db = createDb(c.env.DB)
  const body = await readBody(c.req.raw)
  const username = typeof body?.username === 'string' ? body.username.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!USERNAME_RE.test(username)) {
    return c.json({ error: 'Handle must be 3-16 letters, digits, - or _' }, 400)
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return c.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, 400)
  }
  const taken = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.usernameLower, username.toLowerCase()))
    .limit(1)
  if (taken.length > 0) return c.json({ error: 'That handle is already enlisted' }, 409)
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
    return c.json({ token, username }, 201)
  } catch {
    // unique-constraint race: two registrations of the same handle at once
    return c.json({ error: 'That handle is already enlisted' }, 409)
  }
})

api.post('/login', async (c) => {
  const db = createDb(c.env.DB)
  const body = await readBody(c.req.raw)
  const username = typeof body?.username === 'string' ? body.username.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  const rows = await db
    .select({ id: users.id, username: users.username, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.usernameLower, username.toLowerCase()))
    .limit(1)
  const user = rows[0]
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return c.json({ error: 'Wrong handle or password' }, 401)
  }
  const token = await createSession(db, user.id)
  return c.json({ token, username: user.username }, 200)
})

function bearerToken(header: string | undefined): string {
  return header?.startsWith('Bearer ') ? header.slice(7) : ''
}

api.get('/me', async (c) => {
  const token = bearerToken(c.req.header('Authorization'))
  const session = await validateSessionToken(createDb(c.env.DB), token)
  if (!session) return c.json({ error: 'Not signed in' }, 401)
  return c.json({ username: session.username }, 200)
})

api.get('/leaderboard', async (c) => c.json(await readLeaderboard(createDb(c.env.DB)), 200))

// --- time trials (tt-008): logged-in finishes post here; boards read per seed --------

api.post('/trial', async (c) => {
  const db = createDb(c.env.DB)
  const session = await validateSessionToken(db, bearerToken(c.req.header('Authorization')))
  if (!session) return c.json({ error: 'Not signed in' }, 401)
  const post = parseTrialPost(await readBody(c.req.raw))
  if (!post) return c.json({ error: 'Bad trial payload' }, 400)
  return c.json(await writeTrial(db, session.userId, post), 200)
})

api.get('/trials', async (c) => {
  const seed = (c.req.query('seed') ?? '').trim()
  if (seed.length === 0 || seed.length > MAX_SEED_LENGTH) return c.json({ error: 'Bad seed' }, 400)
  return c.json(await readTrialBoards(createDb(c.env.DB), seed), 200)
})
