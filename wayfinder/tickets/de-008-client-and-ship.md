---
type: wayfinder:task
status: open
assignee: 
blocked-by: [de-005, de-007]
---

## Question

Build the client to the settled shape, verify it in a real browser, and ship it.

- **Menu**: the daily plate, the sealed-orders state, the commitment warning, the spent state and
  the streak — all to the shape de-005 settles. `src/hud.ts` + `index.html`.
- **The run**: Restart Run suppressed on a daily; a refresh resumes it as a daily (the run-save
  flag from de-006); the result routes to `POST /api/daily/submit` on death or finish.
- **The local mark**: set on *any* daily deploy — ranked, unranked or signed-out (de-003) — and
  the client refuses to claim a date it has already marked.
- **Hall of the Fallen**: daily board + Standings on top; the per-arena trial boards render only on
  a contested course (the daily's, or a shared `?seed=`), and are replaced by your own PBs on an
  unshared random seed (de-004 §6).
- **The three unhappy states** (signed out / headquarters unreachable / already spent with no save)
  must each explain themselves rather than present a dead button.
- **Verify in a real browser** (repo rule: `src/render`, `src/hud.ts` and `main.ts` are untested by
  unit tests and verified live). Drive `window.__aot`, and E2E the whole thing against a local
  `wrangler dev` + a seeded D1: claim → run → submit → board → standings → 409 on a second claim.
  Cover the abandoned run (claim, close the tab, confirm nothing posts and the streak breaks).
- **Ship**: `pnpm test` + `pnpm typecheck` green, merge to main (auto-deploys to Vercel), and
  **`pnpm server:deploy` for the worker** — it does not ride the front-end deploy.
- **Graduate**: delete the Daily entry from IDEAS.md's "Graduated to the wayfinder" section once
  this is live, and record the decision on `wayfinder/map.md` (the solo map) the way the other
  shipped efforts are.
