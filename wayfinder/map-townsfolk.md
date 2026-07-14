# Wayfinder Map: The people in the streets — REVERTED

> **This effort was built, shipped, played, and then removed from the game on 2026-07-14 (user
> call). There are no civilians in Wings of Freedom.** The whole concept is gone: the crowd, the
> devour window, the rescue, the supply line, station stock, The Evacuation mode, the civilian
> bodies, the screams. Wave Survival is what it always was.
>
> The map is kept because the *reasoning* is worth having: what was tried, what the tuning
> probes measured, and the two silent bugs the effort surfaced (the chase-token pool stealing
> titans mid-hunt, and predation that emptied the district by wave three). Anyone who wants to
> revisit "the city has people in it" should read this before starting, not after.
>
> **What survived the revert**, because it is good on its own and independent of the crowd:
> dull blades (`oneCutSpeed`, the one-cut bar rising with the edge on the pair in hand) and the
> gasLow/bladesLow supply warnings.

Label: `wayfinder:map` · Tracker: local markdown (`wayfinder/tickets/`, `tf-` prefix) · Charted
2026-07-14 via grilling, from the townsfolk idea in `IDEAS.md` (user idea, same day). Reverted the
same day.

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

- [tf-001 · The crowd's rules](tickets/tf-001-the-crowds-rules.md) — they flee TOWARD the nearest
  soldier (so every rescue drags the crowd, and the titans, onto you); a save is the moment the
  grip breaks, but the supply only lands if they reach a station; losses are permanent for the run;
  64 people in the district, 40 underground, 0 in the Forest; people exist in Wave Survival and
  boss rush only, declared per mode.
- [tf-002 · Dull blades](tickets/tf-002-dull-blades.md) — the one-cut bar rises with the edge in
  hand (17 → ~21.5 m/s); only the bar moves. Plus the gasLow/bladesLow warnings the user asked for,
  which say what worn steel will actually cost you.
- [tf-004 · The crowd itself](tickets/tf-004-townsfolk-sim.md) — `src/sim/folk.ts` in the one world;
  they are slower than a titan's stride, deliberately, because a crowd that could save itself would
  make the soldier decorative.
- [tf-005 · Titan appetite](tickets/tf-005-titan-appetite.md) — every titan without a chase token
  hunts the crowd, and a feeding titan STANDS STILL. The load-bearing bug: the soldier chase-token
  pool was stealing titans mid-hunt, so nobody would ever have been eaten (`TitanState.prey`).
- [tf-003 · Station stock](tickets/tf-003-station-stock.md) — blades and spears run out and
  survivors carry them in; gas and hearts stay free. Merged with the Field Kit that landed on main
  in parallel: a kit carries its own steel, so it is what answers a district you have let empty.
- [tf-007 · Render the crowd](tickets/tf-007-render-the-crowd.md) — four InstancedMeshes for the
  whole district, on sourced CC0 human skin and neutral fabrics (NOT the titans' cursed leather).
  The dead lie where they fell.
- [tf-006 · The window's feel](tickets/tf-006-the-window-feel.md) — the scream (three CC0 samples,
  pitched apart so a crowd is not one person), the red minimap pulse, and a body held ALOFT and
  kicking rather than inverted in the titan's face.
- [tf-008 · The crowd on the wire](tickets/tf-008-coop-on-the-wire.md) — civilians, stock and the
  headcount on the snapshot; four new events; the content hash now covers `crowd`/`population`,
  because a mode that grew a crowd is a different game even though no id changed.
- [tf-009 · The second scoreboard](tickets/tf-009-the-second-scoreboard.md) — CIVILIANS SAVED /
  LOST on the death card, a quiet live headcount, two hard commendations, and no points for rescues,
  ever.
- [tf-010 · Tune, verify, ship](tickets/tf-010-tuning-verify-ship.md) — **destination reached
  2026-07-14**: AFK loses ~15 a wave and saves nobody; spending every window saves everyone and
  costs you the wave. The bargain holds. Live in production, solo and co-op.

## After the destination (2026-07-14, same day)

The user played it and made two calls, both shipped:

- **The crowd became its own mode, The Evacuation.** Wave Survival went back to empty streets and
  The Nine got a cleared district (a Shifter duel is a duel). The people live in exactly one mode
  now — the one that is about them — and its headcount is the life bar: lose the last civilian and
  the run ends at full health. This also fixed a half-honest thing: station stock only bites where
  a crowd can refill it, so Wave Survival's racks are bottomless again.
- **Real bodies.** The civilians were boxes standing next to procedural titans. `CivilianPool` is
  rebuilt on the Shifters' own `chain()` toolkit (tapered cylinders with sphere caps, the metaball
  stand-in), merged per part and instanced: seven draw calls for the whole district, 116 fps with
  sixty-four people.

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
