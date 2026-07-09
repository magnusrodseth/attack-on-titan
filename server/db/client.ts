import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

/** One db handle per request/connection; neon-http is a stateless fetch under the hood. */
export function createDb(databaseUrl: string) {
  return drizzle(neon(databaseUrl), { schema })
}

export type Db = ReturnType<typeof createDb>
