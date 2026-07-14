import { integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  username: text('username').notNull(),
  usernameLower: text('username_lower').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
})

export const sessions = sqliteTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
})

export const matches = sqliteTable('matches', {
  id: text('id').primaryKey(),
  roomCode: text('room_code').notNull(),
  seed: text('seed').notNull(),
  playersCount: integer('players_count').notNull(),
  wavesCleared: integer('waves_cleared').notNull(),
  durationS: real('duration_s').notNull(),
  endedAt: integer('ended_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
})

/**
 * Time-trial boards (tt-008): one row per (soldier, mode, seed) holding their best —
 * fastest race time (with splits) or deepest hunt level with score tiebreak. Dedupe is
 * the primary key; "best" is decided in server/trials.ts before writing.
 */
export const trials = sqliteTable(
  'trials',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    mode: text('mode').notNull(), // 'race' | 'hunt'
    seed: text('seed').notNull(),
    timeS: real('time_s'), // race only
    splits: text('splits'), // race only, JSON number[]
    level: integer('level'), // hunt only: deepest level fully cleared
    score: integer('score'), // hunt only: tiebreak
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.userId, t.mode, t.seed] })],
)

/**
 * The Daily Expedition (de-003 §5, de-007): one row per (soldier, UTC date). The claim inserts it;
 * the submit fills the result in.
 *
 * **The date is the key, not the seed.** A day's discipline can change under a row (it never does
 * retroactively, but the schema should not depend on that), the board query is a single date scan,
 * and "one attempt per soldier per day" becomes a primary key rather than a rule someone has to
 * remember to enforce.
 *
 * The orders (`mode` / `map` / `seed`) are stamped here **at claim time** and are authoritative:
 * the submit is validated against this row, never against what the client says it was playing.
 *
 * The result columns are nullable because a claim with no result is the whole point — an abandoned
 * run is a row with `submittedAt` null, and the gap between claims and results is exactly what the
 * Standings show as the difference between `expeditions` and `finished` (de-004 §4).
 */
export const dailyRuns = sqliteTable(
  'daily_runs',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: text('date').notNull(), // UTC 'YYYY-MM-DD'
    claimedAt: integer('claimed_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    mode: text('mode').notNull(), // authoritative, stamped at claim
    map: text('map').notNull(),
    seed: text('seed').notNull(),
    metric: text('metric'), // 'time' | 'level' | 'score' — null until a result lands
    timeS: real('time_s'),
    level: integer('level'),
    score: integer('score'),
    wave: integer('wave'),
    submittedAt: integer('submitted_at', { mode: 'timestamp_ms' }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
)

export const matchPlayers = sqliteTable(
  'match_players',
  {
    matchId: text('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    score: integer('score').notNull(),
    kills: integer('kills').notNull(),
    deaths: integer('deaths').notNull(),
    mvp: integer('mvp', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.userId] })],
)
