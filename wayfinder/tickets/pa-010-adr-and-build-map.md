---
type: wayfinder:task
status: open
assignee:
blocked-by: [pa-001, pa-002, pa-003, pa-004, pa-005, pa-006, pa-007, pa-008, pa-009]
---

# pa-010 · The handoff: ADR 0003 and the build map

## Question

Assemble every decision on this map into the two artifacts that *are* the destination, then stop.

1. **`docs/adr/0003-unified-world.md`**, in the house style of `0001-server-authoritative-multiplayer.md`
   and `0002-shifter-combat-model.md`: the context (two sim paths, content silently solo-only), the
   decision (one `stepWorld`, solo as the one-player case; the typed co-op stance; the ownership
   table; the content-version guard), the consequences, and the alternatives rejected (full loopback
   unification; checklist-and-discipline; everything-must-work-in-co-op).
2. **`wayfinder/map-unified-world.md`**, a fresh map whose tickets are pure build steps carrying
   execution in-map, in the shape of the time-trials map: extract the world, land the stance type
   and its `tsc` gate, thread the map through the lobby handshake, put the bosses on the wire,
   build the parity harness, migrate `coop.ts` onto `stepWorld`, verify with two browsers, deploy
   the Worker, merge. Zero decisions left in it: every open question this map raised is answered in
   the ADR, and any that is not gets ruled out of scope explicitly rather than smuggled into a
   build ticket.

Also update: `CONTEXT.md` (glossary terms this effort coins: World, co-op stance, and whatever
pa-001 and pa-002 name), `CLAUDE.md` (the rule for adding new content, so the next session reads it
before it writes a mode), and the `Not yet specified` section of this map (graduate what is now
sharp into the build map, leave what is still fog).
