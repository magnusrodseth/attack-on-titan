import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { MIN_PASSWORD_LENGTH, USERNAME_RE, hashPassword, verifyPassword } from './auth'
import { createDb } from './db/client'
import { readLeaderboard } from './db/matches'
import { users } from './db/schema'
import type { DailyClaimRow } from './db/daily'
import { claimDaily, findClaim, readDailyBoard, readStandings, submitDaily } from './db/daily'
import { createSession, validateSessionToken } from './db/sessions'
import { readTrialBoards, writeTrial } from './db/trials'
import type { Env } from './env'
import { metricForMode, parseDailyResult } from './daily'
import { MAX_SEED_LENGTH, parseTrialPost } from './trials'
import { CONTENT_HASH } from '../src/sim/content'
import { dailyCourseSeed, dailyDate, dailyRoll } from '../src/sim/daily'

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

/**
 * Health, and the one fact you cannot otherwise see from outside: which world this Worker is
 * running. The room refuses a mismatched client (4009) but says nothing about what it *does*
 * hold, so a skewed deploy could only be diagnosed by guessing hashes at the handshake until
 * one got past the gate. Publishing it turns that into a GET — `deployed.test.ts` asserts on it
 * after every deploy, and a human can curl it when the lobby starts refusing people.
 */
api.get('/health', (c) => c.json({ ok: true, content: CONTENT_HASH }))

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

// --- the Daily Expedition (de-007) ---------------------------------------------------
//
// The Worker derives the day and the roll itself and never takes the client's word for either
// (de-003 §4). `dailyDate()` here is the *server's* clock: a client whose machine says it is
// tomorrow does not get tomorrow's expedition, and one that says it is yesterday cannot re-run a
// day it already spent.

/** The sealed course for a date, or null when this Worker has no secret to seal it with. */
function sealedSeed(env: Env, date: string): string | null {
  const secret = env.DAILY_SECRET
  return secret ? dailyCourseSeed(secret, date) : null
}

api.post('/daily/claim', async (c) => {
  const date = dailyDate()
  const seed = sealedSeed(c.env, date)
  // no secret, no orders: the client cannot build the world, so this is the "Headquarters
  // unreachable" path (de-003 §2) and it must read as a service fault, not as the player's fault.
  if (!seed) return c.json({ error: 'Headquarters unreachable' }, 503)

  const orders = dailyRoll(date)
  const metric = metricForMode(orders.modeId)
  if (!metric) return c.json({ error: 'Headquarters unreachable' }, 503)
  const issued = { date, modeId: orders.modeId, mapId: orders.mapId, metric, seed }

  const db = createDb(c.env.DB)
  const session = await validateSessionToken(db, bearerToken(c.req.header('Authorization')))
  // signed out still gets the orders and writes no row (de-003 amendment): the seed is sealed, so
  // without this a signed-out visitor could not generate the world at all — and de-001 says they
  // may run it. They simply cannot post.
  if (!session) return c.json({ ...issued, ranked: false }, 201)

  const { spent, run } = await claimDaily(db, session.userId, orders, seed)
  if (spent) {
    // 409, but with the day attached: the returning player wants to see what they did with it, not
    // a bare refusal. An unposted row here is an abandoned run — the day is gone (de-003 §1).
    return c.json({ ...issued, ranked: false, spent: true, run: postedRun(run) }, 409)
  }
  return c.json({ ...issued, ranked: true }, 201)
})

function postedRun(run: DailyClaimRow): Record<string, unknown> | null {
  if (run.submittedAt === null) return null
  return {
    metric: run.metric,
    timeS: run.timeS,
    level: run.level,
    score: run.score,
    wave: run.wave,
    submittedAt: run.submittedAt.toISOString(),
  }
}

api.post('/daily/submit', async (c) => {
  const db = createDb(c.env.DB)
  const session = await validateSessionToken(db, bearerToken(c.req.header('Authorization')))
  if (!session) return c.json({ error: 'Not signed in' }, 401)

  const body = await readBody(c.req.raw)
  const date = typeof body?.date === 'string' ? body.date : ''
  // the claim row is the authority for what was being played — the body says what it *scored*, not
  // what the discipline was. A result with no claim is rejected outright (de-003 §3): a claim
  // nobody has to hold is decorative.
  const claim = date ? await findClaim(db, session.userId, date) : null
  if (!claim) return c.json({ error: 'No claim for that day' }, 403)

  const result = parseDailyResult(claim.mode, body)
  if (!result) return c.json({ error: 'Bad daily payload' }, 400)

  const splits = Array.isArray(body?.splits) ? (body.splits as number[]) : null
  const outcome = await submitDaily(db, session.userId, date, result, splits)
  if (outcome === 'no-claim') return c.json({ error: 'No claim for that day' }, 403)
  if (outcome === 'already-posted') return c.json({ error: 'That expedition is already on the board' }, 409)
  return c.json({ posted: true }, 200)
})

api.get('/daily/board', async (c) => {
  const today = dailyDate()
  const date = (c.req.query('date') ?? today).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: 'Bad date' }, 400)
  return c.json(await readDailyBoard(createDb(c.env.DB), date, today), 200)
})

api.get('/daily/standings', async (c) =>
  c.json(await readStandings(createDb(c.env.DB), dailyDate()), 200),
)
