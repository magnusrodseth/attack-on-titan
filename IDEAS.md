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
  extra knockback. Big score bonus, its own kill banner ("Striker Slain").
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

## Multiplayer direction (recorded, not scoped)

Realtime multiplayer on PartyKit (rooms carry ephemeral realtime state over websockets),
Neon Postgres + Drizzle ORM for durable meta-state (accounts, leaderboards, run history,
unlocks). Until then all meta-state stays local-first behind the existing localStorage seams
('aot-odm-best', 'aot-odm-settings', 'aot-odm-mode', 'aot-odm-run') so a sync layer can adopt
those keys wholesale.
