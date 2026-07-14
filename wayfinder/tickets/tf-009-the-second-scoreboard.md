---
type: wayfinder:task
status: open
assignee:
blocked-by: [tf-003, tf-005]
---

# tf-009 · The headcount: a run's second scoreboard

## Question

What the district's losses add up to, and what they leave behind.

- **The count**, tracked per run: living, saved, devoured. Where it lives in the world, and how it
  survives the run save (`persist.ts`).
- **The run summary line.** "Wall Rose, wave 14. Civilians lost: 61." lands harder than a score, and
  it belongs on the death card and the results screen (solo and co-op both).
- **In-run read**: is there a live headcount in the HUD, or is that too much of a scoreboard for a
  thing we deliberately refuse to pay points for? A quiet count that only surfaces between waves may
  be truer to the design. Grill it rather than assuming.
- **Commendations** already ride the event bus (`src/sim/commendations.ts`): "Not one soul" (clear a
  wave with zero losses) and "Snatched from the jaws" (interrupt N grabs) cost almost nothing now.
  Keep them few and hard.
- **The emptied district**: bare stations, silent streets, no crowd audio. A soft fail state that is
  not death. Whether it also has a mechanical consequence is still fog on the map; do not invent one
  here without asking.
- Analytics: the headcount is the single best signal of whether the tension is landing (are players
  spending the window, or farming feeding titans?). One PostHog property, no more.
