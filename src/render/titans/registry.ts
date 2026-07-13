import { buildCartTitan } from './cart'
import { buildJawTitan } from './jaw'
import type { BossBodyBuilder } from './lib'

/**
 * Procedural Shifter bodies, keyed by BossSpec.id. BossFxView prefers a registered
 * builder over the statue glb, so the port ships one titan at a time: registered
 * bosses articulate, unregistered ones keep the statue until their port lands.
 * When all nine are here, the glb path (and public/models/) goes away.
 */
export const BOSS_BODY_BUILDERS: Record<string, BossBodyBuilder> = {
  'cart-titan': buildCartTitan,
  'jaw-titan': buildJawTitan,
}
