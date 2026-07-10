---
type: wayfinder:task
status: closed
assignee: claude (worktree-timetrials session, 2026-07-10)
blocked-by: [tt-008, tt-009]
---

## Question

End-to-end verification and ship: full playwriter pass in a real browser — Signal Run
(first-input timer start, ordered gates, gas refill, R restart, finish + splits + PB save,
same-seed course identity) and The Culling (relentless convergence, countdown, level clear →
upgrade → tighter level, timeout run-over, PB save), leaderboard posting logged-in and
localStorage-only logged-out, plus regression of waves/matchday/co-op entry. `pnpm test` +
`pnpm tsc --noEmit` green in the worktree, merge to main, verify both modes live in
production.

## Prep (2026-07-10, autonomous session — ticket stays open)

The full E2E pass ran against the worktree dev stack (vite on :5300 with
`VITE_PARTY_HOST=localhost:8899`, `wrangler dev` + local D1 on :8899, playwright-cli
named session `timetrials`). All green:

- **Signal Run**: first-input timer arming; idle ticks do not start the clock; ordered
  gate passes refill gas; skipping ahead is inert; R restarts mid-run and from the
  results overlay; finish banks ascending splits + localStorage PB (logged out too);
  slower reruns flash red deltas and never overwrite the PB; same seed reproduces the
  identical course across reloads; flare columns/ring/minimap verified day + night.
- **The Culling**: relentless convergence (every titan chasing at spawn distances, no
  cap, leash off); countdown pauses through the upgrade pick; per-kill allowance
  tightened 22 → 20.05 across a real clear → pick loop; urgency at 20% (red pulse,
  vignette, heartbeat, banner); timeout run-over card; hunt PB banked.
- **Leaderboard**: register → post → keep-best rejection → per-seed boards via curl; a
  signed-in headless finish posted through the real client path and ranked; 401/400
  gates verified; logged-out finishes stay localStorage-only; featured-course button in
  both states.
- **Regressions**: waves (combat HUD intact, no strips), matchday (all footballers),
  co-op lobby entry (auth overlay), modes menu lists all four modes.
- **Prod-shape**: `pnpm build` (tsc + vite build), `pnpm test` (23 files / 269 specs),
  `pnpm typecheck` (client + server tsconfigs) all exit 0 in the worktree.

Remaining before this ticket closes: tt-009 HITL playtest, then merge
`worktree-timetrials` → main (Vercel auto-deploy), `wrangler d1 migrations apply aot`
(remote) + `pnpm server:deploy`, and both modes verified live in production.

## Resolution (shipped 2026-07-10)

The user ordered ship ahead of the tt-009 playtest; tt-009 stays open as post-launch
tuning against live defaults (all knobs are exported constants).

- **Merge**: origin/main had moved (focus strike, height-scaled hitboxes, keybind HUD,
  and the committed charting docs). Merged into `worktree-timetrials` preserving both
  features (7 conflict hunks across game.ts/main.ts/hud.ts/audio.ts/index.html — notable:
  `startGame` resets race/hunt/relentless AND focus/strike; the focus row keeps its
  3-kill-charge structure and gains the `combat` class so Signal Run hides it). Merged
  suite: 24 files / 298 tests, both tsconfigs, prod build, plus a browser smoke of both
  modes on the merged tree.
- **Server**: `wrangler d1 migrations apply aot --remote` (0001 trials table) then
  `pnpm server:deploy` → aot-party live; `/api/health` ok, `/api/trials?seed=` serving,
  unauthenticated `/api/trial` correctly 401.
- **Client**: pushed `worktree-timetrials` → `origin/main` (0a4e575..c835fdd); Vercel
  deployed; verified live at attack-on-titan.magnusrodseth.com — Signal Run (15 gates on
  the featured seed, timer arming, race strip) and The Culling (relentless convergence,
  budget 88 at level 1) both driven via `__aot`; the leaderboard panel reaches the prod
  worker (per-seed boards, empty states); featured-course button correct; default page
  regression fine.
- The full pre-ship E2E matrix is recorded under Prep above.
