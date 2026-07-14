# CLAUDE.md

Conventions for working in this repository.

## Adding content: the one rule (ADR 0003)

**There is one world.** `src/sim/world.ts` (`stepWorld`) owns titans, waves, modes, maps,
Shifters, spears and the N soldiers in it. Solo drives it with a roster of one; the co-op server
drives it with N. A new map, mode, titan kind, boss or variation is written **once**, and it
reaches singleplayer and multiplayer together.

Every registry entry (`GameMode`, `GameMap`, `TitanKindSpec`, `BossSpec`, and the `FEATURES`
table for cross-cutting things like Focus) carries a **required** `coop: CoopStance`:

- `{ kind: 'shared' }` — same code, one soldier or four.
- `{ kind: 'adapted', note }` — works with a squad, but it had to be reshaped. Say how.
- `{ kind: 'soloOnly', reason }` — cannot exist in a shared world. Say why. The menu and the
  lobby then refuse it honestly instead of half-running it.

Omitting the stance is a **type error**. That is deliberate: the bug this rule exists to kill was
never a wrong answer, it was silence (three maps, four modes and nine bosses shipped without co-op
ever hearing about any of them). `src/sim/parity.test.ts` then turns the claim into an assertion —
it is registry-driven, so new content is swept the day it is added.

**Deploy contract**: the client (Vercel, on push) and the Worker must ship together whenever
content changes. A content hash rides the handshake, so a skewed client is refused with a reload
rather than fighting a world nobody else is in.

Both halves now ship on the same push: `.github/workflows/deploy-worker.yml` deploys the Worker on
every push to `main`, then makes it prove itself — `server/deployed.test.ts` fetches `/api/health`
off the live Worker and asserts the world it is serving is the world in the commit. This is not
belt-and-braces. The Worker used to deploy by hand, and on 2026-07-14 it did not: the civilians
revert shipped a client that had never heard of the Evacuation mode while the Worker sat an hour
behind still holding it, and every lobby was refused with 4009 until someone tried to play and
noticed. The hash caught the skew; nothing caught the missing deploy. Now something does.

`pnpm server:deploy` still works for a manual push, and
`DEPLOYED_HOST=aot-party.magnus-rodseth.workers.dev pnpm test:deployed` asks the live Worker which
world it holds — the first thing to run when co-op starts refusing people.

## Architecture

- `src/sim/` is pure TypeScript stepped at a fixed 120 Hz, fully unit-tested (vitest, colocated
  `*.test.ts`). All game logic lives here. Tests are written at module seams before implementation.
- `src/render/`, `src/hud.ts`, `src/main.ts` are thin adapters over sim state — deliberately
  untested by unit tests; verify them in a real browser via the `window.__aot` debug hook
  (`start/step/snapshot/setSilent/setAutopilot/fxSlash`).
- Determinism: every random stream derives from `hashSeed(seed + ':purpose:N')`. Never share one
  rng across purposes; `?seed=` URLs must replay identical runs.
- Run `pnpm test` and `pnpm tsc --noEmit` before committing. Pushes to `main` auto-deploy to
  Vercel (attack-on-titan.magnusrodseth.com).

## Texture rule (user mandate, 2026-07-09)

**Every visible surface texture must be a free asset found online — no Claude-invented flat
colors.** Specifically:

- Source textures via a research subagent that verifies direct-download URLs and licenses
  (CC0/no-attribution only). Poly Haven and OpenGameArt are the proven sources; see README
  credits.
- Downscale to 512px with `sips -Z 512` when the 1K file exceeds ~500 KB; assets live in
  `public/textures/` and `public/models/`.
- Per-instance `instanceColor` tints layered over a sourced texture are encouraged (variety);
  a bare `color:` with no `map:` on a visible surface is not.
- Accepted exceptions: gameplay indicator glows (nape weak point, resupply ring, lit windows'
  overbright tint), distant 2-triangle bird silhouettes, and transient particle/trail effects.

When adding any new visible mesh, source its texture first or reuse an already-credited asset.
(The 2026-07-13 waiver for the flat-colored boss statue glbs is closed: the Nine are now
procedural bodies in `src/render/titans/` with credited maps under build.py palette tints.)
