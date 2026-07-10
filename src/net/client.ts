import { PartySocket } from 'partysocket'
import type { ClientMsg, Leaderboard, ServerMsg, TrialBoards } from './protocol'
import { PROTOCOL_VERSION, parseServerMsg } from './protocol'

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
    query: { token },
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
