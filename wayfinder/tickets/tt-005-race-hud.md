---
type: wayfinder:task
status: closed
assignee: claude (worktree-timetrials session, 2026-07-10)
blocked-by: [tt-003]
---

## Question

Build the race-strip HUD for Signal Run on the existing HudFrame plumbing and brand fonts:
big centered timer (m:ss.cc) top; GATE 4/12 beneath; per-gate split delta vs PB flashed on
pass (green ahead / red behind); meters-to-next-gate with a small edge caret when the gate
is off-screen; small corner speedometer (m/s); gas bar stays; blades/spears/hearts rows
hidden in this mode. Results overlay on finish: total time, splits, PB delta. Verify in the
browser via playwriter.

## Resolution

Built on the existing HudFrame plumbing and brand fonts (`index.html` + `src/hud.ts` +
`main.ts` wiring).

- **Race strip** (`#race-strip`, Cinzel): big centered `m:ss.cc` timer (dimmed until the
  clock arms), `GATE n/N` beneath, and a split-delta line that flashes on each pass —
  green ahead / red behind vs the PB split, raw split time on a PB-less first run.
- **Meters-to-gate**: a center-lower `NNN m` readout; when the active gate leaves the
  viewport an edge caret (green triangle) slides along the screen border pointing at it,
  computed by projecting the gate through the camera (NDC clamp, flipped when behind).
- **Mode chrome**: `body.race` hides the combat rows (health/blade/spear/focus) and the
  scorebox; the gas bar stays; the speedometer switches to m/s; the station resupply
  prompt is suppressed (R restarts in this mode).
- **Results overlay** (`#race-results`): total time with NEW PB badge or PB delta, the
  full per-gate split table with deltas, and "Run It Again — R" (button and key both call
  `restartRace`). The `finished` phase transition exits pointer lock, shows the overlay
  and clears the refresh save; `beginRun` also accepts `finished` for menu flows.
- **Debug hook**: `__aot.step` now routes sim events through `handleEvents` like the live
  loop, so headless verification exercises HUD/FX/audio too.
- **Verified** via playwright-cli + `__aot`: strip + caret + distance mid-run, full run to
  the results overlay (NEW PB, 12 ascending splits), R-restart from the overlay, and a
  slower rerun flashing `+1.97` red at gate 1.
