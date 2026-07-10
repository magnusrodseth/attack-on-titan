---
type: wayfinder:task
status: closed
assignee: claude (worktree-timetrials session, 2026-07-10)
blocked-by: [tt-003, tt-006]
---

## Question

Extend the existing D1 + Drizzle + Hono stack with time-trial boards: schema slice + API
routes for posting a finished run when logged in — Signal Run times (with splits) and Culling
results (deepest level, score tiebreak) — keyed by (mode, seed), per-handle dedupe keeping
the best. Leaderboard panel gains time-trial views for the seed you're on; the menu surfaces
a featured seed (manually chosen for v1) so global times contest the same course. Logged-out
play stays fully functional on localStorage. Needs `pnpm server:deploy` and prod
verification; also resolves the multiplayer map's "posting solo runs when logged in" fog for
these modes.

## Resolution

Schema, API, client and panel are built and verified against a local `wrangler dev` +
local D1; **`pnpm server:deploy` + prod verification are deliberately deferred to the
ship step (tt-010)** so the worker and client land together.

- **Schema** (`server/db/schema.ts`, migration `0001_secret_madame_masque.sql`): `trials`
  table keyed `(user_id, mode, seed)` — race rows carry `time_s` + JSON `splits`, hunt
  rows carry `level` + `score`. The primary key IS the per-handle dedupe; "best" is
  decided before writing.
- **Rules** (`server/trials.ts`, unit-tested): `parseTrialPost` validates shape and
  plausibility (race 5 s–1 h with strictly-ascending splits whose last equals the time;
  hunt integer level 1–1000, score 0–1e9); `raceImproves` (strictly faster) and
  `huntImproves` (deeper, score tiebreak) own keep-best. Solo trials are client-reported
  — these are plausibility gates, not anti-cheat (unlike co-op, where the server sim owns
  scores).
- **API** (`server/api.ts`): `POST /api/trial` (Bearer session; 401/400 verified) and
  `GET /api/trials?seed=` returning top-10 `{race, hunt}` boards per seed.
- **Client** (`src/net/client.ts` + `main.ts`): fire-and-forget `postTrial` on
  `raceFinished` and on hunt run-over (deepest cleared + final score, only when a level
  was cleared); skipped in co-op/playground/autopilot and when logged out — localStorage
  PBs remain the offline experience. `fetchTrials(seed)` feeds the leaderboard panel.
- **Panel + menu**: the Hall of the Fallen gains a per-seed "Time trials on this course"
  section (Signal Run fastest / The Culling deepest, skeleton + empty states); the menu
  gains a Featured Course button (`FEATURED_SEED = 'shiganshina'`, manual v1) that swaps
  the seed and disables with a check when you are already on it.
- **Verified locally end-to-end**: migrations applied to local D1; register → post →
  keep-best rejection → boards via curl; a signed-in headless browser run finished a race
  and its post appeared ranked on the board; panel screenshot on the featured seed.
- Graduates the multiplayer map's "posting solo runs when logged in" fog for these two
  modes (noted there); waves/matchday solo posting stays fog.
