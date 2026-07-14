---
type: wayfinder:prototype
status: closed
assignee: claude (worktree-townsfolk, 2026-07-14)
blocked-by: [tf-005]
---

# tf-006 · The window, felt: can you read it from across the district?

## Question

The devour window is the beat the entire feature rests on, and it lives or dies on whether a soldier
sixty metres up and moving at 40 m/s can *notice it in time to choose*. Prototype and feel-test it in
a real browser; tune numbers only against what the eye and ear actually do.

- **The telegraph.** What tells you a grab has started, from range? The lift itself (a silhouette
  changing shape), a scream (audio, positional, cutting through a wave's noise), a minimap blip
  changing colour, a subtle world-space marker? How many can be happening at once before the district
  turns into a slot machine of alerts?
- **The read.** From the air, can you tell *which* titan is feeding, and how much of the window is
  left? A held civilian is a small thing in a big city.
- **The scream is the design.** It should be uncomfortable, it should be locatable, and it should
  stop. Whether it stops with a rescue or with a bite is the loudest feedback in the game.
- **The bite.** What does a failure look and sound like at distance, and what does it look like at
  three metres? The player must be able to *witness* what they chose not to prevent.
- **Restraint check**: how much of this can be carried by diegetic signal (bodies, sound, silhouette)
  rather than HUD chrome? Prefer the world telling you over the interface telling you.

Deliverable: a tuned window (length, telegraph stack, audio mix) that a real player can act on, and a
short note recording what was tried and rejected. The texture rule applies to any new visible mesh.

## Resolution

The telegraph, in the order a player actually receives it:

1. **The scream** (positional, `SCREAMS` — three CC0 samples at 387/612/689 Hz so a crowd is not
   one person, sourced and license-verified by a scout agent). It is the only reason you will ever
   know this is happening, and it stops when the window does.
2. **The minimap**: a red pulse on the held civilian — the only thing on that map with a clock
   attached, so it is what your eye goes to. The living are quiet white dots.
3. **The silhouette**: the body is held ALOFT and kicking, clear of the titan's face
   (`mealHoldPoint`), lit rather than in shadow, on a light cloth palette, scaled 1.6x in the fist.
   A body inverted in a titan's hand was a dark lump clipping through its own head at every
   distance — verified in a real browser and thrown away.
4. **The bite**: `devoured` (a CC0 panic scream cut hot at 0.5 s — the window slamming shut).

The 1.6x scale is the one readability lie in the system and it earns its place: a real 1.7 m human
at a titan's mouth is 20 px of screen, which is not a thing anyone can act on.
