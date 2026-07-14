import type { CoopEvent, CoopSnapshot, HookAnchor, MatchResults } from '../sim/coop'

/**
 * Wire protocol between the game client and the MatchRoom Worker. JSON, versioned.
 * Shared by src/ (client) and server/ (Cloudflare Worker) — keep it dependency-free
 * beyond sim types. Joining a room IS the websocket connection (partysocket routes by
 * room name; the session token rides in the query string), so there is no join message.
 */

/**
 * Bumped to 2 for the unified world (ADR 0003): the lobby now carries the map and the mode,
 * matchStart names the world it starts, and a mash intent exists because the grab QTE does.
 */
export const PROTOCOL_VERSION = 2

export type RoomPhase = 'lobby' | 'match' | 'results'

/** Roster entry as the lobby/results screens see it. */
export interface RoomPlayer {
  id: string // account handle; unique per room by construction
  ready: boolean
  /** False for soldiers who joined a locked room: they spectate until the next match. */
  inMatch: boolean
  connected: boolean
}

// ---------------------------------------------------------------------------
// client → server
// ---------------------------------------------------------------------------

export interface InputMsg {
  v: typeof PROTOCOL_VERSION
  type: 'input'
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  onGround: boolean
  yaw: number
  pitch: number
  hooks: [HookAnchor | null, HookAnchor | null]
}

export type ClientMsg =
  | InputMsg
  | { v: typeof PROTOCOL_VERSION; type: 'ready'; ready: boolean }
  | { v: typeof PROTOCOL_VERSION; type: 'start' } // creator only
  // look feeds the nape aim cone; optional so pre-cone clients keep working (gate stays open)
  | { v: typeof PROTOCOL_VERSION; type: 'slash'; look?: { x: number; y: number; z: number } }
  | { v: typeof PROTOCOL_VERSION; type: 'fire'; look: { x: number; y: number; z: number } }
  | { v: typeof PROTOCOL_VERSION; type: 'pick'; upgradeId: string }
  | { v: typeof PROTOCOL_VERSION; type: 'resupply' }
  // one press of the escape bar while a titan's fist has you (the grab QTE, coop-adapted)
  | { v: typeof PROTOCOL_VERSION; type: 'mash' }
  // creator only, in the lobby: which arena and which mode this room fights
  | { v: typeof PROTOCOL_VERSION; type: 'setWorld'; mapId: string; modeId: string }
  | { v: typeof PROTOCOL_VERSION; type: 'rematch' } // creator only, from results

// ---------------------------------------------------------------------------
// server → client
// ---------------------------------------------------------------------------

export interface LobbyMsg {
  v: typeof PROTOCOL_VERSION
  type: 'lobby'
  code: string
  you: string
  creator: string
  phase: RoomPhase
  players: RoomPlayer[]
  maxPlayers: number
  /** The world this room will fight in; the creator picks it, everyone builds it. */
  mapId: string
  modeId: string
}

export type ServerMsg =
  | LobbyMsg
  | {
      v: typeof PROTOCOL_VERSION
      type: 'matchStart'
      seed: string
      roster: string[]
      /** The world the server is actually running: never inferred, always named. */
      mapId: string
      modeId: string
    }
  | { v: typeof PROTOCOL_VERSION; type: 'snapshot'; snap: CoopSnapshot }
  | { v: typeof PROTOCOL_VERSION; type: 'events'; events: CoopEvent[] }
  | { v: typeof PROTOCOL_VERSION; type: 'results'; results: MatchResults }
  | { v: typeof PROTOCOL_VERSION; type: 'error'; code: ErrorCode; message: string }

export type ErrorCode =
  | 'unauthorized' // missing/expired session token
  | 'room-full' // 4 soldiers already mustered
  | 'not-creator' // start/rematch from someone else
  | 'bad-message' // unparseable or wrong version
  // the client's content registries differ from the server's (see sim/content.ts): it would
  // be fighting a world nobody else is in, so it is turned away and told to reload
  | 'outdated'

// ---------------------------------------------------------------------------
// HTTP API shapes (register/login/leaderboard)
// ---------------------------------------------------------------------------

export interface LeaderboardTeam {
  wavesCleared: number
  durationS: number
  endedAt: string
  players: { username: string; score: number; mvp: boolean }[]
}

export interface LeaderboardSoldier {
  username: string
  score: number
  kills: number
  wavesCleared: number
  endedAt: string
}

export interface Leaderboard {
  teams: LeaderboardTeam[]
  soldiers: LeaderboardSoldier[]
}

// --- time trials (tt-008) ----------------------------------------------------

export interface TrialRaceEntry {
  username: string
  timeS: number
  endedAt: string
}

export interface TrialHuntEntry {
  username: string
  level: number
  score: number
  endedAt: string
}

/** Boards for one course (a map-scoped seed): Signal Run by time, The Culling by depth (score tiebreak). */
export interface TrialBoards {
  race: TrialRaceEntry[]
  hunt: TrialHuntEntry[]
}

export const MAX_ROOM_PLAYERS = 4

/** Room codes read like Wall districts: TROST-7K. Generated client-side on Create Lobby. */
const ROOM_WORDS = ['TROST', 'MARIA', 'ROSE', 'SINA', 'UTGARD', 'KARANES', 'STOHESS', 'EHRMICH']
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no 0/O/1/I/L look-alikes

export function generateRoomCode(rand: () => number = Math.random): string {
  const word = ROOM_WORDS[Math.floor(rand() * ROOM_WORDS.length)]!
  const suffix =
    CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)]! + CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)]!
  return `${word}-${suffix}`
}

export function normalizeRoomCode(raw: string): string | null {
  const code = raw.trim().toUpperCase()
  return /^[A-Z]{3,10}-[A-Z2-9]{2}$/.test(code) ? code : null
}

export function parseClientMsg(raw: unknown): ClientMsg | null {
  if (typeof raw !== 'string') return null
  try {
    const msg = JSON.parse(raw) as ClientMsg
    if (typeof msg !== 'object' || msg === null || msg.v !== PROTOCOL_VERSION) return null
    return typeof msg.type === 'string' ? msg : null
  } catch {
    return null
  }
}

export function parseServerMsg(raw: unknown): ServerMsg | null {
  if (typeof raw !== 'string') return null
  try {
    const msg = JSON.parse(raw) as ServerMsg
    if (typeof msg !== 'object' || msg === null || msg.v !== PROTOCOL_VERSION) return null
    return typeof msg.type === 'string' ? msg : null
  } catch {
    return null
  }
}
