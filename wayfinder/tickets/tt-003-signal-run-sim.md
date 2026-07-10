---
type: wayfinder:task
status: open
blocked-by: [tt-002]
---

## Question

Build the Signal Run mode sim, test-first: `GAME_MODES` entry (id `race`, name "Signal Run",
menu copy), no titans spawned, timer armed on first player input, sequential gate-pass
detection (in order only), full gas refill on each gate pass, red finish gate ends the run
with total time + per-gate splits, R restarts instantly (same course, timer rearmed).
Persist PB + splits in localStorage keyed by (mode, seed); emit sim events for gate pass /
finish / PB so HUD and renderer stay thin adapters.
