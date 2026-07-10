---
type: wayfinder:task
status: closed
assignee: claude (worktree-timetrials session, 2026-07-10)
blocked-by: [tt-002]
---

## Question

Build the Signal Run mode sim, test-first: `GAME_MODES` entry (id `race`, name "Signal Run",
menu copy), no titans spawned, timer armed on first player input, sequential gate-pass
detection (in order only), full gas refill on each gate pass, red finish gate ends the run
with total time + per-gate splits, R restarts instantly (same course, timer rearmed).
Persist PB + splits in localStorage keyed by (mode, seed); emit sim events for gate pass /
finish / PB so HUD and renderer stay thin adapters.

## Resolution

Built in `src/sim/race.ts` (tests: `src/sim/race.test.ts`, 6 specs), registered in
`GAME_MODES` as id `race`, name "Signal Run". Decided semantics:

- **Seam changes**: `GameMode.step` now receives the tick's `InputState`; `GamePhase`
  gained `'finished'`; `GameState` gained `race: RaceState | null`; new events
  `raceArmed` / `gatePass {index, total, split, delta}` / `raceFinished {time, splits,
  pb, delta}` / `raceRestart` keep HUD and renderer thin.
- **Clock**: armed by the first control input (move/jump/gas/hooks/slash/fire — looking
  around and R do not arm); counts from the arming tick; only runs in phase `playing`.
- **Gates**: pass in order only (a later ring is inert while an earlier one is lit);
  pass = player inside the gate sphere (center + radius from tt-002); every pass refills
  gas to max. Finish sets phase `finished`.
- **R restart**: `input.resupply` edge mid-run restarts instantly — same `Course` object,
  fresh soldier, score cleared, clock rearmed. `restartRace(g)` is exported for the
  finish-screen adapter (the sim is frozen once finished).
- **PB**: localStorage `aot-odm-tt:race:<seed>` stores `{time, splits}`; only a faster
  run overwrites; `gatePass.delta` reports the live split minus the PB split.
- **Refresh**: `persist.ts` carries no mode state and a timed run must not resume
  mid-flight — a restored race run self-heals by relighting the same line (refresh = R).
