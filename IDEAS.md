# Ideas

Future features we have agreed on directionally but not yet scoped into the wayfinder map.
When one graduates, move it to `wayfinder/map.md` (fog → ticket → decision) and delete it here.

## Graduated to the wayfinder

- **Daily seed mode** → [The Daily Expedition](wayfinder/map-daily.md) (charted 2026-07-14).
  The daily rolls a whole run (mode + map + seed) per UTC day, deploying spends the one attempt,
  the worker claims it server-side, and a persistent Standings table (expeditions, wins, podiums,
  streak) is the thing that accumulates. Ghost replays are ruled out of scope there — they return
  as their own effort.

- **Dull blades** → **shipped 2026-07-14**. The one-cut bar rises with the edge left on the pair in
  hand (`oneCutSpeed` in `src/sim/combat.ts`): fresh steel kills at killSpeed, a spent pair needs
  about 21.5 m/s. Only the bar moves — chip damage and the score multipliers still key off the base
  killSpeed. Shipped alongside the `gasLow`/`bladesLow` supply warnings, so worn steel tells you
  what it is costing you before it costs you a run.

- **Townsfolk** → built, shipped, and **REVERTED the same day** (2026-07-14, user call). There are
  no civilians in the game and no Evacuation mode. The effort's map is kept with a REVERTED banner
  ([The people in the streets](wayfinder/map-townsfolk.md)) because the reasoning outlives the
  code: the design rulings, what the tuning probes actually measured, and the two silent bugs it
  surfaced. **This is not a live idea. If it ever comes back, read the map first.**

## Close-quarters kill bonus (sparring idea, agreed 2026-07-09)

A score multiplier tier for killing a titan while hooked to it. Hooks already anchor in
titan-local space and track the titan (`attachHookToTitan`/`updateTitanAnchor`), so the check
is one line at kill time in `trySlash`: some `hook.titanId === victim.id`.

- **Scoring**: a new multiplier in `registerKill` (`src/sim/score.ts`), composing with the
  existing speed/air/oneCut/rare/chain factors; carry an `anchoredToVictim` flag on the kill
  event so HUD banners ("Point-Blank!") and the co-op server (`coopSlash` validates the same
  way) stay in sync.
- **Why**: makes the iconic orbit-the-titan-you-are-killing move mechanically legible, and
  rewards hooking titans themselves instead of always hooking buildings.

## Rare titan kind: the Crawler (sparring idea, agreed 2026-07-09)

Third `TitanKind`: permanently prone, fast on all fours, nape low. The pose already exists:
crippled titans kneel with the nape at height×0.6 (`src/sim/titan.ts`). The wayfinder map
lists "crawlers" under Not yet specified; this pins the direction.

- **Immune to ankle cuts**: no stance to break — ankle slashes count as body hits.
- **Approach geometry flips**: the nape must be attacked from above, and the pendulum bottom
  is horizontal, so the player has to dive at it. The current moveset is bad at that, which is
  the point.
- **Behavior sketch**: faster than a normal's walk, serpentine chase, no leap (or a low
  lunge). Seeded spawn weighting in `waveComposition` from some wave onward.
- **Render**: reuse the capsule-limb rig in a crawl pose; existing CC0 skin assets satisfy the
  texture rule.

## Titan HP as a size/variant lever (future idea, logged 2026-07-09)

Fact: every titan has flat 100 HP regardless of height 8–27 m (`createTitan`,
`src/sim/titan.ts`). This works today because speed ≥ killSpeed bypasses HP entirely; HP only
matters in the chip-damage regime. Logged as an unused lever:

- Scale HP with height (bigger = tankier to chip) and/or set per-variant HP (crawler lower,
  armored/boss higher) as the tuning knob for future variants instead of inventing new damage
  types.
- **Explicit non-goal**: never scale the one-cut threshold with size. Speed-kills stay the
  universal clean answer, so the speed-is-damage identity survives any HP rebalance.

## Adrenaline: co-op-compatible Focus replacement (sparring idea, agreed 2026-07-09)

Focus (Q, 0.3× world time) is solo-only and force-disabled in co-op (`src/sim/coopClient.ts`)
because a shared world cannot slow for one soldier. Adrenaline inverts the effect: same
meter/drain/regen economy (the `FOCUS_*` constants in `src/sim/game.ts` are the starting
tuning), but instead of dilating time it briefly raises the player's own speedCap and
airControl (maybe reel rate too).

- **Why it works in co-op**: clients own their movement, so no netcode changes; check the
  server's `MAX_REPORTED_SPEED` clamp (60) against the boosted cap.
- **Why it fits the game**: it feeds speed-is-damage — a burst carries you past killSpeed
  instead of pausing the world. Same "world feels slow" fantasy.
