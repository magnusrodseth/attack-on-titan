---
type: wayfinder:task
status: open
assignee:
blocked-by: []
---

# tf-002 · Dull blades: the reason to need a station

## Question

Build the demand half of the economy (`IDEAS.md`, agreed 2026-07-09), test-first in `src/sim/`.

The one-cut threshold scales with the **current pair's remaining `bladeHp`**: a fresh pair kills at
`killSpeed` (17 m/s), a nearly-spent pair needs roughly 22. Blades already wear (`wearBlade` in
`src/sim/combat.ts`: nape/ankle 1, body 2, 6 hp per pair, 4 pairs).

Decide and pin with tests:

- The curve from fresh to spent, and its ceiling. Linear? A step at half? Feel-test before believing
  any number.
- **Only the one-cut threshold moves.** Keep the sub-threshold damage curve keyed on the base
  `killSpeed` so chip damage is not double-punished (an explicit `IDEAS.md` scope note).
- The interaction with `killSpeed` upgrades and Sharp Blades: does an upgrade raise the floor, the
  ceiling, or both? Both deepen if it composes; say which.
- **HUD**: the segmented blade gauge tints toward dull as `bladeHp` drops, and the raised threshold
  is visible near the existing kill-speed feedback, so the player can *read* why a cut bounced.
- Co-op stance: `shared` (blade wear is per-soldier state the world already owns). The parity
  harness must sweep it.

This ticket ships alone and is playable alone. It is the first thing in the effort that changes how
a run feels, and it is the reason a half-stocked station will matter later.
