---
type: wayfinder:grilling
status: open
assignee:
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
