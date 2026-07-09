---
type: wayfinder:task
status: closed
assignee: claude (autonomous session, 2026-07-09)
blocked-by: [004]
---

## Question

Build the renderer: seeded instanced city + wall ring, titan meshes with glowing napes, rope
lines, pointer lock camera with FOV kick, wind streaks, slash flash, DOM HUD (gas, blades,
hearts, score/combo, wave banner, upgrade picker, death screen, start overlay).

## Direction from user (2026-07-09)

City must read as an AoT district (Trost/Shiganshina/Stohess): dense low row-houses with gabled
terracotta roofs and cream/tan plaster walls, narrow streets, church towers, massive 50m wall,
central plaza. Titans are "pure titans": nude-look tan humanoids with creepy grins, varied sizes,
goofy proportions, wandering the streets and towering over rooftops. Reference images:

- https://static.wikia.nocookie.net/shingekinokyojin/images/c/ca/Trost_anime.png/revision/latest?cb=20170821022042
- https://static.wikia.nocookie.net/shingekinokyojin/images/2/2e/Shiganshina_in_anime.png/revision/latest?cb=20210322004639
- https://static.wikia.nocookie.net/shingekinokyojin/images/f/f6/Stohess_anime.png/revision/latest?cb=20170804041210
- https://miro.medium.com/v2/resize:fit:1400/1*owQdlNX7GMEm_iJKUi2ZOA.jpeg
- https://miro.medium.com/v2/resize:fit:1200/1*a_CIVRDhk0A7z7UI4mFwZA.jpeg
- https://i.pinimg.com/736x/cf/84/65/cf84656b1305b350d4c773956a001c27.jpg
- https://www.giantfreakinrobot.com/wp-content/uploads/2023/09/attack-on-titan-pure-titans-900x506.jpg
- https://attackofthefanboy.com/wp-content/uploads/2023/11/Pure-Titan.jpg
- https://poggers.com/cdn/shop/articles/bea8847fa1e27e9680f349734c3072b6_1200x600_crop_center.webp?v=1726833774
- https://static.wikia.nocookie.net/shingekinokyojin/images/5/59/Horde_of_Titans.png/revision/latest?cb=20170825082735

## Resolution

`src/render/{scene,titans,effects}.ts`, `src/hud.ts`, `src/main.ts`, `index.html`. Houses are two
InstancedMeshes (box bodies + gable-prism roofs) with per-instance plaster/terracotta tints;
towers get slate spires; the 50m wall is an open cylinder with a rim torus; the plaza has the
banner pole and glowing green resupply ring. Titans are procedural humanoids (per-id quirk rng for
head/belly/arm proportions, hair, grin of dark mouth + white teeth) with procedural walk/attack/
leap/death-fall-and-dissolve animation and a pulsing red emissive nape. Effects: rope lines from
camera-space hands, velocity-aligned wind streaks past 16 m/s, kill particle bursts, decaying
screen shake, FOV kick 75→97 with speed. HUD per index.html. Screenshot evidence in ticket 008.
