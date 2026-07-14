---
type: wayfinder:task
status: closed
assignee: claude (worktree-daily-roll, 2026-07-14)
blocked-by: []
---

## Resolution (built 2026-07-14, branch `worktree-daily-roll`)

**`src/sim/daily.ts`** (new, pure, 12 tests): `dailyDate` (UTC), `dayIndex`, `dailyRoll`,
`dailyCourseSeed`.

1. **The roll is the closed form, with NO per-cycle shuffle.** de-002's shuffle is dropped: it
   breaks the no-repeat guarantee across cycle boundaries, and the year-long test proves it
   (`expected 'waves' not to be 'waves'`). See the amendment on de-002. Consecutive days differ
   in both mode and map; all 9 pairings appear once per cycle; Bossrush never rolls.

2. **`daily.ts` does not import the registries.** The Worker imports this module (de-003 §4), and
   importing `GAME_MAPS` would drag citygen, forestgen and undergroundgen into the Worker bundle.
   The mode and map ids are **data** here, and `daily.test.ts` is what holds them to the
   registries — which *is* the guard: add, rename or remove a map or mode and it fails loudly,
   forcing whoever did it to decide whether the daily wants it. It also asserts the walk's
   preconditions (≥2 modes, ≥3 maps — at two maps the map step can be 0 mod N and the arena
   would silently start repeating).

3. **Verified the Worker can reach it**: a throwaway `server/_probe.ts` importing the module
   compiles clean under `tsc -p server`. `daily.ts` depends only on `rng.ts`, which imports
   nothing. de-007 is cleanly unblocked.

4. **The UTC bug is fixed.** `dailySeed()` built its date from `new Date()`'s *local* getters, so
   at 23:30 UTC a soldier in New Zealand was on `wall-2026-7-15` while everyone else was on
   `wall-2026-7-14` — a different city, and a different board, at the same instant. Pinned by
   running the suite under `TZ=Pacific/Auckland` and `TZ=America/Los_Angeles`, not just in the
   author's timezone. Browser-verified: the start plate reads `seed wall-2026-07-14`.

## Moved to de-008, deliberately

Two items in the original body were **not** built here, because building them now would be wrong:

- **Switching free play to a random seed.** The daily seed is currently the only thing giving
  everyone a shared course. Randomize free play *before* the daily exists and there is no shared
  course at all — every per-arena board goes dead, with no daily to take over. It lands with the
  daily, not before it.
- **The "this run is a daily" flag on the run save.** Nothing would read it until de-008 starts a
  daily run. A field written by nothing and read by nobody is exactly the placebo defect fixed
  this morning, and it would force a `SAVE_VERSION` bump that discards every in-flight run for
  zero benefit. It belongs in the slice that first creates a daily run.

## Original question (kept for the record)

Build the roll, the sim wrapper, and the free-play change.

Graduated from fog once de-002 settled the derivation. Pure sim work, test-first per repo
convention (`src/sim/` is stepped at 120 Hz and fully unit-tested).

- **`src/sim/daily.ts`** (new, pure): the closed-form Latin-square walk from de-002 —
  `modeIdx = d % 3`, `mapIdx = (d + floor(d / 3)) % 3` over days since a fixed UTC epoch, with the
  index→id mapping shuffled per 9-day cycle via `hashSeed('daily:cycle:' + floor(d / 9))`. Pool is
  `waves`, `race`, `hunt` — **Bossrush excluded**.
  - **This module is imported by the worker too** (de-003 §4): the server derives the roll itself
    and never trusts the client. One module, two consumers. Check `server/tsconfig.json` can reach
    `src/sim/` — if it cannot, that is the first problem to solve, and duplicating the formula is
    not the answer.
  - Tests: walk a year and assert no consecutive repeat of mode *or* map, and that all 9
    combinations appear exactly once per 9-day cycle.
- **UTC, everywhere.** `dailySeed()` in `src/main.ts` builds `wall-YYYY-M-D` from local
  `new Date()` — a live bug (two players either side of a timezone are on different seeds right
  now). The daily's date is UTC; pin it with a test that fakes a non-UTC timezone.
- **Free play rolls a random seed per session** (de-002 §6). Touches seed resolution in
  `main.ts`. `?seed=` URLs still work, and the run save still resumes.
- **The daily as a run**: a claimed daily is just `(mode, map, seed)` from the server, driven
  through the existing registries — the sim needs *no* new mode. What it needs is a flag on the
  run marking it as the day's expedition, so the client can suppress Restart Run, spend the local
  mark, and route the result to the daily submit. Keep that flag in the run save
  (`SAVE_VERSION` bump) so a refresh resumes the daily as a daily.
