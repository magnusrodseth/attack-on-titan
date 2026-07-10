---
type: wayfinder:task
status: closed
assignee: claude (worktree-timetrials session, 2026-07-10)
blocked-by: []
---

## Question

Build The Culling mode sim, test-first: `GAME_MODES` entry (id `hunt`, name "The Culling",
menu copy) on the waveLoop skeleton with the existing wave composition curve; a mode-wide
relentless flag that makes every titan's aggro range infinite and disables the abandon-chase
leash (titan.ts aggro × 1.5 rule) without touching kind stats; countdown T(L) = roster size ×
per-kill allowance tightening per level toward a hard floor (constants exported for the
tuning ticket); clock pauses during the upgrade intermission; timer zero or death ends the
run. Persist deepest-level-cleared PB (score tiebreak) in localStorage keyed by (mode, seed);
emit events for level clear / final-minute urgency / run over.

## Resolution

Built in `src/sim/hunt.ts` (tests: `src/sim/hunt.test.ts`, 9 specs). `createHuntMode`
wraps the shared `waveLoop(waveComposition)` skeleton — injected by `modes.ts` so the
modules stay cycle-free — and registers as id `hunt`, name "The Culling".

- **Relentless**: `GameState.relentless` (set by the mode, cleared by `startGame`).
  `stepTitan` gained a `relentless` param: wander flips to chase at any distance and the
  abandon-chase leash (aggro x 1.5) is disabled; `pickChasers` drops both the aggro-range
  filter and the MAX_CHASERS cap, so the whole district converges. Kind stats untouched —
  normals stalk, abnormals sprint. A regression spec pins Wave Survival's aggro + leash.
- **Countdown**: budget = roster size x `huntAllowance(L)` where allowance =
  `FLOOR + (START - FLOOR) x DECAY^(L-1)` with START 22 s/kill, FLOOR 9, DECAY 0.85 —
  all exported constants owned by the tuning playtest (tt-009). The clock only ticks in
  phase `playing` (it pauses through the upgrade pick) and resets to the next level's
  budget on `chooseUpgrade`. Eternal: no level cap.
- **Events**: `waveClear` doubles as the level clear; `huntUrgency` fires once when the
  clock crosses `HUNT_URGENCY_FRACTION` (0.2); `huntTimeout {level, cleared}` fires at
  zero and sets phase `dead`.
- **PB**: banked at every level clear — deepest level fully cleared, score breaking ties,
  never downgrading — at `aot-odm-tt:hunt:<seed>`.
- **Persist**: `SavedRun` gained an optional `hunt` slice `{timeLeft, budget,
  urgencyFired}` so a refresh keeps the countdown (no clock-reset cheese); `restoreRun`
  re-derives `relentless` from the mode and reloads the PB. Saves from before the slice
  rebuild a full clock; Signal Run deliberately restores nothing and relights the line.
