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

## Day/night cycle with a realistic sky (user idea, 2026-07-09)

Replace the flat sky color with a realistic skybox that follows a time-of-day simulation, giving
full day and night cycles.

- **Sky**: either scouted CC0 HDRI/cubemap skies (Poly Haven has day/dusk/night sets; per the
  repo texture rule they must be sourced, not invented) cross-faded by time of day, or
  Three.js's built-in `Sky` shader driven by sun elevation, with a sourced star map for night.
- **Time simulation**: sim-side clock derived from `g.time` (deterministic, persists through
  the run save automatically), e.g. one full cycle per ~10 minutes of play, possibly seeded so
  runs start at different hours. The renderer maps clock → sun/moon position, light color and
  intensity (directional light swings across the sky), fog color, and ambient level.
- **Night city**: window emissives ramp up as the sun sets — the lit-window overbright tint
  already exists per instance, so night mostly means raising its intensity and count while
  darkening everything else; consider warm lamp glow at the resupply plaza and dimmer minimap.
- **Gameplay flavor** (optional later): titans slow at night per lore (they need sunlight);
  could become a night-survival wrinkle or a mode on the GameMode registry.

## Migrate the co-op server to Hono (note to self, 2026-07-09)

Once the Cloudflare deploy of the multiplayer server (ADR 0001) works end to end, migrate the
plain Worker to [Hono](https://hono.dev). Do not start until the raw deploy is proven; this is
a refactor, not part of getting co-op live.

- **Why**: real routing and middleware (CORS, logging, auth) instead of a hand-rolled URL
  switch in the fetch handler, with types for bindings.
- **Migration shape** (verified against current docs, 2026-07-09): add `hono` to the existing
  worker package (no rescaffold needed; `create hono` is only for fresh projects). Replace the
  bare `export default { fetch }` with a Hono app and export `app.fetch`; other handlers and
  Durable Object class exports stay on the entry module unchanged:
  `export default { fetch: app.fetch, scheduled: ... }`.
- **Bindings**: type them once, `const app = new Hono<{ Bindings: Bindings }>()`, then access
  DO namespaces/KV/vars as `c.env.*` in handlers. Wrangler config is untouched by the
  migration.
- **WebSockets**: the DO upgrade passthrough route ports as a normal Hono route that forwards
  to the Durable Object stub.
- Docs:
  - https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/hono/
  - https://hono.dev/docs/getting-started/cloudflare-workers
  - https://hono.dev/docs/getting-started/cloudflare-workers#bindings
