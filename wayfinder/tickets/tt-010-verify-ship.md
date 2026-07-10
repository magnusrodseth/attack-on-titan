---
type: wayfinder:task
status: open
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
