---
type: wayfinder:research
status: closed
assignee: claude (autonomous session, 2026-07-09)
blocked-by: []
---

## Question

What makes ODM-gear/grapple movement *fun* in existing games (AOTTG, grapple platformers), and
which physics model reproduces it in a way we can unit-test?

## Resolution

Hard pendulum constraint (PBD): clamp to rope sphere, remove only outward radial velocity, keep
tangential momentum fully. Gas thrust toward anchors while hooked. Speed-scaled nape damage makes
movement skill and combat skill the same skill. Finite gas/blades create the resupply risk-reward
loop. Full notes with sources: [docs/research/odm-mechanics.md](../../docs/research/odm-mechanics.md).
