# Wayfinder Map: Real-time co-op multiplayer

Label: `wayfinder:map` · Tracker: local markdown (`wayfinder/tickets/`, `mp-` prefix) · Fresh
effort — the solo map ruled multiplayer out of scope; the destination has been redrawn.

## Destination

Friends play Wings of Freedom together in production at attack-on-titan.magnusrodseth.com:
code + link lobbies (up to 4), one shared set of titans per match, team-wipe endings with an MVP
results screen, username accounts, and a global leaderboard — verified live with two real
browser profiles, ready to share on LinkedIn.

## Notes

- **This effort carries execution in-map** (like the solo map): the user requested the finished
  feature end-to-end; alignment happened HITL via grilling (mp-001), build proceeds autonomously.
- Skills in play: find-docs (partyserver/Neon/Drizzle via ctx7), tdd (sim seams), playwriter +
  playwright-cli (two-profile verification), onepassword-cli (secrets), neon-postgres /
  neon-drizzle / deploy-to-vercel (installed 2026-07-09).
- Glossary: `CONTEXT.md`. Architecture: `docs/adr/0001-server-authoritative-multiplayer.md`.
- The solo map (`wayfinder/map.md`) remains the authority for single-player decisions.

## Decisions so far

- [Multiplayer alignment](tickets/mp-001-multiplayer-alignment.md) — shared-world co-op,
  server-authoritative on Cloudflare partyserver, code+link lobbies (cap 4), team-wipe + MVP,
  personal timed upgrades, username+password auth, server-written match leaderboard.
- Database: Cloudflare D1 over Neon (user decision, 2026-07-09, amending mp-001/ADR 0001) —
  one provider, one library; D1 is a binding so there are no secrets and local dev needs no
  extra services. Same Drizzle schema in the SQLite dialect.
- Netcode as built (2026-07-09) — `src/sim/coop.ts` (server world: nearest-player targeting,
  per-player chase tokens, lag-compensated slashes off a 30 Hz titan-pose history, timed
  personal offers, team-wipe results) + `src/sim/coopClient.ts` (local 120 Hz pilot, snapshot
  interpolation 120 ms behind, self-mirror of server-owned hp/blades/score) + `server/room.ts`
  (lobby state machine, 30 Hz tick loop, creator reassignment on leave, match write via atomic
  D1 batch). Room code doubles as the city seed via the `?lobby=` reload pattern; the match
  seed appends a rematch counter so waves and offers stay fresh in the same city.
- Verified end-to-end locally with two automated browsers (2026-07-09): register/login,
  code+link join, ready/start, identical mirrored titans, seven server-validated kills with
  attribution and heart-back, wave clear → personal offers → pick timer auto-pick → scaled
  wave 2, death → spectate, team wipe → MVP results screen, match rows in the leaderboard
  API and panel, rematch, both-clients-drop resilience. Solo mode regression-checked.

## Not yet specified

- Reconnect into a running match (drop → rejoin same soldier) — v1 treats a drop as leaving.
- Spectator camera polish (follow-cam targets, kill-cam) beyond a basic orbit of teammates.
- Difficulty tuning after real 2–4 player playtests (the ~75%-per-player titan scaling is a
  starting point, not a law).
- Anti-cheat beyond server-side sanity clamps on reported movement.
- Custom domain for the Worker (workers.dev first).
- Per-mode / per-week leaderboard slices; posting solo runs when logged in.
- In-lobby text chat.
- Hardening: the same account joining a room twice in the same instant can slip past the
  duplicate-handle check (async token validation between check and insert); snapshot bandwidth
  at high waves could drop long-dead titans; register/login rate limiting.

## Out of scope

- Public matchmaking with strangers (friends-only story for v1).
- Shared-world PvP or competitive sabotage.
- Email flows: confirmation, password reset (lost password = new soldier in v1).
- Mobile/touch multiplayer (mobile is gated out of the game entirely).
