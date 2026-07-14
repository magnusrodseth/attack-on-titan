---
type: wayfinder:task
status: open
assignee: 
blocked-by: [de-005, de-007]
---

## Question

Build the client to the settled shape, verify it in a real browser, and ship it.

## Inherited from de-006 (moved here on purpose, 2026-07-14)

- **Switch free play to a random seed** (de-002 §6). This MUST land with the daily and not before:
  the daily seed is currently the only thing giving everyone a shared course, so randomizing free
  play early leaves no shared course at all and every per-arena board goes dead. `?seed=` URLs
  keep working; the run save still resumes.
- **The "this run is a daily" flag on the run save** (`SAVE_VERSION` bump), so a refresh resumes a
  daily *as* a daily: Restart Run suppressed, the local mark spent, the result routed to the daily
  submit. Deliberately not added in de-006 — until a daily run exists, nothing reads it, and a
  field written by nothing and read by nobody is the placebo defect all over again.

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
- **Ship**: `pnpm test` + `pnpm typecheck` green, merge to main. Both halves now ride the same push
  (Vercel for the client, `.github/workflows/deploy-worker.yml` for the Worker, which then asserts
  the deployed world matches the commit), so there is no separate `pnpm server:deploy` step to
  forget. **de-007 is already deployed** — the endpoints are live and dark, waiting on this client.
- **Graduate**: delete the Daily entry from IDEAS.md's "Graduated to the wayfinder" section once
  this is live, and record the decision on `wayfinder/map.md` (the solo map) the way the other
  shipped efforts are.
