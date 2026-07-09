---
type: wayfinder:grilling
status: closed
assignee: claude (autonomous session, 2026-07-09)
blocked-by: []
---

## Question

Which stack and project shape support test-first development of a Three.js game?

## Resolution

- **Vite + TypeScript (strict) + three + vitest**, pnpm. No test framework config beyond vitest
  defaults; tests colocated as `src/sim/*.test.ts`.
- **No physics engine.** The whole game needs one constraint type (rope sphere) plus capsule/sphere
  overlap checks; hand-rolled is less code than integrating ammo/rapier and keeps the sim pure and
  deterministic for tests.
- **Architecture seam**: `src/sim/` is pure TypeScript (three's Vector3 as math lib only, no scene
  objects) stepped at fixed 120 Hz; `src/render/` + `src/hud.ts` read sim state and draw. Unit
  tests cover sim only; renderer is verified by playwriter smoke test.
- Debug hook `window.__aot` exposes sim state for browser automation.
