---
type: wayfinder:task
status: open
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
