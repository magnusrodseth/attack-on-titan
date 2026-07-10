# Wayfinder Map: Time trials — Signal Run & The Culling

Label: `wayfinder:map` · Tracker: local markdown (`wayfinder/tickets/`, `tt-` prefix) · Fresh
effort charted 2026-07-10 via grilling.

## Destination

Two new solo game modes live in production at attack-on-titan.magnusrodseth.com: **Signal Run**
(seeded point-to-point parkour time trial through flare-marked gates) and **The Culling**
(eternal timed levels — clear each roster of relentless, map-wide-tracking titans before the
countdown). Local PBs always; logged-in times on the global leaderboard with a featured seed.
Built together in one worktree branch, verified in a real browser, merged to main.

## Notes

- **This effort carries execution in-map** (like the solo and multiplayer maps): alignment
  happened HITL via grilling (tt-001); build proceeds autonomously ticket by ticket.
- Workflow: one worktree branch off main; `pnpm test` + `pnpm tsc --noEmit` before commits;
  playwriter + `window.__aot` for render/HUD verification; merge only after prod-shape E2E.
- Skills in play: tdd (sim seams first), verify + playwriter (browser E2E), grilling for any
  ticket that surfaces a real user decision.
- Texture mandate: flare smoke = transient particle effect, ring gates = gameplay indicator
  glow — both accepted exceptions. Any new *solid* visible mesh still needs a sourced CC0
  texture first.
- Sim changes stay pure and tested in `src/sim/`; both modes are `GAME_MODES` registry entries
  (`src/sim/modes.ts`) — the menu picks them up automatically.
- Glossary: `CONTEXT.md` (Time trials section). Solo map (`wayfinder/map.md`) remains the
  authority for core movement/combat decisions; multiplayer map owns the leaderboard stack.

## Decisions so far

- [Time-trials alignment](tickets/tt-001-timetrials-alignment.md) — one effort ships both
  modes, solo-only v1; Signal Run: seeded point-to-point course of flare-column + ring gates,
  empty city, gate = full gas, first-input timer, race-strip HUD with splits; The Culling:
  timed waves on the waveLoop skeleton, mode-wide relentless aggro, seconds-per-kill time
  budget tightening per level, countdown HUD with urgency; local PB + global D1 board keyed by
  (mode, seed) with a featured seed; ranked by time (race) and deepest level cleared, score
  tiebreak (hunt).
- [Course generator](tickets/tt-002-course-generator.md) — `generateCourse` in
  `src/sim/course.ts`: 10–15 gates walk a point-to-point crossing (0.78 × wall radius each
  side) on `:course:0`/`:course:1` streams; 35–70 m spacing snapped to walkable streets
  ≥ 12 m inside the wall, consecutive gates street-connected; three height tiers (street
  4–7 m/r4, canyon 10–16 m/r5, rooftop 20–28 m/r6) shuffled so every course mixes all three.
- [Signal Run sim](tickets/tt-003-signal-run-sim.md) — mode `race` in `src/sim/race.ts`:
  clock arms on first control input, rings pass in order and refill gas, R restarts the same
  course instantly, finish → new phase `finished` with splits; PB + splits persist at
  `aot-odm-tt:race:<seed>`; `GameMode.step` now receives the tick's input; a mid-run refresh
  relights the line instead of resuming the clock.
- [The Culling sim](tickets/tt-006-culling-sim.md) — mode `hunt` in `src/sim/hunt.ts` on the
  waveLoop skeleton: relentless = no aggro range, no chase cap, no leash (kind stats intact);
  countdown budget = roster x allowance, allowance 22 s/kill decaying 0.85/level to a 9 s
  floor (constants exported for tt-009); clock pauses through upgrades; `huntUrgency` at 20%,
  `huntTimeout` at zero; deepest-cleared PB (score tiebreak) at `aot-odm-tt:hunt:<seed>`; the
  countdown rides the refresh save.
- [Checkpoint visuals](tickets/tt-004-checkpoint-visuals.md) — `GatesView`
  (`src/render/gates.ts`): recycled flare rigs (beam + 240 m soft-sprite smoke column) green
  on the active gate / dim yellow on the next / red on the finish, pulsing pass ring faced
  along the approach; pass = smoke pop + chime; minimap blips; verified day + night via
  playwright-cli + `__aot`.
- [Race HUD](tickets/tt-005-race-hud.md) — race strip on the brand fonts: m:ss.cc timer,
  GATE n/N, PB split deltas flashed green/red, meters-to-gate with an edge caret from camera
  projection; `body.race` hides combat rows (gas stays, speedo goes m/s); results overlay
  with split table + "Run It Again — R"; `__aot.step` now routes events like the live loop.
- [Hunt HUD](tickets/tt-007-hunt-hud.md) — countdown strip (m:ss + TITANS LEFT kill-flash),
  levels in the wave banners, urgency at 20%: red pulsing clock, creeping vignette, and a
  procedural heartbeat GainNode on the sfx bus driven from state each frame; run-over card
  shows level/cleared/kills/score + best-level PB ("The Clock Ran Out" on timeout).
- [Global leaderboard](tickets/tt-008-global-leaderboard.md) — `trials` D1 table keyed
  (user, mode, seed) with keep-best upserts (`server/trials.ts`, unit-tested plausibility
  gates); `POST /api/trial` + `GET /api/trials?seed=`; client posts on race finish and hunt
  run-over when signed in; leaderboard panel gains per-seed boards; menu gains the featured
  course (`shiganshina`, manual v1). Verified on local wrangler+D1; **deploy deferred to
  tt-010**.
- [Verify & ship](tickets/tt-010-verify-ship.md) — **destination reached 2026-07-10**: merged
  with main's focus-strike work, remote D1 migration + worker deploy, pushed to main, both
  modes verified live in production via `__aot`. tt-009 (tuning playtest) stays open as
  post-launch tuning; every number it owns is an exported constant.

## Not yet specified

- Ghost replay: racing a translucent ghost of your PB run (needs input/pose recording).
- Titan-traffic variant of Signal Run — docile wandering titans as moving grapple anchors.
- Medal thresholds (gold/silver/bronze target times per course) and how they're derived.
- Featured-seed rotation (weekly cadence, automation); v1 surfaces one manually chosen seed.
- Stage ladder: multiple course lengths per seed (sprint/marathon) with their own boards.
- Hunt pace-bar telemetry (required kills-per-minute vs actual) — declined for v1 HUD, may
  return after playtests.
- Boss-hunt levels (guaranteed footballers every 3rd Culling level) — declined for the v1
  scaling shape, revisit as spice once tuning lands.

## Out of scope

- Co-op play of either mode: shared-clock racing, relay checkpoints, co-op hunts (solo-only
  decision, tt-001). A later effort with a redrawn destination owns it.
- Racing other players' ghosts (multiplayer ghost sync).
- Mobile/touch (gated out of the game entirely).
