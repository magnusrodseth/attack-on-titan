---
type: wayfinder:grilling
status: open
assignee:
blocked-by: [pa-001]
---

# pa-007 · The Nine on the wire: what a co-op boss fight has to transmit

## Question

Bosses are the axis where co-op is not merely unwired but structurally absent, so they are the
proof the architecture works. `coop.ts` never imports `boss.ts`; `CoopSnapshot` has no boss field;
`CoopEvent` has none of the eleven boss events that solo emits (`bossEngaged`, `bossPlated`,
`bossPlateCracked`, `bossPartBroken`, `bossKilled`, `bossThrowWindup`, `bossProjectileImpact`,
`bossSummon`, `bossSteam`, `bossRoar`, `bossSpikeTelegraph`, `bossSpike`). The shared `trySlash` /
`stepSlashBuffer` / `stepSpears` already take an optional `boss` argument, so the combat plumbing
exists and is simply never fed from the co-op side.

Given the `World` from pa-001, decide the wire surface and the shared-fight rules:

- **The snapshot.** What of `BossFight` / `BossState` must stream at 20 Hz (part HP pools, the lit
  weak point, plated state, phase, ability timers, projectile positions) and what the client can
  derive or animate locally. The render layer anchors the weak-point glow to real joints via
  `partAnchor`, so it needs the part id, not a height fraction.
- **The events.** Which of the eleven cross to `CoopEvent`, and what a teammate should see and hear
  when someone *else* breaks a part (the Shifter combat model in `docs/adr/0002` is built around a
  single soldier's read of the fight).
- **Lag compensation for parts.** Slashes are already judged against where titans *were*. A boss
  part is a smaller, faster-moving target on a body that windups and staggers; state whether the
  existing rewind covers it or whether parts need their own history.
- **The shared fight itself.** Damage is per-part with HP pools: does a four-soldier team break a
  part four times as fast, and if so does the boss's HP or the ladder scale with roster size?
  Whose blast cracks a plate? Who gets the kill credit and the score?
- **The ladder on every map.** Boss rush must run on all three maps. The standing ruling is that a
  Shifter too tall for a map is dropped from that map's ladder (`bossLadderFor`), never scaled
  down, and co-op inherits it. Confirm what a lapping eight-Shifter cavern ladder means for a
  co-op match's length and end condition.
