---
type: wayfinder:prototype
status: closed
assignee: claude (worktree-unified-world, 2026-07-14)
blocked-by: []
---

# pa-002 · The typed co-op stance: the declaration that makes silence impossible

## Question

Design the declaration every piece of content must carry so that omitting the multiplayer answer
is a compile error rather than a silence. The alignment ruling says the legal answers are roughly
works-as-is / adapted (with the adaptation) / solo-only (with a reason). Pin it down:

- **The exact type.** Discriminated union? What does each variant carry (a note, a reason, an
  adapter function, a scaling hook)? Is `adapted` merely documentation, or does it hold the code
  that does the adapting?
- **Which registries carry it.** `GameMode` (`src/sim/modes.ts`), `GameMap` (`src/sim/maps.ts`),
  `BossSpec` (`src/sim/boss.ts`), titan kinds (`TitanKind` + `KIND_STATS` in `src/sim/titan.ts`,
  which is a bare union today, not a registry), upgrades (`UPGRADE_POOL`), and cross-cutting
  features with no registry at all (Focus, the grab QTE). A union member with no registry cannot
  be forced to declare anything: say what becomes a registry and what does not.
- **How the declaration is enforced beyond `tsc`.** A required field only catches the field being
  absent, not a lie (`coop: works-as-is` on a mode nobody ever ran in co-op). Where does the type
  hand off to the parity harness (pa-008)?
- **Who reads it at runtime.** The menu and the co-op lobby must hide or grey what is solo-only,
  the results screen must not promise what the mode cannot do, and the join URL must refuse a
  solo-only mode. List the read sites.
- **What it does to existing content.** Write the stance for every current mode, map, boss and
  kind. That exercise is the real test of the type: if any of today's twenty-odd entries cannot
  express its truth in your union, the union is wrong.

Deliver the type plus the filled-in declarations for today's content as a prototype to react to.

## Resolution

`src/sim/stance.ts`: `CoopStance = { kind: 'shared', note? } | { kind: 'adapted', note } |
{ kind: 'soloOnly', reason }`. **Required** on `GameMode`, `GameMap`, `TitanKindSpec` (titan kinds
became a real registry — `KIND_STATS` is now derived from it), `BossSpec` (all nine), and a new
`FEATURES` table for cross-cutting things with no registry (Focus, the strike, the grab, the
flashlight, the run save). Omitting it is a `tsc` error.

Upgrades deliberately carry **no** stance: an upgrade is a pure `PlayerConfig` mutation with no
world surface, and `applyUpgrade` was already shared. They get an assertion instead — the parity
harness applies every upgrade in the pool through the server in a four-soldier match. An upgrade
that ever grows a world surface belongs in `FEATURES`.

Read sites: `coopModes()` / `coopMaps()` filter the lobby pickers, and `server/room.ts` refuses a
solo-only pick. Verified in a real browser: the co-op lobby offers three maps and exactly two
missions (Wave Survival, The Nine) — race and hunt are honestly absent.
