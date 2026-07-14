---
type: wayfinder:grilling
status: closed
assignee: claude (HITL grilling, 2026-07-14)
blocked-by: [de-002, de-003]
---

## Question

How does a board rank a different metric every day, and what exactly do the Standings measure?

## Resolution (user-confirmed 2026-07-14, except where marked "decided by agent")

1. **Ranking is data, not a special case per mode** (decided by agent). The result row carries a
   `metric` discriminator and the ranking rule is a table keyed on it, so a new mode never
   reopens this ticket:

   | metric | ranks by | tiebreak |
   |---|---|---|
   | `time` (Signal Run) | lowest | earliest submitted |
   | `level` (The Culling) | highest | score, then earliest |
   | `score` (Wave Survival) | highest | wave, then earliest |

2. **"Won" is rank-at-read, and there is no cron** (decided by agent). A past UTC day's board is
   final by definition, so a win is just "rank 1 on a date < today" computed at query time.
   Today's board is live and displayed as **provisional** — nobody is credited a win until the
   day closes. This removes the scheduled-job machinery entirely.

3. **A streak is kept by FINISHING, not by showing up.** The streak counts consecutive UTC days
   with a *posted result*. Abandoning breaks it — which is what gives de-003's abandoned-run rule
   its teeth: quitting costs you the day, the placement, **and** the streak.
   - The streak is alive if the last posted result is today **or** yesterday (you have until UTC
     midnight to keep it). Older than that, it is zero.
   - Rejected: deploying keeps it (a streak that means "I clicked Deploy 40 times" is thin); no
     streak at all (it is the strongest single reason to return, which is what this map is for).

4. **The Standings show expeditions, finished, won, streak — no podium column, for now.** With a
   handful of players a podium means "everyone who showed up", and a table of 100% podium rates
   reads as a joke. **The underlying results are all retained**, so podiums can be backfilled and
   the column switched on later once days routinely draw a real field (≥10 runners is the
   suggested threshold — confirm when it is close to true).
   - `expeditions` = days claimed (you took the field). `finished` = days with a posted result.
     Showing both is honest: it makes the gap between the two visible, and that gap is exactly
     the abandoned runs.

5. **Computed live** (decided by agent): a single aggregate query over `daily_runs` per open of
   the panel. D1 at hobby scale, one source of truth, and no materialized per-account row to
   drift out of sync. Revisit only if it is ever actually slow.

6. **The Hall of the Fallen leads with the daily.** Today's expedition board and the Standings
   sit at the top. The per-arena trial boards (shipped 2026-07-14) still exist, but only render
   when the course is genuinely **contested** — the daily's course, or a `?seed=` link someone
   shared. On an unshared random free-play seed they are replaced by *your own PBs* for that
   arena, because a board nobody else can ever roll onto is not a board.
   - This is the answer to the consequence de-002 raised: free play's random seed would otherwise
     have left six boards permanently reading "No times on this course yet", which makes a live
     game look abandoned.
   - **The daily result double-writes** to the existing `trials` table as well as `daily_runs`
     (decided by agent). The daily board is one-attempt; the *course* board is a normal keep-best
     PB board. Same course, two honest readings — and it keeps the per-arena boards populated,
     since the daily's course is the one course a crowd contests each day.

## Consequence of sealed orders (de-002 amendment) on this ticket

The seed is server-held and revealed only at claim, so **the client cannot render the daily's
board before claiming** — it does not yet know the scope. Today's board is therefore fetched by
*date*, not by seed: `GET /api/daily/board?date=` returns rows already joined to usernames, and
the seed itself stays sealed until the day closes. Sealing the seed must not seal the *board* —
seeing who is ahead of you today is half the reason to run it.
