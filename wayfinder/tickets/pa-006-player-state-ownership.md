---
type: wayfinder:grilling
status: open
assignee:
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
