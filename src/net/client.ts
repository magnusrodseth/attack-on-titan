import { PartySocket } from 'partysocket'
import type {
  ClientMsg,
  DailyBoard,
  DailyOrdersResponse,
  DailyPostedRun,
  Leaderboard,
  ServerMsg,
  StandingsEntry,
  TrialBoards,
} from './protocol'
import { PROTOCOL_VERSION, parseServerMsg } from './protocol'
import { CONTENT_HASH } from '../sim/content'

/**
 * Thin transport layer: account storage, the HTTP API, and the room websocket.
 * The Worker host comes from VITE_PARTY_HOST (workers.dev in prod, localhost in dev).
 */

export const PARTY_HOST: string = (import.meta.env?.VITE_PARTY_HOST as string | undefined) ?? 'localhost:8787'

const isLocal = PARTY_HOST.startsWith('localhost') || PARTY_HOST.startsWith('127.')
export const API_BASE = `${isLocal ? 'http' : 'https'}://${PARTY_HOST}`

// --- account ---------------------------------------------------------------

export interface Account {
  token: string
  username: string
}

const ACCOUNT_KEY = 'aot-account'

export function loadAccount(): Account | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Account>
    return parsed.token && parsed.username ? { token: parsed.token, username: parsed.username } : null
  } catch {
    return null
  }
}

export function saveAccount(account: Account): void {
  try {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account))
  } catch {
    // private mode: the session just won't survive a reload
  }
}

export function clearAccount(): void {
  try {
    localStorage.removeItem(ACCOUNT_KEY)
  } catch {
    // nothing to clear
  }
}

// --- HTTP API ----------------------------------------------------------------

export type AuthResult = { ok: true; account: Account } | { ok: false; error: string }

async function authRequest(path: '/api/register' | '/api/login', username: string, password: string): Promise<AuthResult> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const body = (await res.json()) as { token?: string; username?: string; error?: string }
    if (res.ok && body.token && body.username) {
      const account = { token: body.token, username: body.username }
      saveAccount(account)
      return { ok: true, account }
    }
    return { ok: false, error: body.error ?? `Request failed (${res.status})` }
  } catch {
    return { ok: false, error: 'Cannot reach headquarters. Is the server up?' }
  }
}

export const register = (username: string, password: string): Promise<AuthResult> =>
  authRequest('/api/register', username, password)

export const login = (username: string, password: string): Promise<AuthResult> =>
  authRequest('/api/login', username, password)

export async function fetchLeaderboard(): Promise<Leaderboard | null> {
  try {
    const res = await fetch(`${API_BASE}/api/leaderboard`)
    if (!res.ok) return null
    return (await res.json()) as Leaderboard
  } catch {
    return null
  }
}

// --- time trials (tt-008) ------------------------------------------------------

export type TrialPostBody =
  | { mode: 'race'; seed: string; timeS: number; splits: number[] }
  | { mode: 'hunt'; seed: string; level: number; score: number }

