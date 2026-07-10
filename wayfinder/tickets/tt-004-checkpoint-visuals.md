---
type: wayfinder:task
status: open
blocked-by: [tt-002]
---

## Question

Render the Signal Run course: green signal-flare smoke column rising from the next gate
(visible map-wide, day and night), dimmer yellow column on the gate after, red column + ring
on the finish; a glowing ring gate at pass height on the active gate; pass FX (smoke pop +
chime, column dies); minimap blips for the active gate. Smoke = transient particle effect,
ring = gameplay indicator glow — both texture-rule exceptions, no asset sourcing needed.
Verify look and map-wide visibility in the browser via playwriter + `__aot` (day and night
clock overrides).
