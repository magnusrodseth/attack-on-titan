export interface Env {
  MatchRoom: DurableObjectNamespace
  DB: D1Database
  /**
   * The Daily Expedition's sealed orders (de-002 amendment, de-007). Today's course seed is
   * `hashSeed(DAILY_SECRET + ':' + date)` — unguessable without this, reproducible with it, and
   * stored in no table. A player only ever learns the seed by claiming the day, which is the whole
   * mechanism stopping the course being rehearsed before the one attempt is spent.
   *
   * Optional on the type on purpose: a Worker deployed without it must not take the mode down. The
   * claim degrades to "Headquarters unreachable" (de-003 §2) — playable, unranked, and it says so.
   */
  DAILY_SECRET?: string
}
