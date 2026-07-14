---
type: wayfinder:task
status: open
assignee:
blocked-by: [tf-001, tf-004]
---

# tf-005 · Titan appetite: the second token pool, and the fist

## Question

The feature, in one ticket: **every titan that is not hunting a soldier is hunting someone else.**

`pickChasers` (`src/sim/world.ts`) hands out `MAX_CHASERS` sticky tokens per soldier and every
untokened titan wanders decoratively. Generalise it into a second pool: untokened titans target the
nearest civilian and hunt them exactly as they hunt a soldier (the state machine already does chase,
attack and swat — none of that is new).

- **The grab.** `src/sim/grab.ts` already models grab-lift-timer-escape against the player. Point it
  at a civilian: the fist closes, the victim is lifted to nape height, and a window opens (tf-001
  sets its length and its interrupts). The holder **stands still** while it eats, which is the whole
  bargain: the easiest nape in the game is attached to someone you are failing.
- **The interrupt** resolves through the moveset that already exists: cut the nape, spear the titan,
  break the hand. Emit the events (`grabbed`/`saved`/`devoured` on the world's one event union, with
  `playerId` where credit applies) so the HUD, the audio and the co-op wire all read the same beat.
- **Token discipline.** A titan that grabs commits: it must not flip to chasing a soldier who flies
  past, or the window can never be spent. A soldier who attacks a feeding titan should take its
  attention *after* the meal is decided, not before.
- **The dark bargain, protected.** Do not add a hesitation, a mercy timer, or a difficulty scaler
  that quietly saves people for the player. The window is honest and it is often lost.

Tests: an untokened titan finds and reaches a civilian; a grab opens a window of the agreed length;
each interrupt frees the victim; an uninterrupted window devours them; a feeding titan holds its
token; the chaser pool for soldiers is unchanged (the existing tests must still pass untouched).