- **Open question**: replace Focus in solo too (one consistent system) or keep Focus solo and
  Adrenaline co-op as distinct feels.

## Active revive in co-op: downed state (sparring idea, agreed 2026-07-09)

Today dead soldiers respawn at full HP at the muster on the next wave clear (`src/sim/coop.ts`),
which is functional but passive. Idea: a downed state with a ~30 s bleedout; a teammate holding
within ~3 m for ~3 s revives at partial HP. Server-side it is a timer plus a proximity check on
state the snapshots already carry.

- Keep wave-clear auto-revive as the backstop; teamWipe becomes "all connected soldiers
  simultaneously downed or dead".
- **To scope**: can downed soldiers crawl/look or only spectate; chaser tokens should drop a
  downed target (dead weight must not hold aggro); bleedout ring on teammate nameplates and
  the spectator overlay; brief i-frames after revive.
- Creates the rescue moments co-op currently lacks; pairs well with a possible grab-type titan
  (discussed, not yet adopted) where cutting the wrist frees a grabbed teammate.

## QoL: key rebinding and colorblind weak-point option (audit idea, agreed 2026-07-13)

Two small gaps found in audit, both real for accessibility.

- **Key rebinding**: the settings panel (`src/hud.ts` `initSettings`, persisted under
  `aot-odm-settings`) covers FOV/sensitivity/music/SFX/fullscreen but not bindings, a notable
  gap for a movement-tech game (Q focus, F strike, E/middle-mouse spear, Shift dash are all
  hardcoded). A bindings map in settings plus a press-to-capture UI row per action.
- **Colorblind option**: the red weak-point bloom (`makeWeakPointMats` in
  `src/render/titans.ts`, shared by pures, footballers and bosses) is the only kill signal,
  rough for red-green colorblindness. A palette toggle swapping the shared material colors
  (e.g. cyan or yellow glow) is a small fix; tint matching minimap/HUD accents consistently.

## Create your soldier: attribute-point builds (user idea, 2026-07-13)

Pre-run character customization: a "create your soldier" screen where a fixed pool of
attribute points is distributed across ODM gear stats (reel speed, hearts, blade racks,
gas, ...), making the loadout deep and personal. The mechanical seam already exists:
`PlayerConfig` (`src/sim/player.ts`) is the character sheet, `createPlayer(config)` already
accepts a custom one, in-run upgrades already mutate it, and the run save already persists
the mutated config, so a custom starting build rides every existing path for free.

- **Hard prerequisite: cleared (2026-07-14).** The placebo stats are gone — `gasThrust`,
  `gasBurn` and `airBoostThrust` were deleted, the dash impulse and the air-control ceiling
  became live `PlayerConfig` fields, and every upgrade is now pinned by a behavioural probe in
  `upgrades.test.ts` that runs real sim code. Copy that harness for the point tracks: only a
  stat with a probe that moves earns a track, so a character sheet can never expose a dead one.
- **Point economy: zero-sum respec, not bonus points.** The default soldier is the
  baseline; buying a notch above baseline in one track requires selling a notch below in
  another, so total power is constant. This keeps one leaderboard scope legal (builds are
  shape, not power), keeps daily-seed mode fair, and honors the commendations decision that
  meta-state never buys mechanical advantage: all points are available from run one,
  horizontal expression, no grind ladder.
- **Candidate tracks** (curated, not the whole config): `reelSpeed`, `hookRange`, `maxGas`,
  `gasCanisters`, `bladePairs`, `bladeDurability`, `maxHp`, `spearCapacity`, `airControl`,
  `runSpeed`, `speedCap`. Integer rack stats (canisters, blade pairs, spears, hearts) are
  natural one-point notches; continuous stats get conservative percentage notches.
- **Identity-sensitive stat**: `killSpeed` is damage, and speed-is-damage is the game's
  core. Options: exclude it, price the buy direction steeply, or allow only the sell
  direction (raise your own one-cut threshold to free points elsewhere, a self-imposed
  hard mode). Deepens the dull-blades idea if that lands. To scope.
- **Regiment presets**: the three regiments as starter builds plus full custom. Scout
  (reel/speed/air control), Garrison (hearts/blades/spears), Military Police (gas
  economy/hook range). Flavor, onboarding, and a name for what the nameplate shows.
- **Determinism**: the build joins the replay identity. `?seed=` share URLs grow a compact
  `&build=` param (notch string); same seed + same build replays bit-for-bit, different
  build is honestly a different run. Persist the soldier (name + spread) under a versioned
  `aot-odm-soldier` localStorage key via the same `StorageLike` seam commendations use.
