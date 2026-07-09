import { drizzle } from 'drizzle-orm/d1'
import * as schema from './schema'

/** D1 is a Worker binding: no connection strings, no secrets, local dev included. */
export function createDb(d1: D1Database) {
  return drizzle(d1, { schema })
}

export type Db = ReturnType<typeof createDb>
