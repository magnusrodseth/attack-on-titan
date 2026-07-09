# 0001 — Server-authoritative co-op on Cloudflare partyserver

Date: 2026-07-09 · Status: accepted

## Context

Multiplayer is shared-world co-op: one set of titans that 2–4 soldiers fight together. Three
forces shape the architecture:

1. The sim (`src/sim/`) is pure, deterministic TypeScript at a fixed 120 Hz — it can run anywhere,
   including on a server.
2. ODM movement is the product; any added input latency on mouse-look or hooks would ruin it.
3. Deterministic lockstep across browsers is unsafe: `Math.sin`/`Math.cos` results differ between
   JS engines, so Chrome and Safari clients would desync even with identical inputs.

PartyKit was acquired by Cloudflare; the actively maintained successor is `partyserver` (same
room/`Server` model, `partysocket` client) deployed to one's own Cloudflare account on Durable
Objects. The original partykit.io hosted platform still works but is the legacy path.

## Decision

- **Authority split**: a Cloudflare Durable Object (via `partyserver`) runs the shared sim —
  titans, waves, per-player scoring — stepping the same pure sim code the client uses. Each
  client stays authoritative over its own soldier's movement (local 120 Hz physics, zero added
  latency) and streams position/state to the room; the server treats soldiers as player proxies.
- **Combat**: clients report slashes (ray + speed + tick); the server validates them against a
  short history ring of titan positions (lag compensation, bounded rewind) and emits kill events.
  Scores are therefore server-computed and the leaderboard is cheat-resistant by construction.
- **Snapshots**: the server broadcasts world snapshots at ~20 Hz; clients interpolate titans and
  remote soldiers between snapshots.
- **One backend, one provider**: the same Worker serves the small HTTP API
  (register/login/leaderboard) next to the websockets. Durable state (users, sessions, matches,
  match_players) lives in **Cloudflare D1** via Drizzle ORM; D1 is a Worker binding, so there
  are no connection strings or secrets, and wrangler dev ships a local database. (Amended
  2026-07-09: originally Neon Postgres; the user chose D1 after seeing the operational cost of
  a second provider. The Drizzle schema carried over in the SQLite dialect.) Ephemeral state
  (lobby, match) lives in the room.
- **Protocol**: versioned JSON messages in `src/net/protocol.ts`, shared by client and Worker.

## Alternatives rejected

- **Deterministic lockstep** — cross-engine trig nondeterminism; 50–100 ms input delay on look.
- **Host-client authority** — match dies or stutters with the host (background-tab throttling);
  host migration is its own project.
- **partykit.io hosting** — legacy platform post-acquisition; wrong risk for a shared public link.
- **Separate API on Vercel functions** — a second backend deploy and secret store for three
  endpoints the Worker can serve itself.

## Consequences

- The sim gains a multi-player world seam (`src/sim/coop.ts`): titans target the nearest of N
  proxies; slash validation accepts arbitrary sources; wave scaling accounts for player count.
- The Worker must tick the sim in real time; a Durable Object cannot hibernate during a match
  (acceptable: matches are minutes long, rooms idle back to hibernation in the lobby).
- Deploys require only `wrangler` (Cloudflare) auth; the frontend needs the Worker host in
  `VITE_PARTY_HOST`.
- Clients are trusted about their own movement (sanity-clamped server-side). Fine at
  friends-lobby stakes; full anti-cheat is explicitly out of scope for v1.
