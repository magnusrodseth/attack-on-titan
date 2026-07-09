---
type: wayfinder:task
status: closed
assignee: claude (autonomous session, 2026-07-09)
blocked-by: [002, 003]
---

## Question

Build the ODM physics sim test-first: seeded RNG, dual-hook PBD rope (attach/release, taut
constraint preserving tangential momentum, reel), player integrator (gravity, gas thrust, air
control, ground contact, resources).

## Resolution

`src/sim/{rng,rope,city,player}.ts` with colocated tests. Findings that shaped the code:

- PBD constraint (clamp to rope sphere, remove outward radial velocity only) verified to preserve
  tangential momentum exactly; a falling player on a taut rope correctly converts fall into swing.
- Hook raycasting is analytic in the sim (AABB slab + wall cylinder), so hooks are unit-testable
  and the renderer stays dumb.
- Browser verification exposed two feel bugs unit tests missed initially, both fixed test-first:
  (1) ground run friction pinned a hooked, gassing player to the ground — fixed with an ODM
  launch pop and friction bypass while hooked+gassing; (2) landing killed all momentum — fixed
  with a skid model (12 m/s² idle decel above run speed) so ground touches keep ~90% of speed.
- Tuning after live swinging: gasThrust 40, drag 0.04, airBoost 24; peaks ~45 m/s (~160 km/h).
