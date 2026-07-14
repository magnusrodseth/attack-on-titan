---
type: wayfinder:task
status: open
assignee: 
blocked-by: []
---

## Question

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
