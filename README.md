# Wings of Freedom — first-person ODM wave survival

A browser game built with Three.js + TypeScript: swing through a procedurally generated
Attack-on-Titan-style walled city on omni-directional mobility gear and cut titan napes at speed.
Slow blades bounce off; fast blades kill in one stroke.

## Play

```bash
pnpm install
pnpm dev        # open http://localhost:5173
```

Click **DEPLOY** (grabs pointer lock), then:

| Input | Action |
| --- | --- |
| Mouse | Look / aim hooks |
| LMB / RMB (or J / K) | Hold to fire a hook and winch in automatically (faster the faster you move); release to detach |
| Space | Jump |
| Shift | Boost burst: a click fires a short gas dash in the direction you're looking (airborne only, short cooldown) |
| Q | Focus: hold to slow time while the meter drains; refills on its own |
| F | Blade slash |
| W A S D | Run / steer momentum |
| R | Resupply gas, canisters and blades at the green plaza ring |
| Esc | Pause / resume |

Music volume, sound-effect volume and mouse sensitivity live under **Settings** in the pause
menu; they apply immediately and persist across sessions.

**A page refresh loses nothing**: the full simulation (position, momentum, hooks, titans,
score, even the camera direction) autosaves to localStorage about once a second and on tab
hide, and restores exactly on reload — you come back to a paused run one click from resuming.
Dying clears the save. Everything stays in your browser. **Game Mode** in the same menu picks
the run type (Wave Survival today; the registry in `src/sim/modes.ts` is built for more —
`?mode=` in the URL also selects one).

You carry a gas tank plus 3 spare canisters; an empty tank auto-swaps a canister in.
When the last one runs dry, only a resupply refills you.

Momentum survives ground touches while you are tethered: with a hook attached you can run the
bottom of the arc out along the street, and sprinting past your anchor point scoops you back up
into the swing (jump as it lifts for a steeper launch). Let go while grounded and your legs have
to absorb everything.

**The one rule:** nape damage scales with your speed. At or above the kill threshold
(crosshair-side speedo turns blue) a nape hit is a one-cut kill. Swing mastery *is* combat mastery.

## Play with friends (co-op multiplayer)

**Play With Friends** in the menu opens squad play: enlist a soldier handle (unique username +
password, no email), create a lobby, and share the code or the `?lobby=TROST-7K` link. Up to
four soldiers fight one shared set of titans in the same seeded district; the room code IS the
city seed, so everyone builds the identical city. Matches end on team wipe: the results screen
ranks the squad by score and crowns an MVP, and the squad leader can call a rematch (same city,
fresh waves). Dead soldiers spectate and respawn on wave clear; between waves everyone picks
their own field modification on a 15-second timer. Finished matches are written to a global
leaderboard (best squads by waves survived, deadliest soldiers by score) — scores are computed
server-side, so the board can't be faked from a browser console.

Architecture: a Cloudflare Worker (`server/`, partyserver on Durable Objects) runs the same
pure sim the solo game uses — titans, waves and scoring are server-authoritative, your own
movement stays fully local at 120 Hz, and slashes are validated with lag compensation. Durable
state (accounts, sessions, match history) lives in Cloudflare D1 via Drizzle ORM (a Worker
binding: no connection strings, no secrets). See
`docs/adr/0001-server-authoritative-multiplayer.md`.

## Replayability

- **Waves escalate**: more titans, bigger, faster, more leaping abnormals.
- **Roguelite upgrades**: pick 1 of 3 field modifications after each wave; runs diverge.
- **Style scoring**: overspeed, airborne and one-cut multipliers on a decaying kill-chain.
- **Resource pressure**: finite gas and blade durability force risky resupply trips mid-wave.
- **Seeded runs**: `?seed=anything` in the URL reproduces the same city, waves and upgrade
  offers — share a seed to race it. The default seed rotates daily.
- Best score and wave persist in localStorage.

## Development

The simulation (`src/sim/`) is pure TypeScript, stepped at a fixed 120 Hz, and fully unit-tested;
the renderer (`src/render/`, `src/hud.ts`, `src/main.ts`) is a thin adapter over sim state.

```bash
pnpm test        # vitest
pnpm typecheck   # tsc --noEmit (client) + tsc -p server
pnpm build       # production bundle in dist/
```

The multiplayer backend lives in `server/` (Cloudflare Worker: Hono routing, partyserver
rooms, Drizzle over D1):

```bash
pnpm server:dev     # wrangler dev on localhost:8787 (local D1 included, no env needed)
pnpm server:deploy  # deploy to Cloudflare
pnpm db:generate    # emit SQL migrations from server/db/schema.ts
pnpm db:migrate     # apply migrations to the remote D1 (wrangler d1 migrations apply)
```

The client reaches the Worker through `VITE_PARTY_HOST` (defaults to `localhost:8787`; set it in
Vercel for production).

`window.__aot` exposes a debug hook (`start()`, `step(ticks, input)`, `snapshot()`,
`setAutopilot()`, `setSilent()`) used for browser automation.

Dev builds also ship a playground (`http://localhost:5173/?playground=1`, or the
`Playground · Dev` menu button): a statue gallery in the real city with free ODM flight and no
titan AI, for inspecting the soldier, titan, and Shifter boss models and styling the recruit
live (backquote toggles the drawer). It is dynamic-imported behind `import.meta.env.DEV`, so
production bundles contain none of it.

Design decisions and their history live in `wayfinder/map.md`; mechanics research with sources in
`docs/research/odm-mechanics.md`.

## Sound credits

All bundled samples are CC0 (public domain); the rest of the audio (wind, gas, impacts, chimes)
is synthesized at runtime with WebAudio.

