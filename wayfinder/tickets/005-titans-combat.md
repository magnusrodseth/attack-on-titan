---
type: wayfinder:task
status: closed
assignee: claude (autonomous session, 2026-07-09)
blocked-by: [004]
---

## Question

Build titans and combat test-first: titan state machine (wander/chase/attack, abnormal leaps),
nape geometry from titan pose, slash resolution with speed-scaled damage, blade durability,
player damage from titan attacks.

## Resolution

`src/sim/{titan,combat}.ts`. Nape kill sphere = slashRange×0.55 + height×0.05 (tighter than the
body sphere so torso passes don't count as nape hits). One-cut at ≥ killSpeed, chip damage below,
body hits cost double blade wear. Swats have a 0.45s windup, sphere-checked against the player
with a 1.2s invulnerability window and knockback. Abnormals leap ballistically from 12-80m.
