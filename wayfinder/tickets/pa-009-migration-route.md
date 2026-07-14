---
type: wayfinder:grilling
status: closed
assignee: claude (worktree-unified-world, 2026-07-14)
blocked-by: [pa-001, pa-006, pa-007]
---

# pa-009 · The migration route: two paths into one, without breaking a live game

## Question

The game is live at attack-on-titan.magnusrodseth.com, pushes to `main` auto-deploy the client, and
the Worker deploys separately. `coop.ts` is ~700 lines of hand-rolled world; `game.ts` is the solo
one. Both are tested and both work. Decide the route from here to one `stepWorld`, sharp enough
that the build map's tickets are mechanical.

- **The order of operations.** Strangler (extract `World` behind the existing two step functions,
  then move systems into it one at a time, both paths green after every commit) or big-bang on a
  worktree branch (one long-lived branch, one merge, one deploy)? The repo's habit is a worktree
  branch per effort; the risk here is that the branch owns both a live server and a live client.
- **What ships in which commit.** Which changes are pure refactors with no behavior change (and can
  land on `main` alone), and which are the behavior changes (co-op maps, co-op bosses) that need
  the client and Worker to ship together. This is where pa-004's deploy contract gets teeth.
- **The known bug fixes to fold in.** The missing `maxTitanHeightAt` clamp in co-op's spawner; the
  divergent resupply radius and wave bonus; anything else the audit turned up.
- **The rollback story.** If a unified world ships and co-op breaks in a way tests missed, what is
  the fastest way back? (An old Worker with a new client is exactly the skew pa-004 is about.)
- **Verification.** The repo verifies co-op with two real browser profiles, `__aot.setAutopilot`,
  and `window.__aotNet` message counts; a dead co-op soldier silently sends nothing, which has
  burned a session before. State the acceptance runs the build map must pass before merge: which
  maps, which modes, how many players, solo and co-op, day and night.
- **Sequencing against the fog.** Name which of the map's "Not yet specified" items must be resolved
  before the build starts and which can wait until after it lands.

## Resolution

Route taken: **a worktree branch, two green commits, no big-bang**.

1. `world: one sim for both ways to play` — extract the World, move solo onto it, move co-op onto
   it, land the stance type. Pure refactor plus the parity content it unlocks; 501 tests green.
2. `coop: the lobby names the world, and the wire carries all of it` — protocol v2, the lobby
   pickers, the boss on the wire, the grab, the content guard, the harness; 553 tests green.

Bugs folded in on the way: the missing `maxTitanHeightAt` clamp in co-op's spawner; the divergent
resupply radius (10 vs 15) and wave bonus (literal vs constant); co-op silently swallowing a
dry-rack press.

**Rollback**: the content hash makes a bad deploy loud instead of silent — an old Worker with a new
client refuses connections rather than diverging, so the fix is redeploying the Worker (or
reverting the client), not archaeology on a corrupted match.

**Acceptance runs** (all executed): `pnpm test` (553), `pnpm typecheck` (client + server), `vite
build`, and a live two-browser E2E against a local wrangler + D1 — Forest, The Nine, two soldiers,
Beast Titan engaged and throwing, boss bar rendering off the mirrored fight, team wipe and results.
