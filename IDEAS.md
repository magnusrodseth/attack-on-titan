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

## Multiplayer direction (recorded, not scoped)

Realtime multiplayer on PartyKit (rooms carry ephemeral realtime state over websockets),
Neon Postgres + Drizzle ORM for durable meta-state (accounts, leaderboards, run history,
unlocks). Until then all meta-state stays local-first behind the existing localStorage seams
('aot-odm-best', 'aot-odm-settings', 'aot-odm-mode', 'aot-odm-run') so a sync layer can adopt
those keys wholesale.
