---
type: wayfinder:prototype
status: open
assignee:
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
