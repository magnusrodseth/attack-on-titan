---
type: wayfinder:task
status: closed
assignee: claude (worktree-timetrials session, 2026-07-10)
blocked-by: []
---

## Question

Build the seeded course generator for Signal Run, test-first in `src/sim/`: derive a
point-to-point course (start gate + ~10–15 sequential gates) from the city seed via its own
rng streams (`hashSeed(seed + ':course:N')`). Gates must land in reachable space — routed
across the city using the nav grid, at varied heights (rooftop level, street canyons, plaza
crossings) so a good line mixes hook-swings, boosts and ground runs. Output: ordered gate
positions + pass radii the mode sim and renderer both consume. Decide and test: minimum/
maximum gate spacing, height variation bounds, and that the same seed always yields the
identical course.

## Resolution

Built in `src/sim/course.ts` (tests: `src/sim/course.test.ts`, 8 specs), branch
`worktree-timetrials`. `generateCourse(seed, arena, nav): Course` returns a street-level
`start` plus 10-15 ordered `Gate`s (`{x, y, z, radius, tier}`) that the mode sim (tt-003)
and renderer (tt-004) both consume.

Decided values:

- **Spacing**: consecutive gates (start included) 35-70 m apart (`MIN/MAX_GATE_SPACING`),
  enforced after nav-grid snapping via bounded rejection sampling.
- **Route**: point-to-point crossing between opposite points at 0.78 x wall radius; a guided
  walk aims each gate at the far target with bearing jitter scaled by remaining path budget
  (wanders early, homes late). Every gate snaps to a walkable street cell, stays >= 12 m
  inside the wall (`COURSE_WALL_MARGIN`), and consecutive gates are street-connected
  (`findPath` non-null). Start-to-finish span >= wall radius.
- **Heights** (`GATE_TIERS`): street 4-7 m / radius 4, canyon 10-16 m / radius 5, rooftop
  20-28 m / radius 6 (above house ridges, under towers and wall). A shuffled cycle of the
  three tiers guarantees every course mixes ground runs, boosts and hook-swings.
- **Streams**: layout on `hashSeed(seed + ':course:0')`, vertical profile on `':course:1'` —
  retuning heights never reshuffles the route. Same seed, identical course (tested); a
  one-off 60-seed sweep validated every invariant before the sweep file was deleted.
