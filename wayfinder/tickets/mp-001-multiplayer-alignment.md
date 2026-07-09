# mp-001 — Multiplayer alignment (grilling, 2026-07-09) · CLOSED

## Question

What does real-time multiplayer mean for Wings of Freedom — game model, authority, platform,
lobby rules, win conditions, identity, and durable storage — sharp enough to build end-to-end?

## Resolution (all user-confirmed)

1. **Game model: shared-world co-op.** One set of titans everyone fights in the same seeded city.
   (Ghost race and lockstep alternatives declined.)
2. **Authority: server-authoritative.** The room runs the pure sim for titans/waves/score; each
   client owns its own soldier's movement. Slashes validated with lag compensation. See
   [ADR 0001](../../docs/adr/0001-server-authoritative-multiplayer.md).
3. **Platform: `partyserver` on the user's Cloudflare account** (Durable Objects, wrangler).
   partykit.io rejected as legacy. The same Worker hosts the HTTP API (auth, leaderboard) over
   Neon Postgres + Drizzle.
4. **Lobbies: code + link.** Short room code (`?lobby=...` link), cap 4, ready checks, creator
   starts, locks at match start; late joiners spectate until the next match; leavers' soldiers
   vanish and the match continues.
5. **Match end: team wipe.** Team result = waves cleared (shared); individual scores rank the
   results screen, top score is MVP. Dead soldiers spectate and respawn full-heal on wave clear.
   Rematch returns the roster to the lobby.
6. **Upgrades: personal picks + timer.** Per-player seeded 1-of-3 on wave clear, 15 s pick timer
   with auto-pick. Titan count scales ~75% per extra player. Resupply unchanged (shared
   stations, personal resources).
7. **Auth: username + password.** Unique case-insensitive handle (3–16 chars), PBKDF2 via
   WebCrypto in the Worker, opaque session token in localStorage. No email, no reset in v1.
   Solo play stays auth-free.
8. **Database scope: co-op matches + leaderboard.** `users`, `sessions`, `matches`,
   `match_players`; matches written by the server (cheat-resistant); global leaderboard = best
   teams by waves + best soldiers by score. Solo bests stay in localStorage.

### Defaults accepted with the plan

- Teammate soldiers: hand-built capsule-limb model (titan construction style), scout-sourced CC0
  fabric/leather textures, green cloak tint, overhead name tag; teammate ropes and slash flashes
  render.
- Entry point: "Play With Friends" plate on the start menu; co-op is server-driven, not a
  `GAME_MODES` registry entry.
- Repo layout: single package; `server/` Worker imports `src/sim` directly; protocol types shared
  from `src/net/protocol.ts`.
- Workflow: `multiplayer` branch + Vercel preview + dev Worker; merge to main only after prod
  verification with two headed browser profiles. Secrets: 1Password → `wrangler secret` /
  `vercel env`; never in git.
- Client finds the Worker via `VITE_PARTY_HOST`; workers.dev host first, custom domain later.