- Titan roars, grunts, flinches, slice, groans, scream: [80 CC0 creature SFX](https://opengameart.org/content/80-cc0-creature-sfx) by rubberduck (OpenGameArt)
- Blade whooshes: [20 Sword Sound Effects](https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes) by StarNinjas (OpenGameArt)
- Blade-jam click: [Gun reload, lock or click sound](https://opengameart.org/content/gun-reload-lock-or-click-sound) (OpenGameArt)
- Empty-gas hiss: [Steam release sounds](https://opengameart.org/content/steam-release-sounds) (OpenGameArt)
- Aberrant-kill boom: [Various sound effects](https://opengameart.org/content/various-sound-effects-0) (OpenGameArt)

Fonts: [Cloister Black](https://www.dafont.com/cloister-black.font) by Dieter Steffmann (free) for
titles; [Cinzel](https://fonts.google.com/specimen/Cinzel) and
[Alegreya](https://fonts.google.com/specimen/Alegreya) (both SIL Open Font License, self-hosted)
for labels and body text.

Music (two tracks alternating in-game):
- "Five Armies" by Kevin MacLeod ([incompetech.com](https://incompetech.com)) — licensed under [Creative Commons: By Attribution 4.0](https://creativecommons.org/licenses/by/4.0/)
- "Eclipse Legion" — CC0 (public domain)

## Art credits (CC0 unless noted)

- Textures (rough plaster, mixed brick, weathered ceramic + slate roofs, cobblestone, castle wall, rock face, bark, forest leaves, rough linen, metal plate, brown leather for titan skin) from [Poly Haven](https://polyhaven.com/textures)
- Underground cavern rock ([Rock 08](https://polyhaven.com/a/rock_08)) and cave floor dirt ([Gravel Ground 01](https://polyhaven.com/a/gravel_ground_01)) from [Poly Haven](https://polyhaven.com/textures) (both CC0)
- Brushed-steel blade texture from [ambientCG](https://ambientcg.com/view?id=Metal012) (Metal012, CC0)
- Galvanized steel wire rope (ODM cables) and brushed grapple-hook steel from [ambientCG](https://ambientcg.com): [Rope002](https://ambientcg.com/view?id=Rope002), [Metal011](https://ambientcg.com/view?id=Metal011) (both CC0)
- Weathered wood planks (market stalls, carts, bridge walkways, doors, the sealed gate) from [Poly Haven](https://polyhaven.com/a/weathered_planks) (Weathered Planks, CC0)
- Canal water surface (dark color + ripple normal) from [TextureCan](https://www.texturecan.com/details/531/) (Rain Ripples on Puddle, CC0)
- Window photo texture from the brick-building set on [OpenGameArt](https://opengameart.org)
- Cloud billboards from "Clouds with Transparency" by WickedInsignia on [OpenGameArt](https://opengameart.org)
- Torch flame sprite (fire_01) from the [Particle Pack](https://kenney.nl/assets/particle-pack) by Kenney Vleugels (CC0)
- Mountains from [KayKit Hexagons](https://github.com/KenneyNL/KayKit-Hexagons) by Kay Lousberg
- Teammate recruit model (rigged + animated Rogue_Hooded) from [KayKit Character Pack: Adventurers](https://kaylousberg.itch.io/kaykit-adventurers) by Kay Lousberg (CC0)
- Night-sky star map from [Deep Star Maps 2020](https://svs.gsfc.nasa.gov/4851) — NASA/Goddard Space Flight Center Scientific Visualization Studio (public domain; Gaia DR2 data)
- Moon texture from the [CGI Moon Kit](https://svs.gsfc.nasa.gov/4720) — NASA's Scientific Visualization Studio (public domain; LRO/LROC data)
- Wing glyph in the social-preview card (`public/og.png`): ["Feathered wing"](https://game-icons.net/1x1/lorc/feathered-wing.html) by Lorc, game-icons.net — [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), not CC0
- Cart Titan grin: [advanced periodontal disease, intraoral](https://wwwn.cdc.gov/phil/Details.aspx?pid=19466) — CDC Public Health Image Library #19466 (public domain)
- Beast/Founding/Female grins (cropped): [skull lithograph, "The anatomy, physiology and pathology of the human teeth"](https://commons.wikimedia.org/wiki/File:Human_Skull;The_anatomy,_physiology_and_pathology_of_the_human_teeth(1844).jpg) — 1844 (public domain by age)
- Boss titan eyes (cropped): [Bloodshot](https://commons.wikimedia.org/wiki/File:Bloodshot.jpg) by Psychonaught (PD-self), [Diplocoria on human eye](https://commons.wikimedia.org/wiki/File:Diplocoria_on_human_eye.png) by Global Donald (CC0), [Eyes tell no lies](https://commons.wikimedia.org/wiki/File:Eyes_tell_no_lies_(Unsplash).jpg) by Amanda Dalbjörn (CC0), [A human male brown eye](https://commons.wikimedia.org/wiki/File:A_human_male_brown_eye.jpg) by Bobbyphotographer (CC0), [GreenEye3](https://commons.wikimedia.org/wiki/File:GreenEye3.jpg) by Skitterphoto (CC0), [Blefarocalasi2.0](https://commons.wikimedia.org/wiki/File:Blefarocalasi2.0.jpg) by FuocoLiquido (CC0), [030608 Pupil](https://commons.wikimedia.org/wiki/File:030608_Pupil.jpg) by Ylem (PD-self), [Myosis due to opiate use](https://commons.wikimedia.org/wiki/File:Myosis_due_to_opiate_use.jpg) by Anonymous (CC0) — all Wikimedia Commons
