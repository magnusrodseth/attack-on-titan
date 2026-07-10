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
