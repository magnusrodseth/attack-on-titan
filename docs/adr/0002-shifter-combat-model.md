# 0002 — Shifter combat model: only the lit part, by anything

Date: 2026-07-13 · Status: accepted

## Context

Shifters (the Nine boss titans) are milestone fights: every 5th wave of Wave Survival, one
named titan fought through a sequence of lit Weak Points ending at the nape. Three existing
rules collide with a naive boss implementation:

1. **Speed is damage** — a nape cut at `killSpeed` is the universal clean answer, and the
   project has an explicit non-goal (IDEAS.md, 2026-07-09): the one-cut threshold never
   scales with titan size or variant. A boss that demands a higher speed bar would break
   the game's core identity.
2. **Thunder Spears instant-kill on nape proximity** — left as-is, two hoarded spears would
   delete any boss finale without engaging the fight at all.
3. **Both-ankles cripple** — a generic kneel would trivialize a phase choreography built
   around specific body parts.

## Decision

A Shifter is damageable **only on its single lit Weak Point, by blades and spear blasts
alike**. Everything else about the model follows from that rule:

- **Part HP pools, immovable killSpeed**: each Weak Point has an HP pool set by its
  BossSpec. A cut at or above `killSpeed` always deals a flat 100 ("one clean cut");
  below it, the existing nape chip formula applies. Fight length is tuned by pool sizes
  and part counts (90 s early bosses → ~4 min for the Founding), never by moving the
  speed bar.
- **Breaks reuse Staggered**: cutting through a part breaks it, applies the existing
  spear-stagger state (per-spec duration), drains one bar chunk, and lights the next part.
  The nape is always the final Weak Point, with its own pool.
- **Breaks disable anchored abilities**: a part linked to an ability (the Beast's throwing
  wrist) silences that ability when broken, making part order tactical.
- **Plated parts**: blades bounce off (zero damage, still wear the blade) until a spear
  blast cracks the plate open — the Armored's whole identity, expressed as a spec flag any
  boss can use.
- **Off-part hits**: blades wear (body rate) and clink; blasts do nothing. The spear
  nape-instakill and the both-ankles cripple do not apply to Shifters.

## Alternatives rejected

- **Spears hurt anywhere** — spear hoarding becomes the brainless boss answer; phases stop
  mattering.
- **Binary one-clean-cut breaks** — every phase of every boss becomes exactly one pass;
  fight length only tunable by adding parts; sub-killSpeed play gets zero feedback.
- **Raised one-cut threshold on bosses** — violates the standing non-goal; punishes the
  exact skill the game teaches.
- **Off-part chip damage** — dilutes the lit-part language the HUD and glow are built on.

## Consequences

- `src/sim/boss.ts` owns part anchors (titan-local math like nape/ankle), pools, breaks and
  abilities; `combat.ts`/`spear.ts` route Shifter targets to it instead of the normal
  nape/ankle/body resolution.
- Scoring composes with the existing chain system: breaks bank 250 × chain, the final cut
  banks 2000 × speed/air/chain, with a Flawless bonus (+50%) when every part broke in one
  clean cut — the boss analog of oneCut.
- Co-op ships without Shifters (solo-only v1); the part state is plain serializable data so
  a later protocol version can carry it in snapshots.
