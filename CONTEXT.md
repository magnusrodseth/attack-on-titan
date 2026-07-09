# Glossary

Canonical language for Wings of Freedom. Terms only — implementation lives in code, decisions in
`docs/adr/` and the wayfinder maps.

## World and combat (solo core)

- **Wave** — one round of titan spawns; clearing it heals everyone and offers Upgrades.
- **Aberrant** — the fast erratic titan variant; rarer, worth more.
- **Nape** — the kill spot on a titan's neck; slashes there kill when the soldier is fast enough.
- **Ankle slice** — cutting both ankles kneels a titan, lowering its nape.
- **Upgrade** — a pick-1-of-3 perk offered between waves.
- **Resupply** — refilling gas, blades, and health at a station in the city.
- **Focus** — the slow-motion meter (Q).
- **Seed** — the string that determines the whole city and every random stream; same seed, same world.

## Multiplayer

- **Soldier** — a player's in-world character: first-person for its owner, a visible body to teammates.
- **Handle** — the unique account username; who you are in lobbies and on leaderboards.
- **Session** — a logged-in identity (opaque token) presented when joining a Room or reading `/me`.
- **Room** — an addressable realtime space named by a Room code; holds one Lobby and its Matches.
- **Room code** — the short shareable identifier (also carried in a join link) that names a Room.
- **Lobby** — the pre-match gathering in a Room: roster, ready checks, the Creator's start control.
- **Creator** — the soldier who opened the Room; the only one who can start a Match.
- **Ready check** — a soldier's declaration in the Lobby that they are set for the next Match.
- **Match** — one co-op run by a locked roster against shared titans; ends at Team Wipe.
- **Team Wipe** — all soldiers of a Match dead at the same time; the Match is over.
- **MVP** — the soldier with the highest individual score in a finished Match.
- **Spectator** — a dead soldier watching teammates until the wave clears (then respawns), or a
  late joiner waiting in a locked Room for the next Match.
- **Rematch** — returning a finished Match's roster to the Lobby of the same Room.
- **Player proxy** — the server's stand-in for a Soldier whose movement its own client controls.
- **Snapshot** — the server's authoritative view of the shared world, streamed to clients in a Match.
- **Lag compensation** — judging a slash against where titans were when the soldier swung, not
  where they are when the message arrives.
- **Leaderboard** — the global rankings: best teams (waves cleared) and best soldiers (match score).
