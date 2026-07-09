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

## Not yet specified

- Reconnect into a running match (drop → rejoin same soldier) — v1 treats a drop as leaving.
- Spectator camera polish (follow-cam targets, kill-cam) beyond a basic orbit of teammates.
- Difficulty tuning after real 2–4 player playtests (the ~75%-per-player titan scaling is a
  starting point, not a law).
- Anti-cheat beyond server-side sanity clamps on reported movement.
- Custom domain for the Worker (workers.dev first).
- Per-mode / per-week leaderboard slices; posting solo runs when logged in.
- In-lobby text chat.

## Out of scope

- Public matchmaking with strangers (friends-only story for v1).
- Shared-world PvP or competitive sabotage.
- Email flows: confirmation, password reset (lost password = new soldier in v1).
- Mobile/touch multiplayer (mobile is gated out of the game entirely).
