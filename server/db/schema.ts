import { boolean, integer, pgTable, primaryKey, real, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull(),
  usernameLower: text('username_lower').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const sessions = pgTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})

export const matches = pgTable('matches', {
  id: uuid('id').primaryKey(),
  roomCode: text('room_code').notNull(),
  seed: text('seed').notNull(),
  playersCount: integer('players_count').notNull(),
  wavesCleared: integer('waves_cleared').notNull(),
  durationS: real('duration_s').notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }).notNull().defaultNow(),
})

export const matchPlayers = pgTable(
  'match_players',
  {
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    score: integer('score').notNull(),
    kills: integer('kills').notNull(),
    deaths: integer('deaths').notNull(),
    mvp: boolean('mvp').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.userId] })],
)
