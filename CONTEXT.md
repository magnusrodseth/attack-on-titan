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
- **The Nine** — the boss-rush mode: the Shifter ladder back to back, one boss per wave
  with an Upgrade between fights; past the Founding the ladder hardens and laps.
- **Focus** — the slow-motion meter (Q).
- **Seed** — the string that determines the whole city and every random stream; same seed, same world.
- **Commendation** — a permanent mark on a soldier's record, awarded once ever the first time
  its feat is performed; announced in-run, listed in the menu.
  _Avoid_: achievement (genre word, breaks the military voice), medal.

## Time trials

- **Signal Run** — the parkour time trial: race a seeded Course of Gates from start to finish
  against the clock; no titans.
- **Course** — the start-to-finish sequence of Gates a seed lays through an arena; same seed
  on the same map, same course, so times are only comparable per course scope.
- **Gate** — one checkpoint on a Course, passed in order: a signal-flare smoke column marking
  it from afar and a glowing ring at the pass point. Passing a Gate refills gas.
- **Split** — the time difference against your best run, shown as each Gate is passed.
- **Course scope** — what a trial board (and a local PB) is filed under: the seed, prefixed by
  the map on every arena but the District. Same seed, different map, honestly different course,
  so the Hall of the Fallen keeps one board per arena and the registry decides how many.
- **The Culling** — the hunt mode: clear each level's full titan roster before its countdown
  expires; levels escalate forever.
- **Relentless** — The Culling's rule: every titan tracks soldiers across the whole map and
  never abandons a chase.
- **Time budget** — a Culling level's countdown: seconds per titan in the roster, granted up
  front and tightening every level.

## The world (ADR 0003)

- **World** — the one simulation: an arena, a mode, the titans and Shifters in it, and the
  Soldiers fighting them. Solo drives a World with a roster of one; a Match drives one with N.
  There is no other place the game happens.
  _Avoid_: "the sim", "the server world" (there is only one, whoever is driving it).
- **Driver** — whatever advances a World: the solo loop, or the room's server tick.
- **Co-op stance** — what a piece of content does in multiplayer, declared in its registry entry
  and required by the type system: **shared** (same code for one soldier or four), **adapted**
  (reshaped to survive a shared world, with the adaptation stated), or **solo-only** (cannot be
  shared, with the reason stated).
- **Content hash** — the fingerprint of the mode/map/kind/boss/upgrade registries, carried in the
  room handshake. Same hash, same game; a mismatch is refused rather than fudged.

## The district's people

- **The Evacuation** — the mode the people live in: the district is full of civilians and every
  titan that is not hunting a soldier is eating one. The headcount is the life bar, so the run
  ends when the last civilian does, whatever hearts you have left. Wave Survival, The Nine, The
  Culling and Signal Run all run on empty streets.
- **Civilian** — one of the townsfolk: a person in the streets who cannot fight. They walk, they
  panic, and when they panic they run **toward the nearest soldier**, because a soldier is safety.
  _Avoid_: NPC, villager (they are the population of a walled city, not set dressing).
- **The window** — the few seconds between a titan lifting a civilian to its mouth and the bite.
  The titan stands still throughout, which makes it the easiest nape in the game. Kill or stagger
  it and they drop, saved; miss and they are gone for the rest of the run.
- **The headcount** — a run's second scoreboard: how many of the district's people are still
  alive. It only ever goes down. Rescues pay **no points**, ever.
- **Station stock** — what a resupply station has left to give. Blades and spears run out; gas,
  hearts and the lamp never do. Survivors who reach a station restock it, so the supply line is
  fed by rescues and by nothing else.
- **Dull blades** — worn steel raises the one-cut bar: a fresh pair kills at killSpeed, a spent
  pair needs about 21.5 m/s. This is why you need a station, which is why stock matters.

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
