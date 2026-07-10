---
type: wayfinder:task
status: closed
assignee: claude (worktree-timetrials session, 2026-07-10)
blocked-by: [tt-002]
---

## Question

Render the Signal Run course: green signal-flare smoke column rising from the next gate
(visible map-wide, day and night), dimmer yellow column on the gate after, red column + ring
on the finish; a glowing ring gate at pass height on the active gate; pass FX (smoke pop +
chime, column dies); minimap blips for the active gate. Smoke = transient particle effect,
ring = gameplay indicator glow — both texture-rule exceptions, no asset sourcing needed.
Verify look and map-wide visibility in the browser via playwriter + `__aot` (day and night
clock overrides).

## Resolution

Built as `GatesView` in `src/render/gates.ts`, wired in `main.ts` + `minimap.ts`.

- **Flare columns**: three recycled rigs (an additive light-cone beam plus 110 soft-sprite
  smoke particles rising a 240 m column, widening as they climb). Active gate burns green,
  the gate after dims yellow at 45%, the finish burns red map-wide; when the finish is the
  active gate its column and ring go red. Rigs are built once and repositioned per frame —
  no per-frame allocations (the co-op spear-rack GPU lesson).
- **Ring**: a pulsing additive torus at pass height on the active gate, scaled to the
  gate's pass radius and faced along the line of approach. Smoke + ring ride the two
  texture-rule exceptions (transient particles, indicator glow); the soft radial sprite is
  canvas-generated under the same exception.
- **Pass FX**: `gatePass` bursts the flare's own smoke (green, red on the finish) plus a
  steam puff and plays the pickup chime; `raceFinished` chimes and shakes. Columns die by
  re-deriving from `race.nextGate` — no event bookkeeping.
- **Minimap**: active gate pulses green, the gate after shows dim yellow, the finish is a
  hollow red ring until it becomes active.
- **Verified** via playwright-cli + `__aot` on the worktree dev server (a second vite on a
  free port — 5173/5174 belong to other sessions): map-wide visibility at noon and
  midnight, columns/minimap advancing on a real gate pass, split + gas refill observed in
  the same session.
