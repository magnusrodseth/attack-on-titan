# 3. One world, both ways to play

Date: 2026-07-14

## Status

Accepted. Supersedes the co-op half of ADR 0001 (the authority model stands; the duplication does not).

## Context

The game had two simulations.

`src/sim/game.ts` ran the solo world: the mode registry, the map registry, the Shifter ladder,
the grab QTE, the wave spawner and its titan-height ceiling clamp. `src/sim/coop.ts` ran the
co-op world: a hand-rolled wave loop with no concept of a mode, a hardcoded `generateCity` call
that no map registry could reach, no import of `boss.ts` at all, and its own copies of the chaser
tokens, the swat handling, the resupply radius and the wave-clear bonus.

The consequence was not that multiplayer was behind. It was that **multiplayer could not hear
about new content at all**, and nothing anywhere said so:

- Three maps shipped. Co-op stayed on the district, because `coop.ts` called `generateCity`
  directly. No error, no warning, no failing test.
- Four modes shipped. Co-op ran plain wave survival regardless of `?mode=`, which the client
  still read and still used to draw mode-specific HUD text for a mode the server was not running.
- Nine Shifters shipped. Co-op never spawned one. The boss-aware `boss` argument that
  `trySlash`/`stepSpears` already accept was simply never passed from the co-op side.
- The one test suite named "map/mode parity" swept `GAME_MODES × GAME_MAPS` and never touched
  `coop.ts` once.

Every one of those was a silence, and a silence is worse than a wrong answer: nobody had to
decide anything, so nobody did.

There was also a live latent bug proving the point. `modes.ts` clamped every spawn under the
roof it stands beneath (`maxTitanHeightAt`); `coop.ts`'s spawner did not. It was harmless only
because co-op was pinned to the one map with no ceiling. The first cavern map wired into co-op
would have spawned titans with their napes inside the rock, and nothing would have failed.

## Decision

### 1. One world, driven twice

`src/sim/world.ts` owns the world: the arena, the mode, the titans, the waves, the Shifter, the
spears, the pickups, and the N soldiers in it. `stepWorld(w, dt)` is the only place any of it
advances.

- **Solo** (`game.ts`) drives it with a roster of one and no wire.
- **Co-op** (`coop.ts` + `server/room.ts`) drives it with N and a snapshot.

`GameState` *is* a `World`; `player`, `score`, `offers` and `grab` are live views of its single
soldier, so every existing solo read site still reads exactly what it always did. Nothing is
copied, so nothing can drift.

Two things stay deliberately outside the world:

- **Player physics.** Every client owns its own body and reports it; the world reads positions
  and writes consequences. This is why solo keeps zero latency and why a co-op client never waits
  for the server to move it. (It was already true — `coopClient.ts` imported `stepPlayer` from
  the solo path — it just was not stated anywhere.)
- **Focus (bullet time).** A shared world cannot slow down for one soldier, so Focus is not a
  world rule at all: the solo driver scales `dt` before it calls in. The world never learns that
  time bent.

### 2. Every registry entry declares a typed co-op stance

`src/sim/stance.ts`:

```ts
export type CoopStance =
  | { kind: 'shared'; note?: string }
  | { kind: 'adapted'; note: string }
  | { kind: 'soloOnly'; reason: string }
```

`GameMode`, `GameMap`, `TitanKindSpec`, `BossSpec` and the cross-cutting `FEATURES` table all
carry it as a **required** field. A mode, a map, a titan kind or a Shifter that says nothing about
multiplayer **does not compile**. That is the entire point: the bug was never a wrong answer, it
was silence, and a required field is the only thing that makes silence impossible.

The lobby reads the stance: a solo-only mode or map is never offered to a squad, and the server
refuses it if asked anyway. Content is honestly absent rather than half-run.

