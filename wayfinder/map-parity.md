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

- **Plan-only was overridden by the user on the day it was charted** (2026-07-14: "can we go ahead
  and implement it all now?"). The four alignment rulings below were settled by grilling, then the
  whole map was built and shipped in one session on branch `worktree-unified-world`. The map is
  therefore a record, not a route: every ticket is closed, and there is no build map to chart
  because there is nothing left to build.
- Four further rulings were taken at the start of execution, all user decisions: the grab is
  **adapted, self-escape only** (no teammate rescue in v1); Shifter part pools **scale with the
  roster** so a four-hand fight lasts a fight; the squad leader **picks map and mode live in the
  lobby** (which forced the honest fix to client bootstrap: the scene defers to the announced
  world); and the effort ships **all the way to production**.
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

- [pa-001 · The World/Player split](tickets/pa-001-world-player-split.md) — `src/sim/world.ts`: one
  `World` (arena, mode, titans, boss, spears, N soldiers) advanced by one `stepWorld`. `GameState`
  IS a World whose `player`/`score`/`offers`/`grab` are views of its single soldier; `CoopWorld` IS
  a World plus the wire's bookkeeping. Player physics stays client-local in both; Focus never
  reaches the world (the solo driver scales dt).
- [pa-002 · The typed co-op stance](tickets/pa-002-typed-coop-stance.md) — `CoopStance` = shared /
  adapted(note) / soloOnly(reason), **required** on modes, maps, titan kinds (now a registry) and
  all nine Shifters, plus a `FEATURES` table for Focus and the grab. Omitting it does not compile.
  Upgrades deliberately opt out (no world surface) and are covered by the harness instead.
- [pa-003 · Getting a map into a co-op room](tickets/pa-003-map-in-the-lobby.md) — protocol v2: the
  lobby carries mapId/modeId, a creator-only `setWorld` sets them (stance-gated), `matchStart` names
  the world. A client on the wrong ground reloads into it *in the lobby*, where nothing is lost.
- [pa-004 · The content-version guard](tickets/pa-004-content-version-guard.md) — `CONTENT_HASH`,
  derived from every registry, rides the handshake; a skewed client is refused with a reload rather
  than reading `KIND_STATS[undefined]`. The Worker and the client must now ship together.
- [pa-005 · Focus and the grab QTE](tickets/pa-005-focus-and-grab.md) — Focus is solo-only (a shared
  world cannot slow for one soldier); the grab is adapted, self-escape only. The rule they teach:
  generalise a mechanic whose subject is "the player"; declare solo-only when its subject is time.
- [pa-006 · Who owns a soldier's state](tickets/pa-006-player-state-ownership.md) — the world owns
  hp/blades/score/alive/grab; the client owns position/velocity/gas/canisters/lamp. Resupply radius
  is one value plus a stated co-op slack; the wave bonus is one constant.
- [pa-007 · The Nine on the wire](tickets/pa-007-bosses-on-the-wire.md) — the Shifter rides the
  snapshot (parts, lit weak point, plated, phase, steam, windup, projectiles, spikes); all eleven
  boss events cross; lag comp covers parts for free; pools scale with the squad; abilities wound
  every soldier in radius.
- [pa-008 · The parity harness](tickets/pa-008-parity-harness.md) — 52 registry-driven specs: every
  mode × map with 1 and 4 soldiers, every map's spawns under its own roof, every Shifter engaged and
  killed in a four-soldier room, the wire round trips, and every upgrade applied by the server.
- [pa-009 · The migration route](tickets/pa-009-migration-route.md) — worktree branch, two green
  commits, no big-bang; folded in the missing ceiling clamp and the divergent constants; the content
  hash makes a bad deploy loud instead of silent.
- [pa-010 · The handoff](tickets/pa-010-adr-and-build-map.md) — **destination reached 2026-07-14**:
  `docs/adr/0003-unified-world.md`, the rule in `CLAUDE.md`, the vocabulary in `CONTEXT.md`, and the
  whole thing shipped. No build map to chart: the user overrode plan-only and it was built.

## Not yet specified

- **Snapshot budget.** Bosses plus four soldiers now ride 20 Hz snapshots (part pools, projectiles,
  spikes). It measured fine in a two-browser E2E; a four-soldier boss fight has not been profiled.
- **Co-op save/resume.** The World is the serializable thing now, so a reconnect-to-a-saved-match
  became conceivable rather than absurd. Still declared `soloOnly` in FEATURES.
- **`server/room.ts` has no direct tests.** The pure world it drives is covered; the Durable Object
  itself is not. A knowing gap.
- **The upgrade prediction mirror.** `main.ts` still replays `applyUpgrade` client-side alongside the
  server's own call. It works, and the harness covers the server side, but the two call sites remain
  a hand-kept invariant.

## Out of scope

- **Co-op Signal Run and co-op The Culling.** Racing a shared clock and hunting a shared roster
  are new game design, not wiring; the time-trials map already ruled them out. They are declared
  solo-only by this effort. A later effort with a redrawn destination owns them.
- **Full loopback unification** (solo driving the world through the intent/snapshot wire). Ruled
  out at the seam decision: solo keeps its direct, zero-latency drive.
- **Building the unified world.** This map produces the spec; the build map it charts executes it.
- **Mobile and touch** (gated out of the game entirely).
