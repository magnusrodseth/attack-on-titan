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

## Commendations: achievements riding the event bus (audit idea, agreed 2026-07-13)

An achievement system as a pure listener over the sim event stream. The `GameEvent` union in
`src/sim/game.ts` (51 types) already covers nearly every skillful act: one-cuts, ankle slices,
spear multi-kills, boss breaks and flawless kills, grab escapes, lamp-dead night survival.
Zero sim changes; the layer subscribes to events plus run stats and persists earned ids in
localStorage (e.g. `aot-odm-commendations`).

- **Registry, scales indefinitely** (user note): each commendation is data (id, name, flavor
  text, predicate over events/run state), so new ones append to a list without touching any
  system. Tiers (bronze/silver/gold counts) come free from the same shape.
- **In-game toast** (user note): earning one mid-run shows a toast, reusing the existing
  banner/pop machinery in `src/hud.ts`; framed as military commendations in the established
  brass/Cinzel menu language, with a commendations panel in the menu listing earned/locked.
- **Ties into existing ideas**: gives the close-quarters bonus ("Point-Blank!") a home before
  its score multiplier lands, and gives future features (crawler, daily seed) a cheap reward
  surface.
- **Co-op**: the `CoopEvent` union (21 types, `src/sim/coop.ts`) can feed the same client-side
  registry later; solo-first is fine.

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