/** Fire-and-forget: a lost post costs one board entry, never interrupts play. */
export async function postTrial(token: string, body: TrialPostBody): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/trial`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function fetchTrials(seed: string): Promise<TrialBoards | null> {
  try {
    const res = await fetch(`${API_BASE}/api/trials?seed=${encodeURIComponent(seed)}`)
    if (!res.ok) return null
    return (await res.json()) as TrialBoards
  } catch {
    return null
  }
}

// --- the Daily Expedition (de-008) ---------------------------------------------
//
// Claim is the moment the day is spent (de-001): the client asks, the Worker writes the row and
// hands back the sealed orders, and only then can the client build today's course. Every branch
// the UI has to tell apart is modelled here so main.ts reads a tag, not an HTTP status.

export type DailyClaim =
  /** the orders are yours; `ranked` is false when signed out or the claim wrote no row. */
  | { status: 'ok'; orders: DailyOrdersResponse }
  /** already spent today (409). `run` is what you posted, or null if you abandoned it. */
  | { status: 'spent'; date: string; run: DailyPostedRun | null }
  /** no orders to be had — the seed is sealed and Headquarters did not answer (503 / network). */
  | { status: 'unreachable' }

interface ClaimBody extends DailyOrdersResponse {
  spent?: boolean
  run?: DailyPostedRun | null
}

/**
 * Take today's field. A token claims for real (ranked); no token still returns the orders so a
 * signed-out visitor can play (de-003 amendment), just unranked. The seal means the client cannot
 * even render the arena without this call, so a failure to reach it is a genuine "no daily today",
 * not merely "unranked" — hence the explicit `unreachable`.
 */
export async function claimDaily(token: string | null): Promise<DailyClaim> {
  try {
    const res = await fetch(`${API_BASE}/api/daily/claim`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (res.status === 503) return { status: 'unreachable' }
    const body = (await res.json()) as ClaimBody
    if (res.status === 409) return { status: 'spent', date: body.date, run: body.run ?? null }
    if (!res.ok || !body.seed) return { status: 'unreachable' }
    return {
      status: 'ok',
      orders: {
        date: body.date,
        modeId: body.modeId,
        mapId: body.mapId,
        metric: body.metric,
        seed: body.seed,
        ranked: body.ranked,
      },
    }
  } catch {
    return { status: 'unreachable' }
  }
}

export type DailySubmitBody = {
  date: string
  timeS?: number
  level?: number
  score?: number
  wave?: number
  splits?: number[]
}

/** Post a daily result. Fire-and-forget like the trial post: a lost submit costs a board row. */
export async function submitDaily(token: string, body: DailySubmitBody): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/daily/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    return res.ok
  } catch {
    return false
  }
}

/** Today's board (or a past day's), fetched by date — the seed stays sealed while it is live. */
export async function fetchDailyBoard(date?: string): Promise<DailyBoard | null> {
  try {
    const q = date ? `?date=${encodeURIComponent(date)}` : ''
    const res = await fetch(`${API_BASE}/api/daily/board${q}`)
    if (!res.ok) return null
    return (await res.json()) as DailyBoard
  } catch {
    return null
  }
}

export async function fetchStandings(): Promise<StandingsEntry[] | null> {
  try {
    const res = await fetch(`${API_BASE}/api/daily/standings`)
    if (!res.ok) return null
    return (await res.json()) as StandingsEntry[]
  } catch {
    return null
  }
}

// --- room websocket -----------------------------------------------------------

export interface RoomSocket {
  send(msg: ClientMsg): void
  close(): void
}

export function connectRoom(
  code: string,
  token: string,
  onMessage: (msg: ServerMsg) => void,
  onClose: () => void,
): RoomSocket {
  const socket = new PartySocket({
    host: PARTY_HOST,
    party: 'match-room', // kebab-cased Durable Object binding name (MatchRoom)
    room: code.toLowerCase(),
    // the content hash rides the handshake: the client and the Worker deploy separately, so
    // "same protocol" is not the same as "same game". A mismatch is refused, not fudged.
    query: { token, content: CONTENT_HASH },
  })
  socket.addEventListener('message', (event) => {
    const msg = parseServerMsg(event.data as unknown)
    if (!msg) return
    // lightweight tap for automated verification: counts per message type
    const stats = ((window as unknown as Record<string, unknown>).__aotNet ??= {}) as Record<string, number>
    stats[msg.type] = (stats[msg.type] ?? 0) + 1
    if (msg.type === 'events') {
      for (const e of msg.events) stats[`ev:${e.type}`] = (stats[`ev:${e.type}`] ?? 0) + 1
    }
    onMessage(msg)
  })
  socket.addEventListener('close', onClose)
  let closedByUs = false
  return {
    send(msg: ClientMsg) {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg))
    },
    close() {
      if (closedByUs) return
      closedByUs = true
      socket.close()
    },
  }
}

export function clientMsg<T extends Omit<ClientMsg, 'v'>>(body: T): T & { v: typeof PROTOCOL_VERSION } {
  return { v: PROTOCOL_VERSION, ...body }
}
