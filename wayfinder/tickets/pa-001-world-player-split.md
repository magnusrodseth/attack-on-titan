---
type: wayfinder:prototype
status: closed
assignee: claude (worktree-unified-world, 2026-07-14)
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

## Resolution

`src/sim/world.ts`. `World` = arena + map + mode + titans + boss + spears + pickups + **N
soldiers**; `stepWorld(w, dt, input)` is the only place any of it advances. `Soldier` wraps a
`PlayerState` (`body`) plus what the world owns: hp/blades/score/kills/alive/offers/grab.

- `GameState` **is** a `World`. `player`, `score`, `offers`, `grab` and `grabWatch` are accessor
  views of `soldiers[0]` (attachSoloViews), so every existing solo read site stands unchanged and
  nothing is copied, hence nothing can drift.
- `CoopWorld` **is** a `World` plus the wire's bookkeeping (lag-comp history, a `players` index).
- Player physics stays client-local in **both** (it already was: `coopClient.ts` imported
  `stepPlayer` from the solo path). The world reads positions and writes consequences.
- Intents are one path: `worldSlash` / `worldFire` / `worldResupply` / mash. Solo calls them
  inline from a keypress; co-op calls them from a message. `trySlash` is reached the same way in
  both, so lag compensation is a co-op *wrapper* (`rewindTitans`), not a second combat model.
- Focus is NOT in the world: the solo driver scales `dt` before calling in. A shared world cannot
  slow for one soldier, so the world never learns time bent.
- Determinism unchanged: streams stay `hashSeed(seed + ':purpose:N')`; the arena derives from
  (mapId, citySeed), which is why a room keeps its city across rematches.
