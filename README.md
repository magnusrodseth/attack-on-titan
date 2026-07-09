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
pnpm test        # vitest (73 tests)
pnpm typecheck   # tsc --noEmit
pnpm build       # production bundle in dist/
```

`window.__aot` exposes a debug hook (`start()`, `step(ticks, input)`, `snapshot()`,
`setAutopilot()`, `setSilent()`) used for browser automation.

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

## Art credits (all CC0)

- Textures (rough plaster, mixed brick, weathered ceramic + slate roofs, cobblestone, castle wall, rock face, bark, forest leaves, rough linen, metal plate, brown leather for titan skin) from [Poly Haven](https://polyhaven.com/textures)
- Brushed-steel blade texture from [ambientCG](https://ambientcg.com/view?id=Metal012) (Metal012, CC0)
- Window photo texture from the brick-building set on [OpenGameArt](https://opengameart.org)
- Cloud billboards from "Clouds with Transparency" by WickedInsignia on [OpenGameArt](https://opengameart.org)
- Mountains from [KayKit Hexagons](https://github.com/KenneyNL/KayKit-Hexagons) by Kay Lousberg
