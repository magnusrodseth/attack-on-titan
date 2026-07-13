import { buildArmoredTitan } from './armored'
import { buildAttackTitan } from './attack'
import { buildBeastTitan } from './beast'
import { buildCartTitan } from './cart'
import { buildColossusTitan } from './colossus'
import { buildFemaleTitan } from './female'
import { buildFoundingTitan } from './founding'
import { buildJawTitan } from './jaw'
import type { BossBodyBuilder } from './lib'
import { buildWarhammerTitan } from './warhammer'

/**
 * Procedural Shifter bodies, keyed by BossSpec.id: all nine of the Nine, each
 * transcribed from its blender/titans/<slug>/build.py (the Beast from the
 * original blender/build.py). BossFxView falls back to the capsule rig for any
 * spec that ever ships without a builder.
 */
export const BOSS_BODY_BUILDERS: Record<string, BossBodyBuilder> = {
  'armored-titan': buildArmoredTitan,
  'attack-titan': buildAttackTitan,
  'beast-titan': buildBeastTitan,
  'cart-titan': buildCartTitan,
  'colossus-titan': buildColossusTitan,
  'female-titan': buildFemaleTitan,
  'founding-titan': buildFoundingTitan,
  'jaw-titan': buildJawTitan,
  'warhammer-titan': buildWarhammerTitan,
}
