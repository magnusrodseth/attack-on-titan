import { nightFactor } from './daynight'

/**
 * The soldier's flashlight: a battery-timed beam that carries visibility through the
 * night. The battery only drains while the beam is lit, and only a resupply recharges
 * it. Sized against the day/night cycle (the sun is down ~300 s of every 600 s cycle)
 * so a full charge dies mid-night and one resupply covers the rest — the night's
 * survival wrinkle is that trip to the station.
 */
export const LAMP_BATTERY_SECONDS = 180

/** Below this many seconds the HUD warns and the beam starts visibly browning out. */
export const LAMP_LOW_SECONDS = 30

// The beam lights as the sun drops below the horizon (nightFactor 0.5) and reaches
// full strength partway into the twilight fade.
const LAMP_ON = 0.5
const RAMP_SPAN = 0.35
const FADE_SECONDS = 12

/** True inside the beam's operating window: sunset through sunrise. */
export function lampOn(fraction: number): boolean {
  return nightFactor(fraction) >= LAMP_ON
}

/** Advances the battery: one second of night burns one second of charge. */
export function drainLamp(battery: number, fraction: number, dt: number): number {
  if (battery <= 0 || !lampOn(fraction)) return battery
  return Math.max(0, battery - dt)
}

/**
 * Beam strength 0..1 for the renderer: smoothsteps in through late dusk so the cone
 * never pops on, and browns out over the last seconds of battery as a dying warning.
 */
export function lampGlow(fraction: number, battery: number): number {
  if (battery <= 0) return 0
  const night = nightFactor(fraction)
  if (night < LAMP_ON) return 0
  const t = Math.min(1, (night - LAMP_ON) / RAMP_SPAN)
  const ramp = t * t * (3 - 2 * t)
  const fade = Math.min(1, battery / FADE_SECONDS)
  return ramp * fade
}
