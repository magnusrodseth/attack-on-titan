---
type: wayfinder:grilling
status: open
assignee:
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
