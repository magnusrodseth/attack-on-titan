---
type: wayfinder:task
status: open
assignee: claude (built 2026-07-15, branch `daily-client`)
blocked-by: []
---

## Built and verified (2026-07-15, branch `daily-client`) — awaiting the ship decision

Everything below the "Question" is done and driven end to end in a real browser against a local
`wrangler dev` + a migrated D1. What remains is the outward-facing part: **merge to main (which
auto-deploys the client and the Worker together now) and graduate the effort.** Held for a human
green light because it ships a new headline mode and flips free play to a random seed in prod.

- **Free play rolls a random seed** (`randomSeed`, de-002 §6). `?seed=` links and saved runs still
  pin their course; only a fresh unpinned boot is random. The dead `wall-YYYY-MM-DD` daily seed is
  gone. This is why it had to land *with* the daily: the daily's course (server double-written to
  `trials`) is now the shared one that keeps the per-arena boards alive.
- **The run-save daily flag** (`SAVE_VERSION` 5 → 6, `daily?` on `SavedRun`): a refresh mid-daily
  resumes it as a daily — Restart suppressed, result still routed to the daily submit.
- **The sealed seed never enters a URL.** The claim stashes it in localStorage (`aot-daily-active`)
  and the daily reload carries only `?mode&map&daily=1`, so a link cannot hand someone today's
  course unspent. The seed rides the save and the stash, both seed-gated.
- **The local mark** (`aot-daily-marks`) is set on any daily deploy — ranked, unranked or signed
  out — and a marked date refuses a fresh claim (the practice loophole costs a devtools command).
- **Result routing**: a daily posts every mode through `POST /api/daily/submit` (which double-writes
  the trial server-side); an ordinary run keeps its direct trial post. "Once More" becomes "Return
  to Base" on a daily and drops to a clean menu where the plate reads spent.
- **Hall restructure** and the **three unhappy states**: as de-005 describes.
- **Verified**: claim → reload (no seed in URL) → run → death card daily line (`Score 4200 ·
  Provisional #1 today · Streak now 1 day`) → spent plate → Hall (daily board + Standings, armin's
  abandoned run showing as the finished/expeditions gap). `pnpm test` 624 green, `pnpm typecheck`
  clean.

### Remaining to ship (the human's call)
- Merge `daily-client` to main (Vercel + the Worker workflow deploy together).
- Confirm prod: the daily plate rolls, a real claim/run/submit posts to prod D1.
- Graduate: strike the Daily entry from IDEAS.md and record it on `wayfinder/map.md` beside the
  other shipped efforts.

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
