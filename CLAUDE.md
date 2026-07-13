# CLAUDE.md

Conventions for working in this repository.

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
- Dated exception (user decision, 2026-07-13): the nine Shifter boss statues
  (`public/models/*-titan.glb`) ship with their flat Blender colors until a CC0
  texture/bake pass lands (follow-up in wayfinder ticket 009). This waiver covers the
  boss statues only — it is not a precedent for other surfaces.

When adding any new visible mesh, source its texture first or reuse an already-credited asset.
