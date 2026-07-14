---
type: wayfinder:grilling
status: closed
assignee: claude (worktree-unified-world, 2026-07-14)
blocked-by: [pa-001]
---

# pa-006 · Who owns a soldier's state when there is one world

## Question

The two paths disagree today about who owns what, and the disagreement is undocumented. In solo,
one `PlayerState` holds everything. In co-op, hp / blades / bladeHp / spears / score / kills /
combo / alive are server-authoritative and stream down in the snapshot, while position, velocity,
gas, canisters and the flashlight battery are client-local and never transmitted at all. The server
keeps a *shadow* `gas`/`canisters` on its player body that it mutates on resupply and never sends.
Meanwhile the resupply radius is 10 m in solo and 15 m in co-op ("slack for report latency"), and
the wave-clear bonus is a literal in one file and an exported constant in the other.

Given the `World` from pa-001, decide the ownership table and make it a single source of truth:

- **Field by field**, what the world owns, what the client owns, and what is a client prediction of
  a world-owned value. Gas is the interesting one: it is movement fuel, so it must be local for
  feel, yet resupply is a world event.
- **The shadow-state question.** Does the world keep a copy of client-owned values (as `CoopPlayer.body`
  does today) so it can validate and resupply, or does the client report them and the world only
  sanity-clamp? What stops a modified client from claiming infinite gas, and how much do we care
  (this is a friends-and-links game with a public leaderboard)?
- **The divergent constants.** Resupply radius, wave bonus, and any others the audit turns up:
  one value with a stated reason, or two values with a stated reason. No more silent drift.
- **Solo as the one-player case.** Under the answer, does solo still literally hold a `PlayerState`,
  or does it hold the same body type the world sees, with the extra solo-only fields hanging off it?
- **Persistence.** `serializeRun` serializes today's `GameState`. Say what it serializes after the
  split (this is the seam that later decides whether co-op can ever have saves).

## Resolution

The ownership table, now single-sourced in `World`:

- **World owns**: hp, maxHp, blades, bladeHp, spears (ammo), score, kills, combo, alive, deaths,
  invulnTimer, the grab, offers/picked. These stream down in the snapshot.
- **Client owns**: position, velocity, onGround, hooks, gas, canisters, and the flashlight battery.
  Gas is movement fuel, so it must be local for feel; resupply is a world *event* that the client
  applies (`worldResupply` emits, the client refills).
- **Shadow state**: the world keeps a body per soldier so it can validate and resupply. Reports are
  sanity-clamped (NaN rejected outright, radial clamp, 60 m/s speed cap) and that is all the
  anti-cheat this game wants — it is a friends-and-links game, and a modified client can already
  only cheat itself into a leaderboard row.
- **Divergent constants folded**: `RESUPPLY_RADIUS` is 10 everywhere, with an explicit
  `RESUPPLY_REPORT_SLACK` of 5 added only in co-op (the position is a *report*, not a fact) — one
  value, one stated reason. `WAVE_BONUS` is one exported constant, no longer a literal in one file
  and a constant in the other.
- **Persistence**: `serializeRun` still serializes the solo `GameState`, which is a World with one
  soldier. Co-op saves stay out of scope (a match lives in its room; reconnect re-subscribes).
