# Wayfinder Map: The Daily Expedition

Label: `wayfinder:map` · Tracker: local markdown (`wayfinder/tickets/`, `de-` prefix) · Fresh
effort charted 2026-07-14 via grilling.

## Destination

**The Daily Expedition is live at attack-on-titan.magnusrodseth.com**: one expedition per UTC
day, rolled from the mode and map registries (today Signal Run in the Forest, tomorrow The
Culling in the Underground), one attempt per soldier — spent the moment they deploy, claimed
server-side. Today's board ranks by whatever that day's discipline measures; above it sits the
one thing that never resets, **the Standings** (expeditions run, days won, podiums, streak).
Verified in a real browser, merged to main.

Why now: the Featured Course button was removed on 2026-07-14 (it promoted a *seed*, not a map,
so once the map registry grew it no longer named one shared line). Nothing currently anchors
global competition. This is its replacement, and a better one — the anchor stops being a course
and becomes a record.

## Notes

- **This effort carries execution in-map** (like the solo, multiplayer and time-trials maps):
  the decisions are ticketed HITL; the build slices graduate out of the fog once they land.
- **State, 2026-07-14**: every design decision except the UI shape is settled (de-001 → de-004),
  and **de-006 is built** (`src/sim/daily.ts`, branch `worktree-daily-roll`). The frontier is now
  **de-007** (the Worker: schema, claim, submit, board, standings — unblocked, and the module it
  needs is proven to compile under `tsc -p server`) and **de-005** (prototype the daily's UI,
  which needs a human to react to it). de-008 (client + ship) waits on both.
- Workflow: one worktree branch off main; `pnpm test` + `pnpm typecheck` before commits;
  playwriter + `window.__aot` for render/HUD verification; merge only after a prod-shape E2E.
- Skills in play: tdd (sim seams first), grilling for any ticket carrying a real user decision,
  prototype for the menu/HUD shape, verify + playwriter for browser E2E.
- **Most of this already exists by accident.** `dailySeed()` in `main.ts` already puts every
  player on `wall-YYYY-M-D`, and boards already key by `mapScopedSeed(map, seed)` — so everyone
  is *already* playing the same course each day and posting to a shared board. What is missing
  is the intent around it: the announced roll, the single attempt, and a board that resets on
  purpose. Build accordingly: this is a wrapper over shipped seams, not a new game.
- Seams: `GAME_MODES` (`src/sim/modes.ts`), `GameMap` registry (`src/sim/maps.ts`), trial
  post/boards (`server/trials.ts`, `src/net/client.ts`), run save (`src/sim/persist.ts`),
  determinism (`hashSeed(seed + ':purpose:N')`, never a shared stream).
- Texture mandate (repo CLAUDE.md) applies to any new visible mesh. Glossary: `CONTEXT.md`.
- The solo map (`wayfinder/map.md`) stays the authority for movement/combat; the multiplayer map
  owns the account + leaderboard stack this mode posts into.

## Decisions so far

- [Daily Expedition alignment](tickets/de-001-daily-alignment.md) — the daily rolls a whole run
  (mode + map + seed) per UTC day, one board a day; **deploying** spends the attempt (refresh
  resumes the same run, restart is not offered); the worker **claims** the attempt server-side at
  deploy, so signed-out play is allowed but unranked; the thing that accumulates is a persistent
  **Standings** table, not the daily board.
- [The roll](tickets/de-002-the-roll.md) — pool is 3 modes × 3 maps (**Bossrush excluded**: the
  worst mode to hand someone on a single attempt); consecutive days never repeat mode *or* map,
  via a closed-form Latin-square walk that avoids the roll-depends-on-yesterday recursion trap;
  the day boundary is **UTC** (`dailySeed()`'s local `new Date()` is a live bug); **free play
  rolls a random seed**, so today's line cannot be rehearsed by accident. Amended by de-004: the
  mode and map are public and announced, but the **seed is sealed** and server-held.
- [The attempt claim](tickets/de-003-attempt-claim.md) — an **abandoned claim is a wasted day**
  (no heartbeat, no reclaim: quitting cannot erase a bad run, it costs you the run *and* the
  placement); a failed claim starts the run **unranked and says so**, because a hobby worker
  having a bad day must not take the headline mode down with it; submit requires a claim; the
  worker derives the roll itself and never trusts the client. The practice loophole is
  **knowingly accepted** and written down — the real fix is a server-authoritative sim, which is
  out of scope.
- [The board and the Standings](tickets/de-004-board-and-standings.md) — ranking is a metric
  table (time/level/score), not a special case per mode; **"won" is rank-at-read** on closed
  days, so there is no cron; a **streak is kept by finishing**, and abandoning breaks it; the
  Standings show expeditions / finished / won / streak with **no podium column** until the field
  earns one (results are retained so it can be backfilled). **Sealed orders**: the seed is issued
  only by the claim, so the course cannot be rehearsed — and the Hall of the Fallen leads with the
  daily, showing per-arena boards only on a *contested* course.

- [The roll module and the sim](tickets/de-006-roll-module-and-sim.md) — `src/sim/daily.ts` built
  and tested (12 tests): the closed-form walk, **no per-cycle shuffle** (it broke the no-repeat
  guarantee across cycle boundaries — de-002 amended), the module deliberately does not import the
  registries so the Worker can take it without dragging the arena generators in, and the
  registries are held to it by a guard test instead. The **UTC bug is fixed**: `dailySeed()` was
  building its date from local getters, so a soldier in New Zealand was on a different city and a
  different board at the same instant. The free-play random seed and the daily run-save flag were
  **moved to de-008** — shipping either before the daily exists would do harm.

## Not yet specified

- **Commendations for the daily.** The tracker rides the event bus already, so a daily-specific
  set (first expedition, a week's streak, a day won) is cheap. Still fog only because the roster
  is a taste call, not because it is blocked — de-004 gave it the streak/win semantics it needed.
- **Season boundaries.** Whether the Standings ever reset (a season) or run forever. It only
  becomes a real question once there are enough runners for a streak to mean something.
- **Podiums.** Switched off at launch (de-004 §4). The threshold for turning them on — suggested
  ≥10 runners on a day — is a decision to make when it is nearly true, not now.

## Out of scope

- **Ghost replays.** Determinism carries them (record the input stream, replay a translucent
  ghost), and the world-record ghost riding the daily line is the obvious endgame — but it is a
  whole effort past this destination. It returns as its own map, not as a ticket here.
- **A co-op daily.** Lobbies keep their own world; the daily is solo, like every other trial.
- **Sim-level anti-cheat.** Solo results come from the client sim (the existing trials already
  accept this, with plausibility gates only). The attempt *claim* is enforced server-side; the
  *result* is not, and hardening that is a different effort against a different threat model.
