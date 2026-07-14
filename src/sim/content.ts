import { BOSS_LADDER, BOSS_WAVE_INTERVAL } from './boss'
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
 *
 * It is not *only* a list of ids, either. Content is also the handful of numbers that decide
 * which world you are standing in — BOSS_WAVE_INTERVAL is the first of them (2026-07-14, when
 * it went 5 → 3). Everything above says what *exists*; a cadence says *when*, and a client that
 * thinks wave 3 is a Shifter wave while the server still thinks wave 5 is will announce a boss
 * nobody spawned. Same silent class of skew, same refusal. Tuning that changes the shape of a
 * shared run belongs in this hash; tuning that only changes how a soldier feels (gas, drag,
 * slash cooldown) does not — the server never disagreed with you about those.
 */
export const CONTENT_HASH: string = hashFacts(contentFacts())

/**
 * Every fact about the world both sides must agree on, flat. `bossEvery` is a parameter for
 * exactly one reason: a test can vary it and prove the hash actually moves. The old guard here
 * asserted CONTENT_HASH === CONTENT_HASH, which is true of any constant and proves nothing —
 * the same placebo shape that let three dead upgrades ship green (see upgrades.test.ts).
 *
 * The facts are not only ids. A mode that grew a CROWD, or a map whose POPULATION changed, is a
 * different game even though every id in the registry is unchanged — and a client that thinks
 * the streets are empty while the server is feeding titans on them is exactly the divergence
 * this hash exists to refuse.
 */
export function contentFacts(bossEvery: number = BOSS_WAVE_INTERVAL): string[] {
  return [
    ...GAME_MODES.map((m) => `mode:${m.id}:crowd=${m.crowd}`),
    ...GAME_MAPS.map((m) => `map:${m.id}:pop=${m.population}`),
    ...Object.keys(KIND_STATS).map((k) => `kind:${k}`),
    ...BOSS_LADDER.map((b) => `boss:${b.id}`),
    ...UPGRADE_POOL.map((u) => `upgrade:${u.id}`),
    `bossEvery:${bossEvery}`,
  ]
}

export function hashFacts(facts: string[]): string {
  // sorted so a reordered registry is the same content: only what exists matters
  return hashSeed([...facts].sort().join('|')).toString(36)
}
