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
