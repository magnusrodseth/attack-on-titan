---
type: wayfinder:task
status: closed
assignee: claude (autonomous session, 2026-07-09)
blocked-by: [006, 007]
---

## Question

Verify the game live in Chrome via playwriter: page loads without console errors, scene renders,
sim advances, waves spawn, a scripted kill works through the debug hook; screenshot evidence.
Tune constants that feel wrong.

## Resolution

Driven via `window.__aot` debug hook in the user's Chrome. Verified: clean console; city renders
in AoT style (vista screenshot); titan close-up with grin and nape glow; scripted one-cut kill
(+256), wave clear → upgrade cards → wave 2; death → DEVOURED overlay with persisted bests;
retry works; 15s blind-swing stress test (no NaN, no wall escapes, no tunneling). Found and fixed:
ground-pinning while hooked+gassing, momentum-killing landings, unhandled pointer-lock rejection
(now a PAUSED overlay covers playing-but-unlocked). Pointer lock itself cannot engage in a
backgrounded automated tab; needs one manual click in a focused tab — standard browser behavior.
