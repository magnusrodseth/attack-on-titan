---
type: wayfinder:grilling
status: closed
assignee: claude (HITL grilling, 2026-07-14)
blocked-by: []
---

## Question

What is the attempt-claim protocol, and what happens to a claim that never comes back?

## Resolution (user-confirmed 2026-07-14, except where marked "decided by agent")

1. **An abandoned claim is a wasted day.** Claim, play badly, close the tab: the day is spent,
   you appear nowhere on the board, and you do not get another attempt. No heartbeat endpoint, no
   grace reclaim.
   - This is the choice that makes rage-quitting pointless: quitting does not erase a bad run, it
     costs you the run *and* the placement. There is nothing to gain by closing the tab.
   - Accepted cost: a genuine crash or a dead battery also costs the day. "My browser died" will
     be a real complaint and the answer is "yes, that is the format."
   - Rejected: a heartbeat posting your last autosaved state (stronger, but a whole endpoint to
     buy an edge case); a one-time reclaim (trivially gamed — it is Restart Run in a disguise,
     and we deliberately did not build Restart Run).

2. **A failed claim starts the run UNRANKED, loudly.** Worker down or player offline at Deploy:
   the run begins behind a visible "Headquarters unreachable — this expedition will not post"
   state. A hobby worker having a bad day must not take the game's headline mode down with it.
   - Rejected: refusing to start (a backend hiccup kills the mode for a blameless player);
     optimistic claim-later (offline becomes unlimited retries, which silently undoes de-001).

3. **The submit endpoint requires a claim.** A result with no claim row for that (account, date)
   is rejected — otherwise the claim is decorative.

4. **The worker derives the roll itself; it never trusts the client's word for it** (decided by
   agent). The claim response carries the authoritative (mode, map, seed) for the date, and the
   submit is validated against it. Implication: the roll derivation from de-002 must be **one
   pure module imported by both** `src/sim/` and `server/`, with a test asserting the two agree
   for a year of dates. Two copies of that formula is a bug waiting to happen.

5. **Schema: one table, `daily_runs`** (decided by agent), keyed `(user_id, date)`:
   `claimed_at`, the authoritative `mode` / `map` / `seed` stamped at claim time, then nullable
   result columns (`metric` discriminator + value, matching whatever de-004 settles) and
   `submitted_at`. Claim inserts the row; submit fills it. The date — not the seed — is the key,
   so the row survives the day's discipline changing and the board query is a single date scan.

## Amendment (2026-07-14, from de-004's "sealed orders" decision)

The seed is sealed until claim, but de-001 says a signed-out visitor can still run the daily
(unranked) — and they cannot generate the world without the seed. So:

- **Signed-out gets an anonymous claim** (decided by agent — the two alternatives both overturn a
  decision the user has already rejected twice). `POST /api/daily/claim` with no account returns
  the orders (mode, map, seed) without writing an account row; the client marks the date locally.
  Signed-out play stays possible on a shared link, and it still cannot post.
- **Residual hole**: an incognito window fetches today's orders without spending anything, so a
  determined player can rehearse. Same devtools-grade hole as the one below, and accepted on the
  same grounds. Sealing the orders raises the cost of practice from "edit a URL" to "deliberately
  circumvent"; it does not make it impossible, and the map rules the real fix (a
  server-authoritative sim) out of scope.

## The practice loophole (known, accepted)

Decisions 2 and de-002's random free-play seed interact: the *only* way to play today's course is
the daily, so a player who goes offline at Deploy gets an unranked practice run on the exact
course, then comes back online and claims for real.

- **Mitigation**: the client marks the date locally on **any** daily deploy — ranked, unranked or
  signed-out — and refuses to claim a date it has already marked. That makes the loophole cost a
  devtools command rather than a click.
- **Residual hole, knowingly accepted**: devtools still opens it. Closing it properly means a
  server-authoritative sim, which the map rules out of scope (solo results have always come from
  the client sim; the existing trials accept the same threat model with plausibility gates only).
  The prize is a name on a hobby leaderboard. This is written down so nobody rediscovers it and
  thinks it is a bug.

## Accepted limitation

The claim is server-side; the run save is `localStorage`. So claiming on a laptop and finishing on
a desktop is impossible — the second device gets a 409 with no local save to resume, and the day
is gone. Cross-device resume would need the save on the server, which is a different feature. The
UI must at least *explain* this state rather than showing a dead end (carry into de-005).
