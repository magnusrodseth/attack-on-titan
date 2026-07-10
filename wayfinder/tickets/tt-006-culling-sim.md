---
type: wayfinder:task
status: open
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
