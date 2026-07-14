---
type: wayfinder:task
status: closed
assignee: claude (worktree-townsfolk, 2026-07-14)
blocked-by: [tf-004, tf-005]
---

# tf-008 · The crowd, on the wire

## Question

Civilians declared `shared`, so the claim has to be true (ADR 0003, `src/sim/parity.test.ts`).

- **The snapshot.** Civilians ride `CoopSnapshot` next to the titans: id, position, state, and the
  grab (who holds them, how much window is left). Budget it: a full district of people at 20 Hz is a
  bigger array than anything on the wire today. Consider what the client can derive (a walk path) vs
  what it must be told (a grab, a death).
- **The events**: `grabbed`, `saved`, `devoured` cross to co-op with credit where it belongs, so a
  teammate's rescue shows in the feed and the scream stops for everyone at the same instant.
- **The mirror**: `syncCivilianMirror` on the pattern of `syncTitanMirror`/`syncBossMirror`, feeding
  `CivilianPool` untouched.
- **Rescue credit with four soldiers**: whoever breaks the grab gets the save; a station restocked by
  a survivor belongs to the squad, not to a person. Do not let this become a competition; the whole
  point is coverage.
- **The parity harness sweeps it**: civilians spawn, get hunted, get eaten and get saved in a
  four-soldier world, on every map whose stance says it has people.
- Perf: re-check the co-op render-churn gotcha (array identity, see the coop-perf memory) with a
  populated district before believing any frame number.

## Resolution

Civilians, station stock and the headcount ride `CoopSnapshot`; `syncCivilianMirror` rebuilds them
client-side on the `syncTitanMirror` pattern; `civilianSeized` / `civilianSaved` / `civilianDevoured`
/ `civilianDelivered` cross with credit, so a squad watches the same window close at the same
instant. PROTOCOL_VERSION 3.

The content hash now covers `mode.crowd` and `map.population`, not just registry ids — a mode that
grew a crowd is a different game even though no id changed, and a client that thinks the streets are
empty while the server is feeding titans on them is exactly the divergence the hash exists to refuse.

Five parity tests hold the `shared` stance to its word, and a live two-browser match confirmed it:
both clients, 64 people, the same 11 dead, someone in a fist, the same events on the wire.
