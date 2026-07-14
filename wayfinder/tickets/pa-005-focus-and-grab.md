---
type: wayfinder:grilling
status: closed
assignee: claude (worktree-unified-world, 2026-07-14)
blocked-by: []
---

# pa-005 · Focus and the grab QTE: the two features that cannot simply be shared

## Question

Two solo mechanics have no co-op existence, and they got there differently. Focus (bullet-time, Q)
is *deliberately* absent: `coopClient.ts` force-sets `focusActive = false` every tick with a comment
saying a shared world cannot slow down for one soldier. The grab QTE (`src/sim/grab.ts`, a titan
picks you up and you mash your way out) is *accidentally* absent: `coop.ts` simply never imports it,
with no comment, no decision, no test. In co-op today a titan that would grab you in solo just
swats you.

These two are the first users of the stance declaration (pa-002), so their answers set its shape.

- **Focus.** Solo-only forever (the honest reading of the ruling), or is there a shareable version:
  a personal camera/FX effect with no world timescale, a world-wide slow that every soldier feels
  when one triggers it, or a meter that buys something else entirely in co-op? If it stays
  solo-only, what does the co-op HUD do with the Focus meter, and does the Q key do nothing or say
  something?
- **Grab.** This one is a genuine co-op opportunity: a grabbed soldier is helpless and a teammate
  can cut them free, which is exactly the sort of thing multiplayer is for. Decide whether grab is
  adapted into co-op (and if so, whether the escape is self-mash, teammate-rescue, or both), or
  declared solo-only like Focus. Note the wire cost: grab state must ride the snapshot and the
  rescue must be an intent.
- **The precedent.** Whichever way these go, they are the worked examples the ADR will quote. Say
  what they teach about when a solo mechanic *should* be reworked for a shared world versus when
  solo-only is the right answer.

## Resolution

**Focus: solo-only, declared** (`FEATURES` in stance.ts). It is not a world rule at all — the solo
driver scales `dt` before calling `stepWorld`, so the world never learns time bent. There is
nowhere to put that in a room of four. The meter is hidden in co-op rather than shown and refused.
The focus strike inherits the same stance (it is spent from a Focus window).

**Grab: adapted, self-escape only** (user ruling, 2026-07-14). The fist takes any soldier; the
snapshot carries the escape bar (`presses`, `timeLeft`); the mash is an intent; a held client stops
flying entirely (`applyPlayerUpdate` ignores its reports, `stepCoopClient` returns early). No
teammate rescue in v1 — a held soldier is on their own.

What they teach, and what the ADR quotes: rework a solo mechanic for a shared world when its
*subject* can be generalised from "the player" to "a soldier" (the grab). Declare it solo-only when
its subject is **time itself** (Focus) — because time is the one thing every soldier shares.
