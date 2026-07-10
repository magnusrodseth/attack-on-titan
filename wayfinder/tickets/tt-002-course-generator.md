---
type: wayfinder:task
status: open
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
