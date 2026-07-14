export const SIM_DT = 1 / 120
export const GRAVITY = -19
export const EYE_HEIGHT = 1.7

/**
 * Two numbers that used to be plain module constants in spear.ts and grab.ts, and are now
 * per-soldier PlayerConfig fields (an upgrade moves each). They live down here in the leaf
 * because PlayerConfig's defaults need them: player.ts importing a *value* from spear.ts or
 * grab.ts would lean on those modules importing player.ts type-only, which is true today and
 * is not a promise anyone made. spear.ts and grab.ts still export them under their own names.
 */
export const DEFAULT_BLAST_RADIUS = 5
export const DEFAULT_GRAB_ESCAPE_PRESSES = 15
