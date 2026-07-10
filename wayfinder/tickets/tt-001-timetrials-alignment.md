---
type: wayfinder:grilling
status: closed
assignee: claude (HITL grilling, 2026-07-10)
blocked-by: []
---

## Question

What do the two time-trial modes — a parkour/speed/zipping trial and a kill-N-titans-before-
the-timer trial — mean, sharp enough to build end-to-end: course shape, checkpoint visuals,
timer semantics, HUD, titan behavior, scaling, persistence, and leaderboard?

## Resolution (all user-confirmed)

1. **Scope: one effort, both modes, execution in-map.** One worktree branch; destination is
   both modes live in production. **Solo-only v1** — co-op lobbies keep waves/matchday; co-op
   variants ruled out of scope.
2. **Signal Run (id `race`): seeded point-to-point course.** One course per seed — start gate
   plus ~10–15 sequential checkpoints routed across the city at varied heights (rooftop gaps,
   street canyons, plaza crossings) to force hook-swing/boost/ground variety. Same seed, same
   course; restart grinds the same line. (Lap circuit and stage ladder declined for v1.)
3. **Checkpoints: flare column + ring gate.** Next gate = green signal-flare smoke column
   visible map-wide + green glowing ring at pass height; the gate after shows as a dimmer
   yellow column for line-planning; finish burns red. Pass = smoke pop + chime, column dies.
   Minimap blips. Smoke/glow ride the texture-rule exceptions (transient particles, indicator
   glows).
4. **Run rules: gate = full gas.** Each ring refills gas; boost budgeting matters between
   gates but nobody strands dry. Timer starts on first input; **R restarts instantly** (same
   course, timer rearmed). **Empty city** — no titans, no damage, pure parkour. (Titan traffic
   → fog.)
5. **Race HUD: race strip + splits.** Big centered timer (m:ss.cc); GATE 4/12; per-gate split
   delta vs PB (green ahead / red behind); meters-to-gate with an edge caret when the gate is
   off-screen; small speedometer (m/s); gas bar stays; combat rows hidden.
6. **Leaderboard: local PB + global board.** localStorage always stores PB + splits per
   (mode, seed) — works logged out. Logged-in finishes POST to the existing D1/Hono stack;
   the leaderboard panel gains time-trial views; the menu surfaces a **featured seed** so
   global times contest the same course. (Times are only comparable per seed.)
7. **The Culling (id `hunt`): timed waves.** Reuses the waveLoop skeleton and the existing
   wave composition curve. Level L spawns its full roster; countdown runs; kill them all
   before zero → clock pauses, upgrade pick, next level. Zero or death = run over. (Rolling
   quota and banked-time arcade declined.)
8. **Tracking: mode-wide relentless flag.** In hunt mode every titan's aggro range is
   infinite and the abandon-chase leash (aggro × 1.5, titan.ts) is disabled; kind stats
   otherwise untouched — normals stalk, abnormals sprint, composition variety survives.
   (New 'hunter' kind and per-level aggro growth declined.)
9. **Scaling: seconds-per-kill budget.** T(L) = roster size × per-kill allowance that
   tightens each level (order of ~22 s/kill at level 1 asymptoting toward a hard floor
   ~9 s/kill — exact numbers owned by the tuning ticket). Eternal: no level cap.
10. **Hunt HUD: countdown + quota + urgency.** Centered countdown (m:ss); TITANS LEFT with a
    kill flash; level shown in the wave row. Under ~20% time: countdown reddens and pulses,
    low heartbeat/drum layer rises, subtle red vignette. Combat rows unchanged.
11. **Hunt ranking: deepest level fully cleared, score tiebreak.** Results screen: level
    reached, kills, score, best-level PB. (Total-kills and pure-score metrics declined.)
12. **Naming: "Signal Run" + "The Culling"** — AoT-native next to Wave Survival and Matchday;
    ids `race` and `hunt` ride `?mode=`.
