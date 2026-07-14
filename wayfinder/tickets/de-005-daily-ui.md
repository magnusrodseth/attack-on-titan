---
type: wayfinder:prototype
status: open
assignee: 
blocked-by: []
---

## Question

What does the Daily Expedition look and feel like, from the menu plate to the moment the attempt
is spent?

This is the ticket that decides whether the daily reads as *the* headline of the game or as a
fifth button in a list. Prototype it (`/prototype`) against the real menu — the chamfered plates,
Cloister Black titles and brass rims already exist in `index.html`, so a rough pass is cheap. The
decisions below are settled; do not reopen them, design *for* them.

## What is already decided (de-001 → de-004, all 2026-07-14)

- The daily rolls **mode + map + seed** per UTC day. Bossrush is excluded; the other three modes
  and all three maps roll, never repeating yesterday's mode or map.
- **Sealed orders**: the plate announces the *discipline* and the *arena*, but the seed is
  server-held and revealed only when you claim. You cannot see the line before you commit.
- **Deploying spends the day.** No Restart Run on the daily. A refresh resumes the same run.
- **Abandoning posts nothing** and breaks your streak. Quitting is never an escape.
- Today's board is **provisional** until UTC midnight; wins are only credited once the day closes.
- The **Standings** (expeditions, finished, won, streak — no podium column yet) are the thing that
  accumulates, and the Hall of the Fallen leads with the daily board and the Standings.

## What the prototype must resolve

- **The plate.** Where does today's expedition sit — a headline *above* Deploy Your Soldier, or a
  peer beside Game Mode? It has to carry: the discipline, the arena, the sealed-orders state, and
  the fact that you get one shot. ("TODAY · THE CULLING · THE UNDERGROUND · sealed orders · one
  attempt")
- **The commitment moment.** A player who does not understand that Deploy spends the day will feel
  robbed exactly once, and that once may be the last time they play. What warns them — and does it
  warn them *every* day (friction on the habit we are trying to build) or only the first time?
  `confirmIfMidRun` already exists as a confirm surface.
- **The spent state.** The screen a returning player sees most: what you got, where you placed
  (provisional), your streak, and how long until the next expedition. This carries the retention
  weight of the whole feature — it has to make you want tomorrow.
- **The streak as an object.** A number, a row of pips, something that visibly *hurts* to break.
  It is the one number a player will come back for.
- **Three unhappy states, none of which may feel like a wall**:
  1. **Signed out** — "you can run it, it will not post; enlist to join the Standings".
  2. **Headquarters unreachable** (de-003) — "this expedition will not post. Take the field
     anyway?"
  3. **Already spent, no save** — the cross-device dead end (claimed on the laptop, opened on the
     desktop). The day is gone and there is no run to resume. This must *explain itself*, not
     present a broken button.
- **The results screen.** The existing finish/death cards are per-mode; the daily needs one more
  line: where today's run landed, and what it did to the streak.
- **The Hall of the Fallen restructure.** Daily board + Standings on top; the per-arena trial
  boards only render on a contested course, and are replaced by your own PBs on an unshared seed.

Deliver: a prototype the user reacts to (screenshots or a live branch), and the settled shape.
