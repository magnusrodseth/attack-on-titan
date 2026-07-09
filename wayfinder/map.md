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
- Controls v2 (user request, 2026-07-09) — Space jump, Shift horizontal boost; no reel button: holding a hook winches automatically at a speed-scaled rate with a ratcheting rope, releasing detaches. Velocity steering on slides/air fixed slipperiness. 3 spare gas canisters auto-swap on empty. Houses raised to 14-22m for bigger pendulum drops. First-person blade sweep viewmodel; volumetric rope cables; Cloister Black titles.
- Titan interaction rework (user request, 2026-07-09) — hooks attach to titans with anchors that track them; ankle-slice system (both ankles → 60s kneel with lowered nape, then full-health rise); titans collide with buildings and navigate corridors; 30% slower with rate-limited turning. Speed rebalanced to physics research: killSpeed 17 m/s, cap 40 m/s, air-only boost.
- Texture mandate (user rule, 2026-07-09) — recorded in repo CLAUDE.md: every visible surface texture must be a sourced free online asset (subagent-verified, CC0), never an invented flat color. City fully textured via scout results (Poly Haven + OpenGameArt): plaster/brick walls, terracotta/slate roofs, cobblestone, castle wall, rock mountains, bark/leaf trees, photo windows.
- Combat and mobility v3 (user requests, 2026-07-09) — ankle-cripple system; bigger nape hitbox; Q focus slow-mo (drain/regen meter, muffled audio); Shift click-burst dash along look direction; hold-W never adds speed above run speed (momentum is king); swing-carry tuning (gravity -19, halved quadratic drag, stronger low-speed winch); boost swaps canisters when the tank is low (bugfix); sloped roof/spire collision with real hook raycasts; circular minimap with titan blips; capsule-limbed titans with photo-decal faces (CC0 eyes/teeth sprites).
- Music (user pick from scout audition, 2026-07-09) — "Five Armies" (Kevin MacLeod, CC-BY, credited) alternating with "Eclipse Legion" (CC0) through the master chain.
- Tethered ground momentum (user request, 2026-07-09, revised same day) — grounded runs cost nothing per second while a hook is attached: a tethered touchdown banks the swing speed and dents the run 8%, liftoff (or a jump) hands the bank back, and releasing while grounded forfeits it to the normal skid. Running past the anchor scoops the player back into the swing (emergent from the rope constraint plus winch, pinned by tests).
- Health economy (user request, 2026-07-09) — full heal when a new wave starts and at resupply; each titan kill returns one heart (capped at max), flagged on the kill event for HUD feedback.
- Menu branding (user request, 2026-07-09) — Cloister Black titles, Cinzel subtitles/labels/buttons, Alegreya body (both SIL OFL, self-hosted woff2 in public/fonts); chamfered plate buttons and upgrade cards built as clipped ::before plates with drop-shadow brass rims that follow the silhouette; larger menu type throughout; settings menu (music/SFX buses in AudioSystem, mouse sensitivity multiplier) persisted under 'aot-odm-settings'.
- Audio (user request, 2026-07-09) — CC0 samples from OpenGameArt (creature SFX by rubberduck, sword whooshes by StarNinjas) for voiced sounds; procedural WebAudio for speed-tracked wind, gas hiss, impacts and chimes; distance-attenuated ambient titan roars. `src/audio.ts`, credits in README. Skipped a CC-BY pack to stay attribution-free at the asset level.

## Not yet specified

- Additional titan variants (crawlers, boss/armored titan finale) and rare events (abnormal stampede).
- Post-processing polish (motion blur/speed lines, bloom on nape glow) if perf budget allows.
- Mobile/touch support — unclear it can ever feel good for this control scheme.
- A canal district and gate structures in the wall for more Trost fidelity.
- Titan skin / blade metal / banner fabric textures (scouts in flight at time of writing).

## Out of scope

- Multiplayer (AOTTG's co-op is its own project; destination is a solo score-chaser).
- Licensed AoT assets/IP names in shipped UI — original low-poly look instead.
