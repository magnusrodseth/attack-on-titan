---
type: wayfinder:task
status: open
assignee:
blocked-by: [tf-001]
---

# tf-004 · The crowd itself: civilians in the world

## Question

Build the people, test-first, in the **one world** (`src/sim/world.ts`) so they exist in
singleplayer and multiplayer alike (ADR 0003). Declare their co-op stance: `shared`.

- A `Civilian` (name it in `CONTEXT.md`): position, state (walking, fleeing, held, dead, saved), a
  path, and whatever tf-001's rules require.
- Light agents on the baked nav grid (`src/sim/nav.ts`, `findPath`), walking between doors, the
  plaza and the market. They are not soldiers: no physics, no hooks, no collision resolution beyond
  staying on walkable ground.
- Seeded from `hashSeed(seed + ':folk:<wave>')` so `?seed=` replays kill the same people. Same seed,
  same city, same dead.
- Population and density per arena, from tf-001. The Forest has none, by ruling.
- Perf: instanced and capped. The count is a budget knob, not a promise. Establish the ceiling with
  four soldiers and a full wave before the number is written down anywhere.
- Tests: they path, they stay on walkable ground, they are deterministic across two worlds from one
  seed, and they never spawn inside a building.

No titan interaction yet: that is tf-005. This ticket is a living district and nothing else.
