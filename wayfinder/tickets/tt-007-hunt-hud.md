---
type: wayfinder:task
status: closed
assignee: claude (worktree-timetrials session, 2026-07-10)
blocked-by: [tt-006]
---

## Question

Build The Culling's HUD and urgency layer: big centered countdown (m:ss); TITANS LEFT count
flashing on each kill; level in the wave row; combat rows unchanged. Under ~20% remaining
time: countdown reddens and pulses, a low heartbeat/drum layer rises on the existing sfx
GainNode bus, and a subtle red vignette closes in. Results screen on run over: level reached,
kills, score, best-level PB. Verify pacing and the urgency threshold in the browser via
playwriter.

## Resolution

Built on the HudFrame plumbing (`index.html` + `src/hud.ts` + `src/audio.ts` + `main.ts`).

- **Countdown strip** (`#hunt-strip`, Cinzel): big centered `m:ss` (ceil of `timeLeft`),
  `TITANS LEFT · n` beneath with a scale-flash on every kill. Combat rows untouched.
- **Level in the wave row**: `announceWave` speaks in levels for the hunt ("Level N",
  matchday levels keep their drum); the run-start banner stays "The Culling".
- **Urgency layer** at `HUNT_URGENCY_FRACTION` (20%): the countdown reddens and pulses
  (CSS animation), a red vignette closes in on a 1.4 s fade, and a procedural low
  heartbeat (paired 58→34 Hz thumps at ~66 bpm on its own GainNode under the sfx bus)
  rises on its own gain ramp — state-driven per frame via `hud.updateHunt` →
  `audio.setHeartbeat`, so it dies with the level clear, the death, or the pause. The
  `huntUrgency` edge event adds a one-shot banner ("The Clock Runs Thin") + thud;
  `huntTimeout` booms and shakes.
- **Run-over card**: the death overlay branches for the hunt — title "The Clock Ran Out"
  on timeout ("Devoured" on death), then LEVEL reached · CLEARED, KILLS · SCORE, and the
  seed's BEST level/score PB when one exists.
- **Verified** via playwright-cli + `__aot`: strip readout, relentless convergence
  (all alive titans chasing), forced urgency (red pulse + banner), and the timeout card.
