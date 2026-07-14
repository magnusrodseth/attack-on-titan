# Wayfinder Map: The people in the streets

Label: `wayfinder:map` · Tracker: local markdown (`wayfinder/tickets/`, `tf-` prefix) · Charted
2026-07-14 via grilling, from the townsfolk idea in `IDEAS.md` (user idea, same day).

## Destination

The district has people in it, and titans eat them. Live in production, in singleplayer and in
co-op: ambient townsfolk on the district and the underground; every titan that is not hunting a
soldier is hunting them; a titan that reaches one **grabs and lifts them**, opening a few seconds
in which it stands still with its nape exposed and a screaming civilian in its fist; you can spend
that window or spend it elsewhere. Survivors run supply to the stations, which now have finite
stock, and blades that dull make you need those stations. The headcount is the run's second
scoreboard, and an emptied district is a soft, atmospheric fail state that is not death.

## Notes

- **This effort carries execution in-map** (like the solo, multiplayer, time-trials and parity
  maps): alignment is HITL, then each ticket is built autonomously on a worktree branch.
- Workflow: one worktree branch off main; `pnpm test` + `pnpm typecheck` before commits;
  **feel-test in a real browser before believing any tuning number**; two-browser co-op E2E on a
  local wrangler before merge; Worker and client deploy together (ADR 0003's contract).
- Skills: `/grilling` + `/domain-modeling` for tf-001, `/prototype` for the devour window's feel,
  `/tdd` for every sim seam, `/verify` + playwright-cli for the browser passes.
- **Read `docs/adr/0003-unified-world.md` first.** It is what makes this effort possible: there is
  one world, so civilians are written once and exist in both singleplayer and multiplayer. A
  townsfolk system built a week ago would have been solo-only by default.
- **Rulings from charting (2026-07-14, user-confirmed, do not relitigate):**
  1. **The whole loop ships, not a slice**: ambient crowd + the devour window + the rescue + the
     supply line + the headcount.
  2. **Dull blades is in scope** (`IDEAS.md`, agreed 2026-07-09). It is the demand half of the same
     economy: worn blades raise the one-cut threshold, so you *need* a station, so a half-stocked
     station is a decision rather than a stat. Townsfolk without it is a supply line to nowhere.
  3. **Co-op from day one**, stance `shared`. Four soldiers covering one district is the best
     expression of the idea, not a port of it.
  4. **Rescues pay no points** (user's own ruling in `IDEAS.md`, held). Saves feed the supply line;
     scoring them turns the crowd into a farm and dissolves the tension that is the whole point.
- **The tension is the product.** A titan mid-meal is the easiest nape in the game, so letting one
  commit to a grab is tactically correct and morally awful. No system in this effort may resolve
  that for the player. If a design choice makes the bargain comfortable, it is the wrong choice.
- **The Forest deliberately has no people.** Nobody lives there; its emptiness becomes a
  characteristic rather than an omission.
- Determinism is not negotiable: the crowd seeds from `hashSeed(seed + ':folk:...')`, so `?seed=`
  replays kill the same people. The fiction makes that grim, and it stays.
- Glossary: `CONTEXT.md`. The world seam is `src/sim/world.ts` (`stepWorld`, `pickChasers`,
  `MAX_CHASERS`); the grab already models grab-lift-timer-escape (`src/sim/grab.ts`); stations are
  `Arena.stations` and are **infinite refills today** (`worldResupply`), which this effort changes.

## Decisions so far

<!-- one line per closed ticket -->

## Not yet specified

- **Modes other than Wave Survival.** The Culling is relentless (every titan hunts the soldiers, so
  nobody is free to eat), Signal Run has no titans at all, and boss rush is one Shifter. Whether the
  crowd exists in those modes, and what it does there, is a per-mode stance question that tf-001
  will open and may not close.
- **The evacuation escalation.** Once ambient townsfolk work, a rare wave where a column of them
  must cross the district to the gatehouse is a variant, not a new system. Revisit after the loop
  lands.
- **Does an emptied district have a mechanical consequence**, or only an atmospheric one (bare
  stations, silent streets)? Deliberately open until the headcount can be felt in a real run.
- **Crowd noise as an aggro signal.** A panicking crowd pulling titans is evocative and might be a
  trap; it hangs on how the second token pool behaves in practice.
- **Population as a perf budget.** The count is a knob, not a promise; the ceiling is whatever the
  instanced pool holds at 60 fps with four soldiers and a full wave.

## Out of scope

- **Points for rescues.** Ruled out above, permanently.
- **Co-op downed/revive** (`IDEAS.md`). A neighbouring rescue system, and a genuinely good next
  effort, but a different one: it is about soldiers, not civilians.
- **Ghost replays, the Daily Expedition, Create Your Soldier.** Live efforts elsewhere.
- **Townsfolk in the Forest.** A scope ruling, not fog: nobody lives there.
