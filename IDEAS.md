# Ideas

Future features we have agreed on directionally but not yet scoped into the wayfinder map.
When one graduates, move it to `wayfinder/map.md` (fog → ticket → decision) and delete it here.

## Weapon class system

Multiple selectable weapon classes instead of blades-only. The blade stays the default class;
classes should slot into the existing sim seams (`InputState`, `trySlash`-style combat modules,
`GameEvent` union, HUD gauges) the same way game modes slot into `GAME_MODES`.

### Thunder Spear (first new class)

How it works in the source material (research, 2026-07-09): a rocket-propelled explosive
spear fired from the arm mounts of the ODM gear. Two-stage design: the launch charge embeds the
tip through hardened titan skin; yanking the tether cord pulls a safety pin that fuses a second
charge, which detonates moments later and drives the spear deeper before blowing the target
apart. Carried in very limited numbers (originally two, one per arm, up to eight with later
modifications); developed specifically to crack the Armored Titan, where spears to the eyes and
nape blasted Reiner out of his titan. Sources:
[Thunder Spear (Anime) — AoT wiki](https://attackontitan.fandom.com/wiki/Thunder_Spear_(Anime)),
[CBR: How AoT's Explosive Thunder Spears Work](https://www.cbr.com/attack-on-titan-thunder-spears-reiner/),
[Anti-Personnel ODM gear — AoT wiki](https://attackontitan.fandom.com/wiki/Anti-Personnel_omni-directional_mobility_gear_(Anime)).

Gameplay design (user spec, 2026-07-09):

- **Consumable pickup**: spears spawn as pickups in the city (seeded stream, e.g.
  `hashSeed(seed + ':spears:wave')`), carried in a small inventory (2 like the source material,
  upgradeable). Pickups show as blips on the minimap.
- **Projectile**: fired toward the crosshair, self-propelled, sticks into whatever titan body
  part it hits (reuse `raycastTitan` + titan-local anchor math from `attachHookToTitan`).
- **Armed delay**: once stuck it beeps for a few seconds (rising beep pitch, HUD cue), then
  explodes — mirroring the two-stage cord-pull fuse from the anime.
- **Damage model**: explosion on or near the nape = kill regardless of player speed (this is
  the low-skill-ceiling counterpart to speed-slashing); elsewhere = heavy damage/stagger, and
  it should be the intended answer to a future armored/boss titan whose nape resists blades.
- **Risk**: the blast has a radius; being too close when it detonates hurts the player
  (the anime treats proximity as genuinely dangerous).

Asset direction: per the repo texture rule, model it as a hand-built mesh with scout-sourced
CC0 textures (metal tube + warhead cone), or a scouted CC0 model if one exists. User-provided
visual references:

- https://static.wikia.nocookie.net/shingekinokyojin/images/8/80/Thunder_Spear.png/revision/latest?cb=20190506144252
- https://pic2-cdn.creality.com/comp/model/1572ab037d40913985088343e5dceab1.webp?x-oss-process=image/ignore-error,1
- https://static.wikia.nocookie.net/shingekinokyojin/images/e/e5/Hange_shows_off_the_Thunder_Spear.png/revision/latest?cb=20240222231250
- https://www.siliconera.com/wp-content/uploads/2019/04/AOT2FB_PS4_ThunderSpear_011.jpg
- https://assets1.ignimgs.com/thumbs/userUploaded/2019/6/20/attackthunderthumb-1561037355249.jpg

(Reference images are for look/proportion only — actual assets must be sourced free/CC0.)

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
- Likeness boundary: game-ready Haaland face models/textures DO exist (FIFA/PES face-mod
  communities — the first reference below is one), but they are neither freely licensed nor
  clear of likeness rights, so none can be shipped. The homage stays photo-free: kit + hair +
  the run should read as him instantly.
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
- **Likeness boundary**: same rule as the Striker, photo-free homage only. No Three Lions
  crest, no brand marks (both are trademarked even in freely licensed photos); the read
  comes from white-kit-with-red-9 + armband + beard standing next to the Norway red.
- User-provided visual references (look/proportion only):
  - https://encrypted-tbn2.gstatic.com/licensed-image?q=tbn:ANd9GcRuvfcMHOouTQSFJifF6qJwkWwERIDwq6v_rwn_fIkrvLV0hveYLsX4klGcDNgNukLC7HDRZe2-B5EdJDo (England v Ghana, 2026 World Cup: white home shirt, captain's armband: the spawn look)
  - https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSJKxDzUpw8h2gd1F3FnHQgHeuKQlkcYpusK0LmGGOxGs2o2RpS1qrZMqIU&s=10 (England home jersey, KANE 9 print, front and back: the kit reference)
  - https://img.a.transfermarkt.technology/portrait/big/132098-1700211169.jpg?lm=1 (portrait: swept-back hair and beard reference)
  - https://upload.wikimedia.org/wikipedia/commons/2/2f/Harry_Kane_England_v_Ghana_23_June_2026-024_%28cropped%29.jpg (Wikimedia Commons, same match: hair/beard/build in warm-up top)

## Boss fight with boss health bar and weak-point phases (user idea, 2026-07-09)

A boss titan encounter (natural finale for a wave milestone, e.g. every 10th wave, or its own
entry on the GameMode registry). The map's fog already lists "boss/armored titan finale" —
this pins the user's spec for it.

- **Boss health bar**: a wide branded gauge across the top of the screen (same plate/brass
  construction as the menu gauges, Cinzel name plate, segmented into phase chunks), shown only
  while the boss is engaged.
- **Parts of the body lighting up**: the fight is phase-driven — a body part (ankle tendon,
  wrist, shoulder, eye, then finally the nape) glows as the current weak point, in the same
  overbright emissive style as the existing nape indicator. Only the lit part takes damage;
  cutting it staggers the boss, drains a phase chunk of the bar, and moves the glow to the
  next part. The nape only becomes cuttable in the last phase.
- **Sim shape**: a `boss` titan kind with a part-hitbox list (reuse the ankle/nape local-anchor
  math), `phase` index and per-part hp in TitanState or a parallel BossState; events for
  part-broken/phase-change drive HUD, sounds and bursts. Deterministic like everything else.
- **Armor synergy**: an armored boss whose skin resists blades everywhere except the lit part
  is the intended target for the Thunder Spear class (see above) — spears crack plates open,
  blades finish the glowing flesh.
- **Spectacle**: phase-change roar + camera shake + hitstop, unique music layer while the bar
  is up, and a big multi-burst kill with its own banner ("The Wall Stands") and score bonus.

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

