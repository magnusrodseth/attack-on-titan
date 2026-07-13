# 009 — Shifter boss fights (the Nine Titans)

Status: in progress · Graduated from IDEAS.md ("Boss fight with boss health bar and
weak-point phases", user idea 2026-07-09) after a full grilling session with the user
(2026-07-13). Combat model rationale: [ADR 0002](../../docs/adr/0002-shifter-combat-model.md).
Glossary: Shifter, Weak Point, Plated, Staggered (extended) in CONTEXT.md.

## Decisions (all user-confirmed, 2026-07-13)

- **Placement**: every 5th wave of Wave Survival is a Shifter wave — solo only for v1
  (co-op matches get a normal wave instead, like Focus's solo-only precedent). Matchday and
  The Culling keep their identities; the system sits behind its own mode-agnostic seam.
  On collision with a Matchday wave (15, 30, 45) the Shifter outranks the footballer duo.
- **Roster**: one tested framework + nine declarative BossSpecs, all built now (models from
  the parallel Blender session land as `public/models/<spec-id>.glb`). Fixed ladder:
  Beast(5) → Cart(10) → Jaw(15) → Female(20) → Armored(25) → War Hammer(30) → Attack(35) →
  Colossus(40) → Founding(45); after 45 the ladder repeats with scaled part HP.
- **Combat model** (ADR 0002): damage only on the single lit Weak Point, by blade or blast;
  part HP pools; clean cut (≥ killSpeed) = flat 100, the threshold never moves; sub-speed
  cuts use the nape chip formula; breaks apply the existing Staggered state (per-spec
  duration), drain a bar chunk, light the next part, and disable anatomically-linked
  abilities; the nape is always the final Weak Point with its own pool; Plated parts bounce
  blades until a spear blast cracks them; no spear nape-instakill, no both-ankles cripple.
- **Abilities** (shared modules, 1–2 per spec): Throw (Beast), Quadruped + Regen (Cart),
  Agile (Jaw, Female), Summon (Female scream, Founding), Plated (Armored everywhere,
  War Hammer crystal nape, Female wrist), Constructs/ground-spikes (War Hammer), Duelist
  counter (Attack), Steam aura with vent windows (Colossus, 60 m, near-stationary),
  Roar knockback (Founding).
- **The wave**: the Shifter arrives alone through the city gate (arena gateAngle),
  relentless aggro, only Summons add pures; killing the Shifter dissolves its living
  summons and clears the wave. Resupply and Focus work normally.
- **Difficulty target**: ~90 s (wave-5 Beast, 3 parts) → ~4 min (Founding, 5 parts),
  competent player. No enrage timers; pressure is abilities + relentless pursuit.
- **HUD/spectacle**: segmented brass/Cinzel boss bar (one chunk per part) with name plate
  and current-part label, shown while engaged; world-space overbright glow on the lit part
  (accepted texture-rule exception); break roar + shake + hitstop; boss music layer;
  "The Wall Stands" kill banner. No off-screen arrows.
- **Scoring**: breaks bank 250 × chain and refresh the combo; the final cut banks
  2000 × speed/air/chain; Flawless +50% when every part broke in one clean cut (the boss
  analog of oneCut, which cannot apply).
- **Art contract**: sim renders capsule-rig bosses until a spec's glb exists AND satisfies
  the CC0 texture mandate; glbs are unrigged statues driven by procedural root motion
  (walk glide/bob, lunge, break shake), Weak Point glow rides titan-local anchors.
  Reference images gathered by the model session are look-references, not licensed
  textures — the texture rule still gates shipping.

## Build tasks

- [x] ADR 0002, glossary terms, this ticket, IDEAS.md graduation
- [x] `src/sim/boss.ts` + colocated tests: specs, ladder, part anchors, slash/blast rules,
      breaks, ability modules, dissolve-on-death (seeded streams per purpose)
- [x] Integration: combat.ts routing, spear.ts blast rules, score.ts payouts, modes.ts
      boss wave spawn at the gate, game.ts stepping + events, persist.ts save round-trip
      (plus: strike lock and grabs exclude Shifters, boss always holds a chase token)
- [x] HUD boss bar + banners + beats; render/bosses.ts (glb skin, fallback rig, glow, FX)
- [x] pnpm test + tsc green (884 tests); browser-verified end-to-end via `__aot`:
      Beast at the gate wave 5 (bar, part label, ankle bloom, glb skin), full fight —
      break → +250 → Staggered 5 s → phase advance → flawless kill 4765 → "Wave 5
      Cleared +1250"; Cart quadruped glb at wave 10; Colossus 60 m + steam at wave 40.
      392 draw calls / 211k tris mid-fight.

## Model delivery (parallel session handoff, 2026-07-13)

All nine glbs landed in `public/models/` (flat Blender colors, ~45k tris each, feet at
y=0 facing +Z, native canon heights — Jaw 5 m, Cart 3.1 m quadruped, Colossus 60 m).
`BossFxView` Box3-fits each model to its spec height, so native-height drift is
absorbed. Because the materials are flat colors, glb skins are **dev-only** behind
`TEXTURED_GLBS` in `src/render/bosses.ts` (empty allowlist); production shows the
texture-compliant capsule rig until a model passes its CC0 texture/bake pass — then
graduating it is a one-line allowlist add. Rebuild recipe per titan:
`blender/titans/<slug>/build.py` + `blender/export_titan.py` (see the models handoff
and the vault Blender loop note).

## Addendum: The Nine (boss rush) + cardinal stations (user request, 2026-07-13)

- **The Nine** (`bossrush` in GAME_MODES): nothing but the Shifter ladder, one boss per
  wave with upgrades between, lapping HP-scaled past the Founding. boss.ts grew the
  mode-aware `bossSlot`/`bossForMilestone` (Wave Survival = every 5th wave, The Nine =
  every wave); `createBossFight` takes its lap explicitly. Solo like all boss content.
- **Cardinal resupply stations**: `Arena.stations` (plaza first, then one per cardinal on
  open street, ~0.62 wallRadius). Placement is a deterministic post-pass in citygen that
  consumes NO rng, so existing cities keep their exact layouts. `nearestStationDist`
  drives resupply/prompt in solo, co-op server AND co-op client — **the Worker needs
  `pnpm server:deploy` before co-op players can resupply at the new corners** (the stale
  server would reject the distance check).

## Follow-ups (not in v1)

- Texture/bake pass per model → graduate ids into `TEXTURED_GLBS`.
- Glows anchored to semantic mesh names (`Eye`, `Plates`, `Mask`, …) instead of
  height-fraction anchors, for pixel-perfect placement on the statues.
- War Hammer weapon-construct mechanic using the detachable `HammerPole`/`HammerHead`/
  `HammerSpike*` meshes.
- Co-op Shifters: part state into snapshots + server-side break validation (solo-only v1
  by decision).

(The boss music layer shipped after all: a procedural low drone in `audio.setBossLayer`,
heartbeat-pattern, swelling while a living Shifter is engaged.)
