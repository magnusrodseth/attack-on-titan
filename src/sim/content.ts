import { BOSS_LADDER } from './boss'
import { GAME_MAPS } from './maps'
import { GAME_MODES } from './modes'
import { hashSeed } from './rng'
import { KIND_STATS } from './titan'
import { UPGRADE_POOL } from './upgrades'

/**
 * The content fingerprint: everything the client and the server must agree exists.
 *
 * PROTOCOL_VERSION says both sides speak the same message *shape*. It says nothing about
 * whether they know the same *content* — and they routinely do not, because the client
 * deploys to Vercel on push while the Worker deploys separately by hand. A client that has
 * never heard of a titan kind the server just spawned will happily build it and then read
 * `KIND_STATS[kind]` as undefined; a client missing a boss id renders nothing where a
 * sixty-metre Colossal is standing. Both are silent, and both are worse than a refusal.
 *
 * So the handshake carries this hash. Same hash, same world. Different hash, the server
 * refuses the connection and tells the player to reload rather than letting them fight a
 * world that is not the one everyone else is in.
 *
 * It is derived, not hand-bumped: add a mode, a map, a kind, a Shifter or an upgrade and
 * the hash moves by itself. Nobody has to remember.
 */
export const CONTENT_HASH: string = computeContentHash()

function computeContentHash(): string {
  const ids = [
    ...GAME_MODES.map((m) => `mode:${m.id}`),
    ...GAME_MAPS.map((m) => `map:${m.id}`),
    ...Object.keys(KIND_STATS).map((k) => `kind:${k}`),
    ...BOSS_LADDER.map((b) => `boss:${b.id}`),
    ...UPGRADE_POOL.map((u) => `upgrade:${u.id}`),
  ]
  // sorted so a reordered registry is the same content: only what exists matters
  return hashSeed(ids.sort().join('|')).toString(36)
}
