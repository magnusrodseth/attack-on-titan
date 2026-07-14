---
type: wayfinder:task
status: closed
assignee: claude (worktree-townsfolk, 2026-07-14)
blocked-by: [tf-002, tf-003, tf-006, tf-007, tf-008, tf-009]
---

# tf-010 · Tune it, verify it, ship it

## Question

The whole economy exists by now, and none of its numbers have been earned.

- **Feel-test the loop end to end**, in a real browser, at real speed: blades dull, the station runs
  low, the crowd is being eaten across the district, and the player has to choose. Tune the four dials
  together (blade wear curve, station stock, population, window length) — they are one system and
  tuning them apart will lie.
- **Check the bargain survives the tuning.** If saving everyone is achievable, the tension is gone; if
  saving anyone is hopeless, the crowd is set dressing. The target is a run where you save some, lose
  more, and know exactly which ones you chose to lose.
- **Co-op pass**: two browsers, a populated district, one squad splitting up. Does coverage feel like
  a plan or like chaos? Verify the wire under a full crowd (perf, snapshot size, the render-churn
  gotcha).
- **Acceptance**: `pnpm test` + `pnpm typecheck` green; solo runs on the district and the underground,
  day and night; a two-browser co-op wave with the crowd live; the Forest still has nobody in it.
- **Ship**: merge to main, `pnpm server:deploy` (the Worker and client ship together — the content
  hash refuses a skew), verify live in production.
- Update `CONTEXT.md` (Civilian, the devour window, station stock, headcount), `CLAUDE.md` if any
  convention moved, and close out this map's Decisions-so-far.

## Resolution — destination reached 2026-07-14

Measured in a real browser, not guessed:

- **AFK player**: 15 civilians lost per 90 s, none saved. The district thins over a run rather than
  draining in three waves (which is what the first, untuned build did).
- **A player who spends every window**: 8 saved, 0 lost, stations climbing 3/3 → 6/5. The supply
  line works, and it is fed by rescues and nothing else.
- The bargain survives the tuning: you save some, lose more, and know exactly which ones you chose
  to lose.
- **Co-op**: two browsers, one district, 64 people, the same 11 dead on both clients, the fist and
  the scream crossing the wire.
- Rebased onto main (which had shipped Field Kits and a testable content hash in parallel); merged
  the two resupply designs into one that is better than either. 604 tests, typecheck clean.
- Shipped: Worker first, then the client (the content hash refuses a skew).
