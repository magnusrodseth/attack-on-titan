---
type: wayfinder:task
status: closed
assignee: claude (worktree-townsfolk, 2026-07-14)
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

## Resolution

`src/sim/folk.ts` + the crowd in `world.ts`, so it exists in singleplayer and multiplayer alike
(ADR 0003, stance `shared`). Civilians walk the nav grid, panic inside `FOLK_PANIC_RADIUS`, run at
the nearest soldier, and — once cut loose or once the street goes quiet — carry their supply to the
nearest station and shelter there.

They are **slower than a titan's stride** (2.1 m/s fleeing vs ~4 m/s for a 15 m pure), deliberately:
a crowd that could outrun a titan would save itself, and a soldier who is not needed is not in a
game about being needed. Seeded from `hashSeed(citySeed + ':folk')`, so the same seed populates the
same streets with the same people, and a replay kills the same people.
