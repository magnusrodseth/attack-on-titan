# Wayfinder Map: One world, both ways to play

Label: `wayfinder:map` · Tracker: local markdown (`wayfinder/tickets/`, `pa-` prefix) · Fresh
effort charted 2026-07-14 via grilling. Successor to the co-op parity deferral noted in
`wayfinder/map.md` and the map/mode-parity work of commit `7baa456`.

## Destination

A **spec a build effort can execute with no decisions left to make**: `docs/adr/0003` recording
the unified-world architecture (one `stepWorld` that both solo and co-op drive, solo being the
one-player case) plus the typed co-op stance every new piece of content must declare, and a
second wayfinder map of pure build tickets charted from it. The architecture it specifies must
reach: co-op Wave Survival and co-op boss rush (The Nine) on all three maps, with Signal Run,
The Culling and Focus declared solo-only in code with a stated reason.

Reaching the end means: adding a new map, mode, titan kind, boss or variation can no longer be
silently singleplayer-only, because the compiler will not let you skip saying what it does in
multiplayer.

## Notes

- **This effort is PLAN-ONLY** (unlike the solo, multiplayer and time-trials maps, which carried
  execution). Tickets resolve decisions; the last ticket writes the ADR and charts the build map.
  Resist the pull to start refactoring `coop.ts`: that pull is the signal a ticket is done.
- Skills every session should consult: `/grilling` and `/domain-modeling` (decisions are the
  user's; facts are the codebase's), `/prototype` for the type-level sketches, `/codebase-design`
  for the deep-module vocabulary when arguing about where a seam goes.
- Glossary: `CONTEXT.md`. Prior decisions: `wayfinder/map.md` (solo core), `wayfinder/map-multiplayer.md`
  (co-op authority model, `docs/adr/0001`), `wayfinder/map-timetrials.md` (race + hunt, already
  ruled co-op out of scope), `docs/adr/0002` (Shifter combat model).
- **The four alignment rulings from charting** (2026-07-14, user-confirmed, do not relitigate):
  1. **Unify the world, not the whole runtime.** One `stepWorld(world, dt, players)` owns titans,
     waves, the mode registry, bosses, the arena, spears and pickups. Solo drives it in-process
     with one player; `MatchRoom` drives it with N and adds snapshots. Player physics stays
     client-local in both (it already is: `coopClient.ts` imports `stepPlayer` from the solo path).
     Solo keeps its zero-latency direct drive; it does **not** go through an intent/snapshot
     loopback.
  2. **Every registry entry declares a typed co-op stance.** Missing it is a `tsc` failure. The
     legal answers are roughly works-as-is / adapted (with the adaptation) / solo-only (with a
     reason). Enforcement by types first, tests second, discipline never.
  3. **The architecture must be proven against maps and bosses**, the two axes where co-op is not
     merely unwired but structurally absent (`coop.ts` never imports `maps.ts` or `boss.ts`).
  4. **Race, hunt and Focus are solo-only for now, declared not forgotten.**
- Known latent bug to carry into the spec: `coop.ts`'s `spawnWave` lacks the
  `maxTitanHeightAt` clamp that `modes.ts` applies, so the first ceilinged map wired into co-op
  spawns titans through the cavern roof. Nothing catches it today.
- Standing ruling from the map/mode-parity effort: a boss too tall for a map is **dropped from
  that map's ladder** (`bossLadderFor`), never scaled down. Co-op boss rush inherits this.

## Decisions so far

<!-- one line per closed ticket -->

## Not yet specified

- **Snapshot budget.** What bosses plus N players cost on the wire at 20 Hz (part HP arrays, the
  eleven boss events, weak-point state). Only sharp once the boss wire surface exists.
- **Co-op save/resume.** Solo persists a run by serializing `GameState`; if a `World` becomes the
  serializable thing, a reconnect-to-a-saved-match becomes conceivable. Revisit once the World
  owns what it owns.
- **Titan kinds as a real registry.** `TitanKind` is a bare union plus a `KIND_STATS` table; the
  stance rule may need something to hang a declaration off. Depends on how the stance is shaped.
- **The upgrade prediction mirror.** `main.ts` replays `applyUpgrade` client-side to stay in step
  with the server's own call. Whether that survives unification or collapses into a snapshot field.
- **Player-count scaling as a mode concern.** `waveComposition` already takes a `countScale`;
  whether modes must declare how they scale with roster size, or whether the world decides.
- **The lobby UI for picking a map and mode.** May want a prototype once the handshake is fixed.

## Out of scope

- **Co-op Signal Run and co-op The Culling.** Racing a shared clock and hunting a shared roster
  are new game design, not wiring; the time-trials map already ruled them out. They are declared
  solo-only by this effort. A later effort with a redrawn destination owns them.
- **Full loopback unification** (solo driving the world through the intent/snapshot wire). Ruled
  out at the seam decision: solo keeps its direct, zero-latency drive.
- **Building the unified world.** This map produces the spec; the build map it charts executes it.
- **Mobile and touch** (gated out of the game entirely).
