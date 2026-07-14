---
type: wayfinder:grilling
status: closed
assignee: claude (worktree-unified-world, 2026-07-14)
blocked-by: []
---

# pa-004 · The content-version guard: a new titan kind meets a stale client

## Question

`PROTOCOL_VERSION` checks that both sides speak the same message *shape*. Nothing checks that they
agree on the game's *content*. A snapshot carries `kind: TitanKind` as a bare JSON string, and a
client that does not know a new kind will happily `createTitan` it and then read `KIND_STATS[kind]`
as `undefined`. The same hole exists for upgrade ids, boss ids and map ids.

This is not hypothetical: the client deploys to Vercel on push to `main` while the Worker deploys
separately via `pnpm server:deploy`, so the two are routinely skewed, in both directions, in
production.

Decide:

- **What identifies "content".** A hash over the registries (modes, maps, kinds, bosses, upgrades)
  computed at build time? A hand-bumped `CONTENT_VERSION`? Per-registry versions so a new map does
  not invalidate a client that only needs kinds?
- **Where it is checked.** At socket open (refuse the connection, tell the player to reload), at
  match start (refuse to start), or per message (too expensive)?
- **What the player sees.** A forced reload, a "the server is being updated" lobby state, or a
  silent degradation? A shared-world game cannot let one client hallucinate a different world.
- **The deploy contract.** Which order the two deploys must happen in, whether the Worker must
  tolerate old clients for a window, and how far. State it as a rule the build map can enforce
  (and that a human shipping a hotfix can follow).
- **The unknown-value fallback.** Independently of the version check, should the client harden
  against an unknown kind/upgrade/boss id (render a default, ignore the entity) so a skew degrades
  instead of throwing?

Research is fair game here: how other server-authoritative games handle client/server content skew.

## Resolution

`src/sim/content.ts`: `CONTENT_HASH` is **derived** (not hand-bumped) from the sorted ids of every
registry — modes, maps, titan kinds, bosses, upgrades. Add content anywhere and the hash moves by
itself.

It rides the websocket handshake as a query param. The room compares it in `onConnect` **before
anything else** and refuses a mismatch with a new `outdated` ErrorCode + a reload prompt. Rationale:
the client deploys to Vercel on push while the Worker deploys separately, so skew is routine in
both directions, and a stale client would build a titan of an unknown kind and read
`KIND_STATS[undefined]` with nothing to catch it. A refusal is loud, immediate and recoverable; a
divergent world is none of those.

Deploy contract (now in CLAUDE.md and ADR 0003): the Worker and the client ship together whenever
content changes. Verified live — the E2E connected successfully, which means the hash computed
identically in the Vite bundle and in the Worker bundle.
