---
type: wayfinder:grilling
status: closed
assignee: claude (worktree-unified-world, 2026-07-14)
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

## Resolution

`src/sim/parity.test.ts`, 52 specs, entirely registry-driven so new content is swept the day it is
added:

1. every registry entry carries a stance; a `soloOnly` always says why and an `adapted` always says
   how (the type catches absence; this catches an empty gesture);
2. the lobby offers exactly the content whose stance allows a squad;
3. **every co-op mode × every co-op map, with one soldier and with four** — boots a real world,
   ticks it, snapshots it;
4. every map's own spawner: no titan inside a wall, none through the roof (the clamp co-op never
   had — this is the assertion that would have caught the latent cavern bug);
5. **every Shifter in every map's ladder: engaged, broken part by part, killed** — in a
   four-soldier room, with the roster-scaled pools honestly taking proportionally more cuts;
6. the wire round trip: the Shifter, the fist and every titan kind surviving snapshot → mirror;
7. solo and co-op spawning the identical roster from the identical seed;
8. every upgrade in the pool applied by the server in a real match.

Budget: the whole file runs in ~1.5 s. `server/room.ts` still has no direct tests — the pure world
it drives is covered, and the DO is thin wiring; that is a knowing gap, not an oversight.
