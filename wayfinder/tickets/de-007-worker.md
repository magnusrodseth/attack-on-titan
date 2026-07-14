---
type: wayfinder:task
status: open
assignee: 
blocked-by: [de-006]
---

## Question

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
- Tests colocated like `server/trials.test.ts`. Deploy is `pnpm server:deploy` (the worker does NOT
  auto-deploy with the Vercel front end — a forgotten deploy is the classic bug in this repo).
