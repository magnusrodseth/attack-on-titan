---
type: wayfinder:task
status: closed
assignee: claude (2026-07-14)
blocked-by: []
---

## Resolution (built 2026-07-14, on main)

`server/daily.ts` (pure, 22 tests), `server/db/daily.ts` (D1), four routes in `server/api.ts`,
`daily_runs` + migration `0002_high_maelstrom.sql` (applied to the remote D1), `DAILY_SECRET` set
on the Worker.

1. **The metric table is data** (de-004 §1), and a guard test walks `DAILY_MODE_IDS` and fails if a
   mode can roll without saying what it is judged on — otherwise a new mode would silently rank
   every runner equal.
2. **Ranking and the win rule live in TypeScript, not SQL.** "Won" is rank-1 on a closed day, which
   is the *same* comparator the board sorts with; writing it a second time as a SQL CASE is the
   duplicated-formula bug de-003 §4 exists to prevent. Aggregated live per de-004 §5.
3. **The double-write** (de-004 §6) goes back through `parseTrialPost`, so the PB board keeps its
   own plausibility gates instead of being written behind them. A malformed splits array drops the
   *trial* row and still posts the daily: a bad payload must not cost a player the day they ran.
   **Wave Survival double-writes nothing** — the trials table only knows race and hunt, and a row
   nothing reads is the placebo defect this repo keeps killing.
4. **A missing `DAILY_SECRET` degrades, it does not 500.** No secret → 503 "Headquarters
   unreachable", which is exactly the state de-003 §2 already designed a UI for. Verified by
   accident: the first local run had the var in the wrong place and produced precisely that.
5. **Verified against a real Worker**, not just unit tests: `wrangler dev` + a migrated local D1,
   driven end to end — claim (201, sealed seed) → second claim (409, spent) → signed-out claim
   (201, unranked, no row) → submit (200) → resubmit (409) → submit with no claim (403) → board
   ranks by depth over score → double-write lands on the arena's PB board → an abandoned claim
   shows as the expeditions/finished gap with a zeroed streak → a seeded closed day credits the win
   while today's leader is credited nothing (provisional, no cron).

## Original scope

Build the worker: schema, claim, submit, board, standings.

Graduated from fog once de-003 and de-004 settled. Blocked by de-006 only because the worker
imports its roll module.

- **Schema** (`server/db/schema.ts` + a drizzle migration): `daily_runs`, keyed `(user_id, date)`.
  Columns: `claimed_at`, the authoritative `mode` / `map` / `seed` stamped at claim, then nullable
  `metric` + value columns and `submitted_at`. The **date** is the key, not the seed.
- **`DAILY_SECRET`** worker env var: the seed is `hashSeed(DAILY_SECRET + ':' + date)` (de-002
  amendment). Unguessable, stateless, and never sent until claimed.
- **`POST /api/daily/claim`** → 201 with the orders (mode, map, seed) / 409 already spent, with the
  posted run attached so the UI can show it. Signed-out: returns orders, writes no row (de-003
  amendment).
- **`POST /api/daily/submit`** → requires a claim row for that (account, date); rejects a result
  with no claim. **Double-writes** the result to the existing `trials` table (de-004 §6) so the
  course's keep-best PB board fills too.
- **`GET /api/daily/board?date=`** → today's rows joined to usernames, ranked by the metric table
  (de-004 §1). Fetched **by date, not by seed** — the seed is still sealed while the day is live.
  Today's board is flagged provisional; wins are rank-at-read for dates < today, no cron.
- **`GET /api/daily/standings`** → live aggregate: expeditions (claims), finished (results), won
  (rank-1 on closed dates), current streak (consecutive UTC days with a result, alive if the last
  result is today or yesterday). No podium column yet — but keep every result row so podiums can
  be backfilled (de-004 §4).
- Reuse the existing plausibility gates in `server/trials.ts` (`parseTrialPost`); solo results come
  from the client sim and always have. Do not invent anti-cheat here — the map rules it out of
  scope.
- Tests colocated like `server/trials.test.ts`. ~~Deploy is `pnpm server:deploy` (the worker does
  NOT auto-deploy with the Vercel front end — a forgotten deploy is the classic bug in this
  repo).~~ **No longer true as of 2026-07-14**: the Worker now ships on the same push as the client
  (`.github/workflows/deploy-worker.yml`) and CI asserts the deployed world matches the commit. The
  classic bug bit one last time that morning (the civilians revert shipped a client the Worker had
  never heard of, and every co-op lobby was refused for hours) and was fixed at the source.
