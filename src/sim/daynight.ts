import { createRng, hashSeed } from './rng'

/**
 * Deterministic time-of-day clock. The clock is a fraction of a day:
 * 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset. It derives entirely
 * from the seed and the sim time, so it replays with the run and survives the
 * run save (which already persists g.time) without any extra state.
 */

/** One full day/night cycle per 10 minutes of play. */
export const CYCLE_SECONDS = 600

// Every run starts in daylight (seeded between mid-morning and mid-afternoon)
// so night falls mid-run instead of greeting the player with a black screen.
export const START_MIN = 0.3
export const START_MAX = 0.6

// Sun elevation band around the horizon that reads as twilight; beyond it the
// sky is fully day or fully night. ±0.25 elevation ≈ 48 s of dusk per cycle.
const TWILIGHT = 0.25

/** Seeded hour the run begins at, as a clock fraction. */
export function startFraction(seed: string): number {
  const rng = createRng(hashSeed(`${seed}:daynight`))
  return START_MIN + rng() * (START_MAX - START_MIN)
}

/** Clock fraction at a sim time. */
export function clockFraction(seed: string, time: number): number {
  const f = (startFraction(seed) + time / CYCLE_SECONDS) % 1
  return f < 0 ? f + 1 : f
}

/** Sun height above the horizon, -1 (nadir) to 1 (zenith); 0 at sunrise/sunset. */
export function sunElevation(fraction: number): number {
  return Math.sin((fraction - 0.25) * Math.PI * 2)
}

/** 0 in full day, 1 in full night, smoothstepped through the twilight band. */
export function nightFactor(fraction: number): number {
  const t = (TWILIGHT - sunElevation(fraction)) / (2 * TWILIGHT)
  const clamped = Math.min(1, Math.max(0, t))
  return clamped * clamped * (3 - 2 * clamped)
}
