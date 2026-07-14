/**
 * The co-op stance: what a piece of content does in multiplayer.
 *
 * Every registry entry in the game — a mode, a map, a titan kind, a Shifter, an upgrade, a
 * cross-cutting feature like Focus — must declare one. It is a required field, so a new
 * entry that says nothing about multiplayer does not compile. That is the whole point: the
 * bug this type exists to kill was never a wrong answer, it was silence. Maps, modes and
 * bosses were added for a year and co-op simply never heard about any of them (ADR 0003).
 *
 * The three honest answers:
 *
 *  - `shared`    The same code runs for one soldier or four, and nothing about it needed
 *                changing. Most content is this, because the world is one world.
 *  - `adapted`   It works in co-op, but it had to be reshaped to survive a shared world.
 *                Say how, in `note` — the note is the design record.
 *  - `soloOnly`  It cannot exist in a shared world, and we are saying so out loud rather
 *                than letting it quietly not be there. Say why, in `reason`. The menu and
 *                the lobby read this and refuse the content honestly.
 *
 * A stance is a claim, and a claim can be a lie — `shared` on a mode nobody ever ran with
 * four soldiers proves nothing. The parity harness (world.parity.test.ts) is what turns
 * these claims into assertions: it boots every non-soloOnly entry in a real world with a
 * squad and makes it prove itself.
 */
export type CoopStance =
  | { kind: 'shared'; note?: string }
  | { kind: 'adapted'; note: string }
  | { kind: 'soloOnly'; reason: string }

export function playableInCoop(stance: CoopStance): boolean {
  return stance.kind !== 'soloOnly'
}

/**
 * Cross-cutting features have no registry of their own to hang a stance off, so they hang
 * it here. Anything the world does that is not a mode, map, kind, boss or upgrade — but
 * that a player would notice missing in multiplayer — belongs in this table.
 */
export const FEATURES: { id: string; name: string; coop: CoopStance }[] = [
  {
    id: 'focus',
    name: 'Focus (bullet time)',
    coop: {
      kind: 'soloOnly',
      reason:
        'A shared world cannot slow down for one soldier. Focus scales dt in the solo driver before it ever reaches the world; there is nowhere to put that in a room of four. The meter is hidden in co-op rather than shown and refused.',
    },
  },
  {
    id: 'strike',
    name: 'Focus strike',
    coop: {
      kind: 'soloOnly',
      reason: 'The strike is spent from a Focus window, and Focus is solo-only.',
    },
  },
  {
    id: 'grab',
    name: 'The grab QTE',
    coop: {
      kind: 'adapted',
      note: 'The fist takes any soldier and everyone mashes their own way out; the grab rides the snapshot and the mash is an intent. No teammate rescue in v1 (user ruling, 2026-07-14) — a held soldier is on their own.',
    },
  },
  {
    id: 'flashlight',
    name: 'Flashlight battery',
    coop: {
      kind: 'adapted',
      note: 'The battery is personal: drained client-side, refilled by the server resupply ack. The world never sees it.',
    },
  },
  {
    id: 'save',
    name: 'Run save / resume',
    coop: {
      kind: 'soloOnly',
      reason:
        'A match lives in its room, not in a browser. Reconnecting re-subscribes to the live world instead of restoring a serialized one.',
    },
  },
]
