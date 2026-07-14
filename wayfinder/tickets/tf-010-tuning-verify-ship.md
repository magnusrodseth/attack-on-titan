---
type: wayfinder:task
status: open
assignee:
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