- **Upgrade interaction**: in-run upgrades multiply the built base, so a maxed track times
  its matching upgrade is the ceiling to tune against. Bound notch ranges so worst-case
  stacks stay inside feel and netcode limits: boosted `speedCap` chains must clear under
  the co-op server's `MAX_REPORTED_SPEED` clamp (60, `src/sim/coop.ts`).
- **Co-op**: clients own their movement, so builds work with zero netcode changes; the
  lobby should broadcast each soldier's build/preset so nameplates and the spectator
  overlay can show it. Asymmetric builds in co-op are a feature (someone tanks, someone
  reels), not a fairness problem.
- **Modes**: daily seed probably locks to the default soldier ("same seed, same gear" is
  the mode's purity); alternatively record the build on the leaderboard entry. Hunt/race
  PBs may want the build stored with the record. To scope per mode.
- **Feel guardrail**: movement tracks (`airControl`, `speedCap`, `reelSpeed`) change game
  feel, and the rope counter-force lesson applies: conservative ranges first, prototype
  extreme notches behind a toggle, feel-test before shipping wide ranges.
- **Placement**: `src/sim/soldier.ts` pure module (track registry, budget validation,
  `applyBuild(config)`) with colocated vitest; one regression test per track asserting an
  observable sim-behavior delta, generalizing the placebo-upgrade guard so a dead track
  can never ship. UI as a menu plate ("The Barracks") with notch rows showing derived
  numbers ("one-cut at 17.0 m/s", "boost chain tops out at 43 m/s"), free respec between
  runs.

## More courses (user idea, 2026-07-13; tiers 1 and 4 partly shipped)

Framing first: every seed already IS a map. Signal Run generates a fresh course per seed
(`generateCourse` in `src/sim/course.ts`), and boards scope per course — a map-scoped seed
since 2026-07-14 (`mapScopedSeed`), so the same seed on a different arena is honestly a
different course. What remains here is the cheap route work, not the expensive arena work.

**Already shipped, do not re-plan**: the arena archetypes (tier 4). `src/sim/maps.ts` is the
`GameMap` registry, The Underground and The Forest of Giant Trees are in it, every mode runs on
every map, and the menu's map picker plus the leaderboard's per-arena boards both build
themselves by walking the registry. A new arena is now an append, not a project. The old
"featured line" idea is dead too: the Featured Course button was removed on 2026-07-14 once
maps made a single promoted seed meaningless (it named a seed, not an arena). Its job — one
shared course everyone contests — belongs to the daily seed mode above.

- **Tier 1, curation (days): named line packs.** Hand-pick seeds whose generated courses are
  exceptional and name them: "The Cartographer's Dozen" as a plate in the menu, each with a
  name, a flavor blurb, and its own board (which already exists per course scope, zero new
  systems). Community lines fall out for free: any `?seed=&map=` URL someone shares is already
  a playable, comparable course.
- **Tier 2, course archetypes (same arena, new route shapes) — the best value left here.** The
  generator lays exactly one shape: a point-to-point crossing with shuffled street/canyon/
  rooftop tiers. New shapes are mostly route-logic in `course.ts`, and they multiply across
  every arena in the registry for free:
  - **Circuit**: closed loop, start is finish, 2-3 laps with lap splits (the split plumbing in
    `RaceBest.splits` already exists).
  - **Ascent**: tier sequence sorted instead of shuffled, street to rooftop, finishing on a
    wall-crest gate (wallHeight is 50; the finish as a climb reframes the whole line). In the
    Forest this is the canopy climb; in the Underground, the stairway shaft.
  - **Canal slalom**: gates threaded low along the canal chord (`CANAL_X` in `citygen.ts`) and
    under its swing-under bridges, a low-altitude discipline.
  - **Wall ring**: gates riding the wall crest around the city, the vertigo line.
  Each archetype is a new mode-id-like scope in `trialKey` (e.g. `aot-odm-tt:race-circuit:<scope>`)
  so PBs and D1 boards stay honest.
- **Tier 3, district dials (medium): citygen presets.** Citygen v2 already has block motifs and
  a noise height field; expose named parameter presets that bias them: Old Town (low, dense,
  tight canyons), High District (tower-heavy skyline, canyon tier stretched), Harbor (canal
  widened, warehouse motifs dominant), Breach (a rubble wedge of collapsed buildings by the
  gate). Same generator, different knobs. Note these are now arguably `GameMap` entries rather
  than a separate concept — the registry is the seam they would land on.
- **Ghost replays** (flagged under daily seed as the time-trial payoff) are course-agnostic:
  determinism carries them to every tier here, and the daily line with the world-record ghost
  riding alongside you is the endgame of this whole section.
