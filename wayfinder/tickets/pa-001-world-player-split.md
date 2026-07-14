---
type: wayfinder:prototype
status: open
assignee:
blocked-by: []
---

# pa-001 · The World/Player split: what `stepWorld` actually takes

## Question

Sketch the `World` type and the `stepWorld` signature concretely enough that every other ticket
on this map can reason against it. This is the trunk: bosses on the wire, player-state ownership
and the migration route all hang off the answer.

Today `GameState` (`src/sim/game.ts`) mixes the world (arena, titans, wave, boss, spears, pickups,
mode) with the one player, while `CoopWorld` (`src/sim/coop.ts`) holds a parallel, mode-free,
map-free world plus N `CoopPlayer`s whose bodies the clients actually own. Decide:

- What lives in `World` and what stays outside it. Where do `GameState` and `CoopWorld` end up:
  does `GameState` become `{ world, player }`, does `CoopWorld` become `{ world, players }`, or
  do both collapse into one type parameterised by player count?
- The exact shape of what `stepWorld` receives for players. The world needs to read positions (to
  chase, to swat, to aggro) and write consequences (hp, invuln, knockback, score, upgrades offered),
  but it must **not** own player physics, which stays client-local in both paths. Name that
  boundary type (a `PlayerBody`? a read/write view?) and say precisely which fields cross it.
- How player actions reach the world. Solo resolves a slash inline; co-op sends a `slash` intent
  resolved server-side with lag compensation. Does `stepWorld` take a queue of intents in both
  paths (uniform, at the cost of solo indirection), or does solo call the same resolution
  functions directly and only co-op queue them? Both keep `trySlash` shared; the question is who
  calls it and when.
- Where the mode hooks fire. `GameMode.step(g, dt, input)` takes the solo player's input today.
  In a world with N players, what does a mode's `step` receive?
- What the rng/determinism contract becomes: every stream is `hashSeed(seed + ':purpose:N')` and
  co-op derives its arena from a `citySeed` that is the room code. State the seed derivation the
  unified world uses so client-side arena regeneration and server-side simulation cannot drift.

Deliver a type-level prototype (a stub `world.ts`, unimplemented, that `tsc` accepts) plus the
call sites in solo and co-op sketched in comments, and get it reacted to. Do not implement the
step body.
