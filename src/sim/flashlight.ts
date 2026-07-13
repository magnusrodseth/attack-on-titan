import type { Arena } from './city'
import { nightFactor } from './daynight'

/**
 * The soldier's flashlight: a battery-timed beam that carries visibility through the
 * dark. The battery only drains while the beam is lit, and only a resupply recharges it.
 * Sized against the day/night cycle (the sun is down ~300 s of every 600 s cycle) so a
 * full charge dies mid-night and one resupply covers the rest — the night's survival
 * wrinkle is that trip to the station.
 *
 * The beam is not on a clock, it is on a LIGHT METER: `lightAround` measures how lit the
 * soldier's own patch of world is, and the lamp trips on whenever that falls below
 * `LAMP_ON`. Under an open sky the light is simply the daylight, so the surface district
 * behaves exactly as it always did (sunset lights the beam). In the Underground the
 * torches and the daylight falling through the shafts count too, so a soldier standing in
 * a lit street keeps the lamp off and only reaches for it down a dark alley.
 */
export const LAMP_BATTERY_SECONDS = 180

/** Below this many seconds the HUD warns and the beam starts visibly browning out. */
export const LAMP_LOW_SECONDS = 30

// The beam lights when the light around you drops to half — under an open sky that is
// exactly the sun crossing the horizon (nightFactor 0.5), which is where it used to trip.
const LAMP_ON = 0.5
const RAMP_SPAN = 0.35
const FADE_SECONDS = 12

/** A torch throws useful light about this far; past it you are in the dark again. */
const TORCH_REACH = 30
/** How much light one torch delivers when you are standing right at it. */
const TORCH_STRENGTH = 0.75
/** A shaft's pool of daylight spreads this many times its own radius. */
const SHAFT_SPREAD = 3.5
/** Torch flames burn at about head height on their posts. */
const TORCH_FLAME_Y = 3.6

/**
 * How lit the world is at a point: 0 is pitch black, 1 is full daylight. Under an open
 * sky that is just the daylight. Under a roof it is what the fires and the holes in the
 * rock actually deliver to that spot.
 */
export function lightAround(
  arena: Arena,
  x: number,
  y: number,
  z: number,
  fraction: number,
): number {
  const daylight = 1 - nightFactor(fraction)
  const cavern = arena.cavern
  if (!cavern) return daylight

  // rock over your head: only a little of the day gets in at all, and only near a hole
  let light = 0.1 * daylight
  for (const shaft of cavern.shafts) {
    // a shaft is a COLUMN of daylight from the rock to the dirt: height does not dim it,
    // so the reach is measured across the ground, not to the opening itself
    const reach = shaft.radius * SHAFT_SPREAD
    const fall = 1 - Math.hypot(shaft.x - x, shaft.z - z) / reach
    if (fall > 0) light += daylight * fall
  }
  for (const torch of cavern.torches) {
    // a fire is a fire at midnight as much as at noon: torchlight does not care for the
    // sun. Distance here is REAL distance, height and all — which is what puts the dark
    // back in the game: the streets are lit, but the air up under the ceiling is not, and
    // a soldier swinging through the vault is on their own lamp.
    const dy = y - TORCH_FLAME_Y
    const dist = Math.sqrt((torch.x - x) ** 2 + dy * dy + (torch.z - z) ** 2)
    const fall = 1 - dist / TORCH_REACH
    // the pools ADD, so a torchlit street stays lit end to end between its lamps
    if (fall > 0) light += TORCH_STRENGTH * fall
  }
  return Math.min(1, light)
}

/** True when it is dark enough around the soldier for the beam to trip on. */
export function lampOn(light: number): boolean {
  return light <= LAMP_ON
}

/** Advances the battery: one second of burning beam costs one second of charge. */
export function drainLamp(battery: number, light: number, dt: number): number {
  if (battery <= 0 || !lampOn(light)) return battery
  return Math.max(0, battery - dt)
}

/**
 * Beam strength 0..1 for the renderer: smoothsteps in as the light fails so the cone
 * never pops on, and browns out over the last seconds of battery as a dying warning.
 */
export function lampGlow(light: number, battery: number): number {
  if (battery <= 0 || !lampOn(light)) return 0
  const t = Math.min(1, (LAMP_ON - light) / RAMP_SPAN)
  const ramp = t * t * (3 - 2 * t)
  const fade = Math.min(1, battery / FADE_SECONDS)
  return ramp * fade
}
