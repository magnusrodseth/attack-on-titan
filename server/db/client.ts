import { neon, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

/** One db handle per request/connection; neon-http is a stateless fetch under the hood. */
export function createDb(databaseUrl: string) {
  if (/db\.localtest\.me|localhost|127\.0\.0\.1/.test(databaseUrl)) {
    // local dev: a Docker Postgres behind the local-neon-http-proxy (port 4446)
    neonConfig.fetchEndpoint = (host) => `http://${host}:4446/sql`
  }
  return drizzle(neon(databaseUrl), { schema })
}

export type Db = ReturnType<typeof createDb>
