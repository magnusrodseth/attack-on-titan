---
type: wayfinder:grilling
status: closed
assignee: claude (worktree-townsfolk, 2026-07-14)
blocked-by: []
---

# tf-001 · The crowd's rules

## Question

The alignment ticket: everything about how the crowd behaves that cannot be derived from the code,
sharp enough that every later ticket is a build. Grill it one question at a time.

- **The devour window.** How long is the beat between the fist closing and the bite? What
  interrupts it: a nape cut only, or a spear, a wrist/hand cut, any damage to the holder? What
  happens to the civilian when it breaks (dropped from height, hurt, killed by the fall)? What does
  a titan do with a rescued meal snatched from its hand?
- **What a save actually is.** Is a civilian saved the moment the grab breaks, or only when they
  reach a station on their own feet (which makes the rescue a two-part act and lets a saved
  civilian be re-eaten on the way)? The second is more interesting and more cruel. Decide.
- **Flight.** Do they flee *toward* the player (turning every rescue into a liability that drags
  titans onto you) or away from danger toward cover and stations? This single choice decides
  whether the crowd is a resource, a hazard, or both.
- **Permanence.** Within a run, do the dead stay dead and the district thin out wave by wave, or
  does it repopulate between waves? The headcount as a second scoreboard only has weight if losses
  are permanent within a run.
- **Population.** How many people, per arena, and how densely? Does the underground carry a
  different number and a different feel from the district?
- **The Shifter question.** Does a boss wave clear the streets first (a Colossal arriving to an
  empty district is its own statement), or do the Nine walk into a populated city and the summons
  eat too?
- **The other modes.** The Culling is relentless (nothing is free to eat), Signal Run has no titans,
  boss rush is one Shifter. Does the crowd exist there at all? A per-mode answer, and 'no' is a
  legitimate one — but under ADR 0003 it has to be *declared*, not omitted.
- **The bargain, checked.** For each answer above: does it make letting a titan eat someone
  *comfortable*? If yes, it is the wrong answer.

## Resolution (user-confirmed, 2026-07-14)

- **Flight: they run TOWARD the nearest soldier.** A soldier is safety, so every rescue drags a
  screaming crowd onto your position and the titans follow them in. The safest place to stand is
  wherever nobody needs you. This is the choice that makes the crowd a hazard as well as a
  resource, and it is the reason the feature bites.
- **A save is the moment the grip breaks** (kill or stagger the holder). They drop, counted,
  credited to whoever broke it (`world.lastHitBy`). But the SUPPLY only lands if they reach a
  station on their own feet, and they can be caught again on the way: the rescue is an instant,
  the delivery is an escort.
- **Permanence: the dead stay dead for the run.** The district only ever thins. An emptied one
  goes quiet (bare stations, silent streets) and stays that way.
- **Population: 64 (district), 40 (underground), 0 (Forest).** Declared in the map registry, so
  a new arena cannot forget to answer.
- **Modes: Wave Survival and boss rush have people; The Culling and Signal Run do not** (declared
  in `GameMode.crowd`: relentless leaves nobody free to eat, and a race has no titans at all).
  The Nine walk into a living city and their summons eat like anything else.
- **The window: 3.6 s**, interrupted by killing OR staggering the holder (so a spear counts).
- **Tuning discovered in play, not designed at a desk**: titans only hunt prey they can SEE
  (`FOLK_HUNT_RADIUS` 75 m) and go quiet for 25 s after a meal (`SATIATED_SECONDS`). Without both,
  the first probe emptied the district by wave three: predation was a conveyor, not a rhythm.
