---
type: wayfinder:grilling
status: open
assignee:
blocked-by: [tf-001, tf-002]
---

# tf-003 · Stations that can run out

## Question

A station is an infinite refill today: `worldResupply` (`src/sim/world.ts`) tops up gas, canisters,
blades, blade hp, hearts and lamp for free, forever, and `Arena.stations` is a bare list of points.
This ticket gives a station **stock**, which is the change that makes the whole supply line real.

- **What is stocked.** Everything, or only some of it (blades and spears yes, gas and hearts always
  free)? The finer the grain, the more legible the loss — and the more UI it needs.
- **The unit.** Charges? Per-resource counters? A station that is empty of blades but still has gas?
- **The starting stock**, per wave and per arena, and whether a squad's stations start deeper (they
  drain four times as fast).
- **What a survivor delivers**, and how it reads: does one saved civilian equal one charge, or does a
  station tick up as they arrive? Their walk to the station is now gameplay you can watch, and it is
  the visible proof that a rescue mattered.
- **Depletion across waves.** Does stock carry between waves (so a bad wave hurts the next one, which
  is the design payload) and does anything refill it besides survivors?
- **What an empty district means for the stations**: bare, permanently, for the rest of the run.
- **HUD/world read**: a soldier must be able to tell a stocked station from a bare one *from the
  air*, before committing to the flight in. That is a render and a minimap question as much as a sim
  one.

Depends on tf-001 (what a save is, whether saves are permanent) and tf-002 (what the demand actually
is, once blades dull).
