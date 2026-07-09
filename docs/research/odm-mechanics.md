# Research: what makes ODM/grapple movement fun

Asset for ticket [001](../../wayfinder/tickets/001-odm-feel-research.md). Sources listed at bottom.

## Findings

1. **The rope is a pendulum, not a spring-to-target.** The satisfying arc comes from a taut-rope
   constraint: gravity converts height into speed while the rope redirects it. Implementations that
   work: when distance to anchor exceeds rope length, clamp position back to the sphere and remove
   only the *outward radial* velocity component, keeping the tangential component fully intact.
   Damping the tangential component kills momentum and the fun with it.
2. **Spring force (Hooke) is the softer alternative** (F = -k·stretch along the rope, damp radial
   velocity only). Softer and more forgiving, but mushier. Position-based hard constraint feels
   crisper and is trivially unit-testable, so we use PBD with a small stretch tolerance.
3. **AOTTG's magic**: gas thrust pulls you *toward/around the anchor* while hooked (not just camera
   forward), so holding gas tightens the orbit and releasing at the apex slingshots you. Dual hooks
   (left/right) let you slalom and line up flanking arcs on the nape.
4. **Speed = damage.** In AOTTG, nape damage scales with your velocity at the moment of the slash.
   This single rule makes movement mastery and combat mastery the same skill, which is the
   replayability engine: better swinging directly produces better kills.
5. **Resource pressure creates the loop.** Finite gas and blade durability force periodic resupply
   trips, which create risk-reward decisions mid-wave.

## Implications for our sim

- Fixed-timestep (120 Hz) semi-implicit Euler + position-based rope constraint.
- Per attached hook: reel input shortens rope length; gas thrust accelerates toward the mean anchor
  direction when hooked, camera-forward when airborne and unhooked.
- Kill rule: slash within nape radius at speed ≥ threshold → instant kill; below threshold →
  proportional damage and a bounce.

## Sources

- [What does physics do in AoT's ODM gear mechanics (GoodNovel QA)](https://www.goodnovel.com/qa/physics-attack-titan-s-odm-gear-mechanics)
- [The physics of Levi Ackerman (e-estidotmy)](https://esti.my/the-physics-of-an-aot-legend-levi-ackerman/)
- [ODM Gear Simulator by Ratweeb (itch.io)](https://ratweeb.itch.io/odm-gear)
- [Omni-directional mobility gear — AoT wiki](https://attackontitan.fandom.com/wiki/Omni-directional_mobility_gear_(Anime))
- [Make Grappling Hook in Godot (gameidea)](https://gameidea.org/2024/08/24/make-grappling-hook-in-godot/)
- [Unreal grappling hook tutorial (coolasjake)](https://coolasjake.github.io/projects/unreal-engine-grappling-hook.html)
- [Grappling hook physics tips (sci.physics archive)](https://physics.science.narkive.com/Pc5HSM6Q/tips-on-grappling-hook-physics-for-a-game-project)
- [Pendulum swing on grapple (Unreal forums)](https://forums.unrealengine.com/t/2d-game-i-want-my-player-to-swing-like-a-pendulum-while-grappling-hook-is-connected-in-mid-air/432046)
- [Making of the grappling hook — Archetype devlog (itch.io)](https://serfofcinder.itch.io/archetype-portal-to-hell/devlog/722682/the-making-of-the-grappling-hook)
