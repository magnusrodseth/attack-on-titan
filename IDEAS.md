# Ideas

Future features we have agreed on directionally but not yet scoped into the wayfinder map.
When one graduates, move it to `wayfinder/map.md` (fog → ticket → decision) and delete it here.

## Rare titan: the Striker (Haaland homage)

A rare abnormal variant inspired by the mid-2026 meme wave comparing Erling Braut Haaland's
sprint (hunched posture, low center of gravity, massive strides, 1.95m battering-ram energy,
viral after Norway vs Iraq at the 2026 World Cup) to an Abnormal/Armored Titan
([Know Your Meme](https://knowyourmeme.com/memes/erling-haaland-running),
[meme origin video](https://www.youtube.com/watch?v=Qy5Kw4SI5DE)).

- Gameplay: very rare seeded spawn (`hashSeed(seed + ':striker:wave')`), sprints in the
  hunched meme posture noticeably faster than other abnormals, maybe a punting swat with
  extra knockback. Big score bonus, its own kill banner ("Striker Slain"). Never spawns
  alone: the same roll also spawns the Kane titan (next section), so the duo arrives as a
  single two-titan event.
- Look (user spec, 2026-07-09): spawns wearing the **Norway home kit** — red jersey with the
  offset navy/white flag cross and a number 9, white shorts — plus the blond ponytail-bun.
  Build the kit from sourced CC0 fabric/knit textures with per-instance tints (the layering
  the texture rule encourages, like the banner linen); hair as a tinted geometry block.
- Likeness boundary (revised by user decision, 2026-07-09): the face is now a real photo,
  overriding the earlier photo-free rule — a cropped Wikimedia Commons photo ("Erling Haaland
  Morocco v Norway 7 June 2026-51" by Bryan Berlin, CC BY-SA 4.0, credited in the README) baked
  into the head texture in `src/render/strikers.ts`. Kit and hair remain CC0-textured tinted
  geometry. Game-ready FIFA/PES face mods stay off-limits (unlicensed, no clear likeness
  rights); only properly licensed Commons photos qualify.
- User-provided visual references (look/proportion only):
  - https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSU7JeIBXpzTCIUWoEq7Tpu4ikMD-V2OXmmH02ty2XCne61tFdjJ7BTXJfX&s=10 (game face-mod render, slicked-back blond hair)
  - https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQmDn_-U2M7aAUvitfyQsjvsTyJeL3EJLZ9dbySEyY8mSUR-LbtDsI5nXc&s=10 (red Norway home jersey, flag cross, ponytail-bun)
  - https://foxyprinting.co.uk/cdn/shop/files/erlinghaalandfootball.jpg?v=1700149050
  - https://pbs.twimg.com/media/FZGhAdJX0AAo1Yq.jpg
  - https://media-cldnry.s-nbcnews.com/image/upload/rockcms/2026-07/260705-haaland-norway-world-cup-ww-1524-b41355.jpg (2026 World Cup, Norway kit with shorts — the spawn look)

## Rare titan: the Captain (Harry Kane homage, user idea 2026-07-09)

Companion piece to the Striker above: a Harry Kane titan that always spawns together with
the Haaland titan, the two number 9s arriving as a pair. Build note (user, 2026-07-09):
this gets implemented in the same effort as the Striker, but that effort is not started yet;
when the Striker graduates to the wayfinder map, this section graduates with it.

- **Pair spawn**: one seeded roll spawns both (share the striker stream or a joint
  `hashSeed(seed + ':strikers:wave')`), so `?seed=` replays get the identical duo. Neither
  spawns without the other.
- **Behavior contrast** (suggestion, to be scoped): where the Striker sprints at the player,
  the Captain drops deep, Kane-style, holding back and lobbing thrown debris from range so
  the pair squeezes you from two directions. Own kill banner ("Captain Slain") plus a duo
  bonus with its own banner when both fall in the same wave ("Strike Partnership Broken").
- **Look**: England 2026 home kit, white jersey with navy crew collar and a red number 9,
  navy shorts, plus the blue captain's armband as a tinted band on the left arm. Swept-back
  dark-blond hair and a short full beard as tinted geometry blocks. Same construction as the
  Striker's kit: sourced CC0 fabric/knit textures with per-instance tints.
- **Likeness boundary** (revised with the Striker, 2026-07-09): a real face photo is allowed —
  the build uses "Harry Kane on October 10, 2023" (UK Prime Minister's Office, CC BY 2.0,
  credited in the README) baked into the head texture. Otherwise unchanged. No Three Lions
  crest, no brand marks (both are trademarked even in freely licensed photos); the read
  comes from white-kit-with-red-9 + armband + beard standing next to the Norway red.
- User-provided visual references (look/proportion only):
  - https://encrypted-tbn2.gstatic.com/licensed-image?q=tbn:ANd9GcRuvfcMHOouTQSFJifF6qJwkWwERIDwq6v_rwn_fIkrvLV0hveYLsX4klGcDNgNukLC7HDRZe2-B5EdJDo (England v Ghana, 2026 World Cup: white home shirt, captain's armband: the spawn look)
  - https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSJKxDzUpw8h2gd1F3FnHQgHeuKQlkcYpusK0LmGGOxGs2o2RpS1qrZMqIU&s=10 (England home jersey, KANE 9 print, front and back: the kit reference)
  - https://img.a.transfermarkt.technology/portrait/big/132098-1700211169.jpg?lm=1 (portrait: swept-back hair and beard reference)
  - https://upload.wikimedia.org/wikipedia/commons/2/2f/Harry_Kane_England_v_Ghana_23_June_2026-024_%28cropped%29.jpg (Wikimedia Commons, same match: hair/beard/build in warm-up top)

## Fix the placebo upgrades (defect found in sparring, 2026-07-09)

Not a feature: a correctness fix, agreed to document here until scoped. Three config fields in
`DEFAULT_PLAYER_CONFIG` (`src/sim/player.ts`) are declared and mutated by upgrades but never
read by `stepPlayer` (verified by grep, 2026-07-09): `gasThrust`, `gasBurn`, `airBoostThrust`.
Gas is only ever spent by the Shift dash (`BOOST_COST`), so:

- **"Tuned Thrusters"** (gasThrust ×1.2) is a complete no-op.
- **"Wind Dancer"** is half-live: airControl ×1.6 works, airBoostThrust ×1.3 does nothing.
- A dead upgrade in a pick-1-of-3 offer means a wasted pick whenever it appears.

Fix directions: either wire the fields into live systems (e.g. boost impulse scales with
airBoostThrust) or drop the dead fields and replace both upgrades with ones touching live
constants (boost impulse, `BOOST_COOLDOWN`, `BOOST_COST`, body-hit blade wear). Replacement is
probably cleaner than inventing a new thrust mechanic just to justify a stat. Add a regression
guard: a test per upgrade asserting an observable sim-behavior delta, so a dead upgrade can
never ship silently again.

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

## Dull blades: wear raises the kill threshold (sparring idea, agreed 2026-07-09)

Blades are currently binary until they snap (bladeHp 6 per pair, 4 pairs; nape/ankle wear 1,
body wears 2, `wearBlade` in `src/sim/combat.ts`). Idea: the one-cut threshold scales with the
current pair's remaining bladeHp — fresh pair kills at killSpeed 17 m/s, last-hit pair needs
roughly 22.

- **Why**: this is the fix for the weakest system in the game. Gas is only spent on dashes and
  every kill refunds a heart, so the resupply station is nearly decorative; dull blades make
  the mid-wave resupply run a real decision (dip in kill threshold vs travel time) without
  touching the gas economy (free swinging stays sacred to the feel).
- **Scope notes**: only the one-cut threshold moves; keep the sub-threshold damage curve keyed
  on base killSpeed so chip damage is not double-punished. Deepens "Sharp Blades" and
  "Extra Blades" upgrades. HUD: tint the segmented blade-gauge cells toward dull as bladeHp
  drops, and surface the raised threshold near the kill-speed feedback.

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

## Daily seed mode (sparring idea, agreed 2026-07-09)

A `GameMode` registry entry: everyone plays the same seed per UTC day (e.g.
`hashSeed('daily:' + YYYY-MM-DD)`), one scored attempt, dedicated leaderboard scope. The
determinism contract makes it nearly free, and GAME_MODES plus the D1 leaderboard/protocol
shapes already exist. Likely the strongest retention feature per line of code available.

- **To scope**: one-attempt enforcement (localStorage mark keyed by date locally; server
  rejects a second submission per account/day), what spends the attempt (death, or first
  submission?), whether mid-run resume is allowed within the day (probably yes, but restart =
  attempt spent).
- **Later**: ghost replays fall out of the same determinism (record the input stream, replay
  as a translucent ghost) — daily is the proving ground, a time-trial mode is the payoff.

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

## Civilian evacuation events (audit idea, agreed 2026-07-13)

The game currently has no one to protect, which is half the AoT fantasy. Seeded rare wave
events where a civilian crowd streams along the street nav grid toward the gatehouse; titans
divert to them; saves pay score.

- **Sim**: civilians as simple agents on the existing NavGrid (`src/sim/nav.ts` `findPath`);
  titan targeting generalizes the sticky chaser-token system (`MAX_CHASERS` in
  `src/sim/game.ts`) into a second token pool so some titans hunt civilians instead of the
  player. Spawn roll seeded via `hashSeed(seed + ':evac:wave')` so replays match.
- **Render**: the humanoid-pool pattern is proven by `SoldierPool` (`src/render/soldiers.ts`);
  low-poly civilians reusing credited cloth/skin textures per the texture rule. Civilian blips
  on the minimap.
- **Scope path**: start as a rare wave event with a save-count banner and score bonus, graduate
  to a full escort mode only if the event proves fun. Co-op later.
- **To scope**: instant devour vs grab (could reuse `src/sim/grab.ts` so a slash frees them);
  whether lost civilians cost anything or only saved ones pay; how many agents the perf budget
  allows.

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

- **Hard prerequisite**: the placebo-upgrades fix above. `gasThrust`, `gasBurn` and
  `airBoostThrust` are dead fields; a character sheet exposing dead stats is the placebo
  defect squared. Only stats with a verified observable sim delta get a point track.
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

## More maps for time trials (user idea, 2026-07-13)

Framing first: every seed already IS a map. Signal Run generates a fresh course per seed
(`generateCourse` in `src/sim/course.ts`) through a fresh city (`citygen.ts`), and PBs
already scope per seed (`trialKey('race', seed)`). So "more maps" is three different
products at three price points, and they stack.

- **Tier 1, curation (days): named line packs.** Hand-pick seeds whose generated courses
  are exceptional and name them: "The Cartographer's Dozen" as a map-select plate in the
  menu, each with a name, a one-line flavor blurb, and its own leaderboard scope (which
  already exists per seed, zero new systems). Add a **featured line** that rotates weekly
  (`hashSeed('featured:' + ISO week)` picking from the pack), which composes directly with
  the daily-seed idea above. Community lines fall out for free: any `?seed=` URL someone
  shares is already a playable, comparable map.
- **Tier 2, course archetypes (same city, new route shapes).** The generator currently
  lays one shape: a point-to-point crossing with shuffled street/canyon/rooftop tiers.
  New shapes are mostly route-logic in `course.ts`:
  - **Circuit**: closed loop, start is finish, 2-3 laps with lap splits (the split
    plumbing in `RaceBest.splits` already exists).
  - **Ascent**: tier sequence sorted instead of shuffled, street to rooftop, finishing on
    a wall-crest gate (wallHeight is 50; the finish as a climb reframes the whole line).
  - **Canal slalom**: gates threaded low along the canal chord (`CANAL_X` in
    `citygen.ts`) and under its swing-under bridges, a low-altitude discipline.
  - **Wall ring**: gates riding the wall crest around the city, the vertigo line.
  Each archetype is a new mode-id-like scope in `trialKey` (e.g.
  `aot-odm-tt:race-circuit:<seed>`) so PBs and D1 leaderboards stay honest.
- **Tier 3, district dials (medium): citygen presets.** Citygen v2 already has block
  motifs and a noise height field; expose named parameter presets that bias them: Old
  Town (low, dense, tight canyons, rooftop tier hugging 12 m), High District (tower-heavy
  skyline, canyon tier stretched), Harbor (canal widened, warehouse motifs dominant),
  Breach (a rubble wedge of collapsed buildings by the gate). Same generator, different
  knobs; existing credited textures still satisfy the texture rule.
- **Tier 4, new arena archetypes (the expensive, iconic ones).** Full look specs for both
  in the two sections below (user-picked references, 2026-07-13).
  - **Forest of Giant Trees**: the AoT locale. Trunks as hook anchors, and the three gate
    tiers map naturally to floor/trunk/canopy. Needs a nav analog (open floor is all
    walkable), a canopy-height analog to `localSkyline`, and sourced bark/foliage
    textures (Poly Haven has both).
  - **The Underground City**: cavern ceiling as a universal hook anchor, crystal shafts
    for light, pairs with the lamp/flashlight system for a night line.
  - Course generation must generalize first: `gateHeight`/`localSkyline` assume roofs, so
    the arena grows an "anchor field" the course generator queries instead.
  - Arena archetypes serve The Culling for free (modes are arena-agnostic), and a
    relentless-titan hunt between giant trees is a different game.
- **Replay identity**: the arena re-derives from the seed (`persist.ts` contract), so any
  map parameter must join that identity: either a `?map=` param alongside `?seed=`, or
  fold it into the seed string (`forest:abc123`). Same rule the soldier build above
  follows; the share URL stays the whole map.
- **Ghost replays** (flagged under daily seed as the time-trial payoff) are map-agnostic:
  determinism carries them to every tier here, and a featured weekly line with the
  world-record ghost is the endgame of this whole section.
