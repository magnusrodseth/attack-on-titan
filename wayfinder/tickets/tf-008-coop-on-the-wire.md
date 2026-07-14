---
type: wayfinder:task
status: open
assignee:
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
