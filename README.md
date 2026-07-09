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
| LMB / RMB | Fire and hold left / right hook at the crosshair |
| Space | Jump |
| Shift | Gas boost in your horizontal move/look direction |
| E | Reel in (tighter, faster orbits; climbs the rope) |
| F | Blade slash |
| W A S D | Run / steer momentum |
| R | Resupply gas, canisters and blades at the green plaza ring |
| Esc | Pause / resume |

You carry a gas tank plus 3 spare canisters; an empty tank auto-swaps a canister in.
When the last one runs dry, only a resupply refills you.

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

Title font: [Cloister Black](https://www.dafont.com/cloister-black.font) by Dieter Steffmann (free).
