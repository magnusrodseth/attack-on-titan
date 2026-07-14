---
type: wayfinder:grilling
status: closed
assignee: claude (HITL grilling, 2026-07-14)
blocked-by: []
---

## Question

How is the day's expedition rolled, and what does that do to free play?

## Resolution (user-confirmed 2026-07-14, except where marked "decided by agent")

1. **The pool is 3 modes × 3 maps = 9 combinations.** Wave Survival, Signal Run and The Culling
   roll; **Bossrush is excluded**. The Nine ladder is the longest-form, least forgiving mode in
   the game and the worst thing to hand someone on their single attempt of the day — it stays a
   mode you choose deliberately. All map × mode combinations in the pool are eligible (every map
   hosts every mode as of 2026-07-14; the Colossal-under-the-dome and titans-under-a-ceiling
   problems were fixed at the source when the maps shipped, so there is no known-bad combo to
   exclude).

2. **Consecutive days never repeat the mode OR the map.**

3. **The derivation avoids a recursion trap — do not roll naively.** "Not yesterday's roll"
   invites `roll(d) = f(hash(d), roll(d-1))`, which recurses all the way back to an epoch: every
   client and the worker would have to iterate the whole history to agree on today. Use the
   closed-form Latin-square walk instead, which is O(1), needs no lookback, and guarantees the
   constraint by construction:

   ```
   d        = whole days since a fixed epoch (UTC)
   modeIdx  = d % 3
   mapIdx   = (d + floor(d / 3)) % 3
   ```

   Consecutive days always differ in mode (consecutive `d % 3`) and always differ in map (the map
   index advances by 1 or 2 mod 3, never 0). It enumerates all 9 combinations exactly once every
   9 days, so every combination gets equal time and none is ever starved. Per-cycle shuffle the
   index → id mappings with `hashSeed('daily:cycle:' + floor(d / 9))` so the schedule is not
   trivially predictable months out. Pin all of this with a test that walks a year and asserts: no
   consecutive repeat of mode or map, and all 9 combinations appear every 9 days.
   - **This derives the mode and the map only.** The *seed* is sealed and server-held — see the
     amendment below, which supersedes the guessable seed this ticket originally assumed.

4. **The day boundary is UTC** (decided by agent — a global board cannot have two players in
   different "days" at the same instant). Note this is a **live bug** in `dailySeed()`
   (`src/main.ts`), which builds `wall-YYYY-M-D` from local `new Date()` — two players either
   side of a timezone are already on different seeds right now. The daily fixes it.

5. **`?daily=2026-07-14` replays any past expedition, unranked** (decided by agent — determinism
   makes it free, and it is how a player shows someone the run they had). It never claims an
   attempt and never posts.

6. **Free play rolls a random seed per session.** The daily owns the dated seed. Practice stays
   real practice — the same systems, a different city — and today's exact line cannot be
   rehearsed, which is what makes the single attempt mean anything. `?seed=` URLs keep working
   (sharing a course is still a share), and the run save still resumes.

## Amendment (2026-07-14, found while building de-006): no per-cycle shuffle

Point 3 said to shuffle the index → id mapping once per 9-day cycle "so the schedule is not
trivially predictable months out". **That is wrong, and it is now dropped.** Reshuffling the ids
per cycle means the *index* still advances correctly across a cycle boundary while the *id*
behind that index changes — so the mode or map can repeat across the seam, breaking the one
guarantee the walk exists to provide. Proven, not argued: adding the shuffle turns the
year-long no-repeat test red (`expected 'waves' not to be 'waves'`).

Dropping it costs nothing. Predictability was only ever worth buying because a knowable course
could be rehearsed — and **the course is sealed now** (see below), so the seed is the secret and
the schedule is not. Knowing that next Tuesday is The Culling in the Forest is harmless, and
arguably a feature: it is something to look forward to.

The roll is therefore the pure closed form, ids in registry order. Consecutive days differ in
both mode and map, every pairing comes up once per cycle, and no two implementations can drift.

## Amendment (2026-07-14, from de-004's "sealed orders" decision)

Point 3's `hashSeed('daily:' + date)` is **not** the course seed. A seed anyone can derive is a
seed anyone can rehearse — `?seed=wall-2026-07-14&map=forest` would reproduce today's exact line
before you ever claimed it, which is the loophole a random free-play seed was supposed to close.
The roll therefore splits in two:

- **Public, and announced on the plate**: the *mode* and the *map*, from the closed-form
  Latin-square walk above. Everything in point 3 stands for those two.
- **Sealed, and server-held**: the *seed*, `hashSeed(DAILY_SECRET + ':' + date)` where
  `DAILY_SECRET` is a worker env var. Stateless, deterministic for the worker, unguessable for
  everyone else. It is revealed **only** by the claim (de-003), and published freely once the day
  has closed (so `?daily=2026-07-14` still replays a past expedition, per point 5).

## Consequence to carry into de-004 (surfaced while resolving this)

Free play on a random seed means **nobody shares a course by default**, and the per-arena trial
boards shipped on 2026-07-14 are keyed by `(map, seed)`. So in free play those boards will be
empty by construction — "No times on this course yet" forever, because no one else will ever
roll your seed. The competitive scope collapses onto the daily (plus explicitly shared `?seed=`
links, which become "community lines").

This is coherent — it is arguably the daily doing its job — but it means the Hall of the Fallen
should probably not show *this run's* trial boards when this run is an unshared random seed. What
it shows instead is a de-004 question.