**Upgrades deliberately carry no stance.** An upgrade is a pure `PlayerConfig` mutation with no
world surface, and `applyUpgrade` is already shared by both drivers. Instead of a type, they get
an assertion: the parity harness applies *every* upgrade in the pool through the server in a
four-soldier match. If an upgrade ever grows a world surface (a Focus-like effect, a titan
interaction), it belongs in `FEATURES` with a stance.

### 3. The stance is a claim; the harness makes it a fact

`src/sim/parity.test.ts` is registry-driven, so new content is swept the day it is added:

- every co-op mode × every co-op map, with one soldier and with four;
- every map's own spawner, asserting no titan stands inside a wall or through the roof (the clamp
  bug above now fails loudly);
- every Shifter in every map's ladder, engaged, broken part by part, and killed — in a
  four-soldier room;
- the wire round trip: the Shifter, the fist, and every titan kind surviving snapshot → mirror;
- solo and co-op spawning the identical roster from the identical seed;
- every upgrade in the pool, applied by the server, in a real match.

### 4. The wire names the world, and checks it

Protocol v2:

- The lobby carries `mapId`/`modeId`; the squad leader picks them, and `matchStart` names the
  world the server is actually running rather than leaving the client to infer it. A client whose
  page was built for a different world reloads into the announced one **while still in the
  lobby**, where nothing is lost — the page builds its arena and its whole three.js scene at load,
  and that is the honest place to change the ground under a room.
- The Shifter rides the snapshot (parts, lit weak point, plated, phase, steam, windup,
  projectiles, spikes) and all eleven boss events cross. `syncBossMirror` rebuilds a real
  `BossFight` on the client, so the boss bar, the weak-point glow and `BossFxView` are the same
  code they are in solo.
- The grab crosses, adapted: the fist takes any soldier, the snapshot carries the escape bar, and
  the mash is an intent. No teammate rescue in v1 (user ruling, 2026-07-14).
- **Content hash** (`src/sim/content.ts`), derived from the mode/map/kind/boss/upgrade registries
  and carried in the handshake. `PROTOCOL_VERSION` only ever said both sides speak the same
  message *shape*; it said nothing about whether they know the same *game*. The client deploys to
  Vercel on push and the Worker deploys separately, so skew is routine, and a skewed client would
  read `KIND_STATS[undefined]` for a kind it has never heard of. It is now refused at the
  handshake and told to reload.

### 5. Shifter pools scale with the squad

Four blades cut four times as fast. `rosterHpScale(squad)` multiplies part HP so a four-hand
Shifter fight lasts a fight. The ladder does not change, and `killSpeed` never moves.

## Consequences

- Adding a map, a mode, a titan kind or a Shifter now reaches singleplayer and multiplayer at
  once, because there is only one place for it to arrive. Forgetting the co-op side is no longer
  possible; the worst you can do is *declare* it solo-only, out loud, with a reason.
- Co-op gained, on the day of the merge and without being asked: all three maps, boss rush and
  the Nine, the grab QTE, the ceiling clamp, and solo's dry-rack feedback.
- Race (Signal Run) and hunt (The Culling) are declared `soloOnly` with reasons. They are not
  wiring problems: whose clock arms, whose roster, and what a shared countdown means are game
  design questions that need their own effort.
- The deploy contract has teeth now: **the Worker and the client must ship together.** A content
  change deployed to only one of them refuses every connection until the other catches up, which
  is loud, immediate and recoverable — the failure mode we chose over a silent divergent world.

## Alternatives rejected

- **Full loopback unification** (solo driving the world through the same intent/snapshot wire).
  Maximum identicalness, but it makes solo pay for prediction and reconciliation it does not need,
  and it would have reshaped Focus, the grab and the run save around an authority model that
  exists only to survive a network. Solo keeps its direct drive.
- **A checklist in CLAUDE.md.** This is what we effectively had. Discipline is what failed.
- **"Everything must work in co-op, no exceptions."** Honest, but it forces Focus — a core solo
  mechanic — to be reworked or cut for a reason that has nothing to do with what makes it good.
  A declared, reasoned `soloOnly` is the more truthful answer.
