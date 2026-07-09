# Wayfinder Map: First-person ODM titan-slaying game

Label: `wayfinder:map` · Tracker: local markdown (`wayfinder/tickets/`) · No remote configured.

## Destination

A playable, fun, replayable browser game: first-person Attack on Titan wave survival in a procedural low-poly city, built with Three.js + TypeScript, simulation core developed test-first (vitest), verified live in Chrome via playwriter. `pnpm dev` runs it; `pnpm test` is green.

## Notes

- Skills in play: find-docs (Three.js API via ctx7), tdd (sim core seams), playwriter (browser verification).
- **This effort carries execution in-map** (per wayfinder Notes override): tickets include build tasks, and multiple tickets may be resolved in one autonomous session, since the user requested the finished game and is AFK. HITL grilling is replaced by documented decisions with rationale; the user can reopen any ticket to overturn a decision.
- Agreed test seams (tdd skill): pure sim modules only — `rng`, `rope`, `player`, `titan`, `combat`, `waves`, `score`, `upgrades`, `game`. Renderer/HUD are thin adapters verified by playwriter smoke test, not unit tests.

## Decisions so far

- [What makes ODM movement fun](tickets/001-odm-feel-research.md) — hard pendulum constraint that keeps tangential momentum, gas thrust toward anchors, speed-scaled nape kills; sourced from AOTTG + grapple-physics writeups (assets in `docs/research/`).
- [Stack and scaffold](tickets/002-stack.md) — Vite + TypeScript strict + three + vitest, pnpm, no physics engine (hand-rolled PBD rope is simpler and unit-testable).
- [Core loop and replayability design](tickets/003-core-loop-design.md) — wave survival, seeded city, gas/blade resources with resupply risk-reward, style-based combo scoring, pick-1-of-3 roguelite upgrades between waves, localStorage bests, shareable seeds.
- [ODM physics sim](tickets/004-rope-physics.md) — PBD rope + player integrator, 30 tests; browser play exposed ground-pinning and momentum-killing landings, both fixed test-first (skid model).
- [Titans and combat](tickets/005-titans-combat.md) — wander/chase/attack/leap state machine, windup swats with invuln window, speed-scaled nape damage, blade wear.
- [Progression](tickets/006-progression.md) — per-wave RNG streams keep seeds deterministic; score multipliers compose; bests persist.
- [Renderer](tickets/007-renderer.md) — AoT district look per user reference images (instanced gabled row-houses, towers, 50m wall), procedural grinning pure titans, ropes/streaks/shake/FOV effects, full DOM HUD.
- [Browser verification](tickets/008-browser-verify.md) — full loop verified live in Chrome via playwriter debug hook with screenshot evidence; 73 tests green, tsc clean, production build 144 kB gzip.

## Not yet specified

- Audio design (whoosh at speed, hook thunk, titan roars) — worth a pass once the core loop proves fun.
- Additional titan variants (crawlers, boss/armored titan finale) and rare events (abnormal stampede).
- Post-processing polish (motion blur/speed lines, bloom on nape glow) if perf budget allows.
- Mobile/touch support — unclear it can ever feel good for this control scheme.
- Hooking titans themselves (AOTTG allows it; needs moving anchors that track the titan).
- Titan-vs-building interaction (titans currently walk through houses; steering or crushing both plausible).
- A canal district and gate structures in the wall for more Trost fidelity.

## Out of scope

- Multiplayer (AOTTG's co-op is its own project; destination is a solo score-chaser).
- Licensed AoT assets/IP names in shipped UI — original low-poly look instead.
