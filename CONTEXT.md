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
- **Thunder Spear** — the explosive consumable secondary weapon every soldier carries alongside
  blades; fired at titans, it sticks where it hits and detonates after a fuse.
  _Avoid_: weapon class (there is no class system; spears augment the one standard kit).
- **Spear pickup** — a seeded cache in the city that restocks Thunder Spears; blipped on the
  minimap.
- **Staggered** — a titan briefly frozen, by a spear blast or by breaking a Shifter's Weak
  Point; unlike a crippled titan it keeps its wounds when it recovers.
- **Weak Point** — the one lit body part where a Shifter can currently be hurt, by blade or
  blast alike; cutting through it breaks it, Staggers the Shifter, drains one chunk of its
  bar, and lights the next part. The nape is always the last.
- **Plated** — an armored Weak Point that blades cannot cut until a Thunder Spear blast
  cracks it open.
- **Shifter** — one of the Nine named boss titans (Beast, Cart, Jaw, Female, Armored,
  War Hammer, Attack, Colossus, Founding), fought as the milestone event every 5th wave of
  Wave Survival, in a fixed ladder ending with the Founding.
- **Focus** — the slow-motion meter (Q).
- **Seed** — the string that determines the whole city and every random stream; same seed, same world.

## Time trials

- **Signal Run** — the parkour time trial: race a seeded Course of Gates from start to finish
  against the clock; no titans.
- **Course** — the start-to-finish sequence of Gates a seed lays through the city; same seed,
  same course, so times are only comparable per seed.
- **Gate** — one checkpoint on a Course, passed in order: a signal-flare smoke column marking
  it from afar and a glowing ring at the pass point. Passing a Gate refills gas.
- **Split** — the time difference against your best run, shown as each Gate is passed.
- **Featured seed** — the shared Course the menu promotes so global times contest the same run.
- **The Culling** — the hunt mode: clear each level's full titan roster before its countdown
  expires; levels escalate forever.
- **Relentless** — The Culling's rule: every titan tracks soldiers across the whole map and
  never abandons a chase.
- **Time budget** — a Culling level's countdown: seconds per titan in the roster, granted up
  front and tightening every level.

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
