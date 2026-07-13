# 010 — Commendations (achievements riding the event bus)

Status: in progress · Graduated from IDEAS.md ("Commendations: achievements riding the event
bus", audit idea agreed 2026-07-13) after a grilling session with the user (2026-07-13).
Glossary: Commendation in CONTEXT.md.

## Decisions (all user-confirmed, 2026-07-13)

- **Grain**: lifetime, earned once ever — a permanent mark on the soldier's record. First
  time the feat is performed: toast + unlock; repeats do nothing.
- **Term**: Commendation (verb: awarded). Rejected: achievement (genre word, breaks the
  military voice), medal.
- **Scope**: all solo modes award. Co-op deferred (its CoopEvent path is a second
  adapter). Playground and `__aot` autopilot/silent runs never award or count.
- **Roster amendment (2026-07-13)**: "Full Time" (both footballers in one wave) was dropped
  mid-build — a parallel session removed the footballer titans from the sim — and replaced
  with "Last Heart" (clear a wave with one heart remaining), keeping 10 feats.
- **Predicates**: single-run feats plus lifetime counters. Counters (kills, one-cuts, waves,
  Weak Point breaks, spear kills) live in the same save and feed tiered ladders — the
  "scales indefinitely" engine.
- **Toast**: dedicated corner toast ("Commendation · Name"), queued so simultaneous awards
  play one after another, subtle chime, never competes with center-screen tactical banners.
- **Panel**: menu plate alongside Settings/Leaderboard. All entries visible with requirement
  text; counter entries show live progress (634/1,000); awarded render brass, locked dimmed.
- **Reward**: the record itself, nothing mechanical. Sim untouched; cosmetics stay a future
  co-op-era option.
- **Placement**: `src/sim/commendations.ts` + colocated vitest suite, following the
  "tested logic lives in sim/" rule even though it is meta-state, not 120 Hz state. It owns
  its localStorage key through the existing `StorageLike` seam (the `loadBest` precedent);
  `main.ts` feeds it per solo tick and routes toasts.
- **Storage**: `aot-odm-commendations`, versioned `{ version: 1, awarded: { id: ISO date },
  counters: { ... } }`. Written when it changes (awards and counter bumps are kill-rate, not
  tick-rate). Multi-tab is last-write-wins like the run save.
- **Edge rules**: abandoned/restarted runs still count (events happened); no retroactivity
  (everyone starts at zero); a restored save taints the current wave for Cold Steel (the
  pre-restore boost history is gone); Point-Blank and Buzzer Beater read the previous tick's
  hook/clock state because kills tear hooks and level clears reset the hunt clock within the
  same tick.
- **Tests**: one per predicate class plus a reachability guard over the whole registry (no
  dead commendation can ship silently — the placebo-upgrades lesson).
- **No ADR**: versioned data, easily reversible; fails the ADR bar.

## Roster (~33 panel entries, user-approved)

Feats: First Blood, Clean Cut, Point-Blank, Terminal Velocity (kill ≥ 35 m/s), Fireworks
(two kills, one spear blast), Lightning Passage (focus-strike kill), Slipped the Fist,
Hamstrung, Last Heart (clear a wave at one heart), Cold Steel (clear a wave without
boosting).
Ladders (tiers I/II/III): Slayer 10/100/1,000 kills · Executioner 10/100/500 one-cuts ·
Campaigner 25/100/500 waves · Breaker 5/25/100 Weak Points · Demolitionist 10/50/200 spear
kills.
The Nine: one "Felled" entry per Shifter + capstone All Nine Silenced (progress n/9).
Modes: Flare Runner, Perfect Line (every gate ahead of PB), Cull Five, Buzzer Beater
(clear a Culling level with < 3 s left).
Survival: Untouched (flawless Shifter), Night Watch (dusk to dawn in one run), Lights Out
(60 s of night with a dead lamp), Mudlark (swim in the canal).
