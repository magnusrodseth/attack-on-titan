---
type: wayfinder:grilling
status: closed
assignee: claude (worktree-unified-world, 2026-07-14)
blocked-by: []
---

# pa-003 · Getting a map (and a mode) into a co-op room

## Question

Co-op is District-only and Waves-only, and there is no message on the wire that could say
otherwise. Decide the handshake.

Facts: `coop.ts` calls `generateCity` directly rather than going through `maps.ts`; the client
forces `mapId = DEFAULT_MAP_ID` whenever `?lobby=` is present; `LobbyMsg` has no map or mode
field and `ClientMsg` has no variant that could set one; `matchStart` carries only `{ seed, roster }`;
the arena is never sent over the wire, each client regenerates it from the seed; and the room's
city seed is derived from the room code (`coop-<code>`) precisely so the city survives a rematch.

- **Who chooses, and when.** Creator-only in the lobby (mirroring the existing `ready`/`start`
  pattern), or fixed at room creation and baked into the room code? Can it change between
  rematches in the same room?
- **The protocol changes.** Which messages gain which fields; whether `PROTOCOL_VERSION` bumps or
  this rides the established additive-optional-field convention (the way `slash.look?` did).
- **Seed derivation.** The city seed is the room code today. If two maps can be played in one
  room, does the map id fold into the seed (so each map gets its own city), and what does that do
  to the rematch guarantee that the city persists?
- **Client bootstrap ordering.** The client builds its `GameState`, arena and three.js scene at
  page load, before any socket message arrives. So either the join URL carries the map (and a
  joiner who arrives before the creator switches maps must reload) or scene construction defers
  until the lobby announces the map. Choose, and say what the joiner sees while it resolves.
- **Illegal combinations.** What happens when a client asks for a map or mode whose declared
  co-op stance (pa-002) is solo-only, or that its build does not know about at all.

## Resolution

Protocol v2. `LobbyMsg` carries `mapId`/`modeId`; a creator-only `setWorld` ClientMsg sets them
(validated against the registries **and** their co-op stance); `matchStart` names the world the
server is actually running. The room's city seed stays the room code, so a rematch keeps its city;
a different map is a different arena because the arena derives from (mapId, citySeed) — no folding
needed.

**Client bootstrap**: the page builds its arena and its whole three.js scene at load, so the honest
place to change the ground is a reload — done *in the lobby*, where nothing is lost. A client whose
URL names a different world reloads into the announced one (`syncWorldToLobby`); a late joiner who
arrives mid-match on the wrong ground reloads too. This is the same reload pattern solo already
uses for mode switching. Ready flags reset on a world change, which is honest: it is a new
battlefield.

Verified with two browsers: creator picks Forest + The Nine, both clients land in
`?lobby=trost-aa&map=forest&mode=bossrush`, and the non-creator sees the world read-only.
