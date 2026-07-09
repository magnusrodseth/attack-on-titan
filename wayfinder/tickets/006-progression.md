---
type: wayfinder:task
status: closed
assignee: claude (autonomous session, 2026-07-09)
blocked-by: [005]
---

## Question

Build progression test-first: wave composition (seeded, escalating), style/combo scoring,
pick-1-of-3 upgrade system, game orchestrator (states: menu → playing → upgrading → dead),
localStorage persistence.

## Resolution

`src/sim/{waves,score,upgrades,game}.ts`. Per-wave RNG streams (`seed:wave:N`, `seed:offers:N`)
so determinism survives arbitrary runtime rng consumption. Score = 100 × overspeed × 1.25 air ×
1.5 one-cut × chain (+25%/kill, 6s window). Nine-upgrade pool. Wave bonus 250×wave. Bests persist
under `aot-odm-best`. Verified end-to-end in the browser: kill scored 256, wave clear offered 3
upgrades, wave 2 spawned 6 titans, death saved bests.
