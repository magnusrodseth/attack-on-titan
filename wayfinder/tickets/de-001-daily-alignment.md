---
type: wayfinder:grilling
status: closed
assignee: claude (HITL grilling, 2026-07-14)
blocked-by: []
---

## Question

What is the Daily Expedition, sharp enough to chart: one discipline or a rotating one, what
spends the single attempt, what accumulates across days, and how honestly the attempt is
enforced?

## Resolution (all user-confirmed, 2026-07-14)

1. **The daily rolls a whole run: mode + map + seed.** Monday is Signal Run in the Forest,
   Tuesday The Culling in the Underground, Wednesday Wave Survival in the District. One board a
   day, so attention never splits across thin per-mode boards — the failure mode the per-arena
   trial boards are already exposed to. Every mode and map already shipped is content for this;
   the daily is a wrapper over the two registries, not a new game.
   - Consequence: the board ranks a different metric on different days (a time, a level, a
     score). That is accepted, and it is why the *daily* board cannot be the thing that
     accumulates — see 4.
   - Rejected: one fixed discipline with a rotating arena (loses three quarters of the shipped
     content); a daily per mode (four thin boards a day — the ghost-town risk, multiplied).

2. **Deploying spends the attempt.** The moment you take the field, the day is committed —
   death, quit, closed tab, crash, that was your run. There is no Restart Run on the daily.
   - A refresh **resumes the same run** where it left off; the run save (`src/sim/persist.ts`)
     already does exactly this, so a reload is not a reset.
   - Rejected: spending it when the run *ends* (makes restart-until-good-RNG the strategy, so
     the board rewards patience over skill); spending it on submission (a best-of-N leaderboard
     with extra clicks).

3. **The worker claims the attempt at deploy.** Hitting Deploy calls the server, which records
   the attempt against the account for that UTC date *before the run starts*. Clearing
   localStorage or switching browsers changes nothing: the board is genuinely one run per
   soldier.
   - Signed out, the daily is **playable but unranked** — a visitor arriving on a shared link
     can always take the field; they just cannot post. (Account-only was rejected: too harsh a
     front door for a browser game people reach by link.)

4. **The Standings are the anchor — not the daily board.** Today's board ranks by the day's
   native metric and is gone tomorrow, by design. Above it sits one persistent table that never
   resets: **expeditions run, days won, podium finishes, current streak.** That table is what
   the removed Featured Course button was reaching for, done properly: the anchor stops being a
   fixed course and becomes a record.
   - Rejected: normalized "Expedition Points" (an abstraction layer over the thing you actually
     did, and placement scoring needs a field big enough to mean something); no aggregate at all
     (rebuilds the exact gap that removing Featured opened this morning).
