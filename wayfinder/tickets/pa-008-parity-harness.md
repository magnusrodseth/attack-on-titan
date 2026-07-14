---
type: wayfinder:grilling
status: open
assignee:
blocked-by: [pa-001, pa-002]
---

# pa-008 · The parity harness: the tests that would have caught this

## Question

There is not one test in the repo that runs a scenario through both paths and compares. There is a
suite literally named `map/mode parity` (`src/sim/maps.test.ts`) and it never touches `coop.ts`.
`coop.test.ts` mentions `'abnormal'` exactly once and `'shifter'` never. `server/room.ts`, the
Durable Object that actually drives the co-op world, has no tests at all.

The type from pa-002 catches an *undeclared* stance. This ticket decides what catches a *false* one.
Given the `World` from pa-001, design the harness:

- **The core assertion.** With one `stepWorld`, most divergence becomes impossible by construction,
  so what is left worth asserting? Candidates: every registry entry whose stance is works-as-is or
  adapted actually boots a world and survives N ticks with 1 and with 4 players; every map spawns a
  legal wave under the world's own spawner (the clamp bug lives here); every boss in every map's
  ladder can be engaged, damaged, broken and killed; a mode declared solo-only is *refused* by the
  co-op path rather than silently degrading.
- **Registry-driven, not hand-listed.** The tests must iterate `GAME_MODES` × `GAME_MAPS` × the
  kind and boss registries, so a new entry is tested the day it is added without anyone editing a
  test file. State how a new entry with a stance of solo-only opts out without weakening the sweep.
- **The determinism assertion.** Same seed, same world, on both drivers.
- **Where the snapshot/mirror layer gets tested.** The world may be shared but the co-op wire is
  not; a round-trip test (world to snapshot to client mirror and back to a comparable state) is the
  only thing that would catch a new field that nobody added to the snapshot.
- **The `server/room.ts` gap.** Decide whether the Durable Object gets tests in this effort's spec
  or whether the pure world is enough.
- **Cost.** These sweeps run on every `pnpm test`. Say what the budget is and what gets sampled
  rather than exhausted. (Note the known vitest trap: running from the main checkout also sweeps
  `.claude/worktrees/*`.)
