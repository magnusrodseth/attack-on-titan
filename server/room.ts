import { Server, type Connection, type ConnectionContext } from 'partyserver'
import { Vector3 } from 'three'
import {
  MAX_ROOM_PLAYERS,
  PROTOCOL_VERSION,
  parseClientMsg,
  type ErrorCode,
  type RoomPhase,
  type RoomPlayer,
  type ServerMsg,
} from '../src/net/protocol'
import { SIM_DT } from '../src/sim/constants'
import {
  applyPlayerUpdate,
  coopFire,
  coopPickUpgrade,
  coopResupply,
  coopSlash,
  coopSnapshot,
  coopStep,
  createCoopWorld,
  removePlayer,
  type CoopEvent,
  type CoopWorld,
} from '../src/sim/coop'
import { createDb } from './db/client'
import { writeMatch } from './db/matches'
import { validateSessionToken } from './db/sessions'
import type { Env } from './env'

const TICK_MS = 1000 / 30 // wall-clock loop; the sim itself steps at fixed SIM_DT
const SNAPSHOT_MS = 50 // 20 Hz world snapshots
const MAX_CATCHUP_S = 0.25 // clamp after event-loop stalls so the sim never spirals

interface Member {
  handle: string
  userId: string
  /** Joined a locked room mid-match: watches, and musters at the next match. */
  spectator: boolean
}

/**
 * One Durable Object per room code. Holds the Lobby roster and, during a match, ticks
 * the shared CoopWorld at 120 Hz in 30 Hz wall-clock slices. Deliberately not
 * hibernatable: a ticking match must stay in memory, and live websockets keep the DO
 * alive. An abandoned room (no connections) resets itself and is evicted naturally.
 */
export class MatchRoom extends Server<Env> {
  static options = { hibernate: false }

  private phase: RoomPhase = 'lobby'
  private members = new Map<string, Member>() // connection.id → member
  private ready = new Set<string>()
  private creator: string | null = null
  private world: CoopWorld | null = null
  private seed = ''
  private rosterIds = new Map<string, string>() // handle → userId, frozen at match start
  private interval: ReturnType<typeof setInterval> | null = null
  private lastTick = 0
  private acc = 0
  private lastSnap = 0
  private matchWritten = false
  private matchIndex = 0

  async onConnect(conn: Connection, ctx: ConnectionContext): Promise<void> {
    const token = new URL(ctx.request.url).searchParams.get('token') ?? ''
    const session = token ? await validateSessionToken(createDb(this.env.DB), token) : null
    if (!session) return this.refuse(conn, 'unauthorized', 4001, 'Sign in to muster')
    // same soldier again (wifi blip, tab reload): the new connection replaces the old one,
    // so a reconnecting combatant drops straight back into their live match
    for (const [connId, member] of this.members) {
      if (member.handle === session.username) {
        this.members.delete(connId) // before close: onClose must not treat this as leaving
        this.getConnection(connId)?.close(4000, 'Replaced by a newer connection')
        break
      }
    }
    const midMatch = this.phase !== 'lobby'
    if (!midMatch && this.members.size >= MAX_ROOM_PLAYERS) {
      return this.refuse(conn, 'room-full', 4003, 'This squad is full')
    }
    const combatant = this.world?.players.get(session.username)?.connected ?? false
    this.members.set(conn.id, {
      handle: session.username,
      userId: session.userId,
      spectator: midMatch && !combatant,
    })
    if (!this.creator) this.creator = session.username
    this.broadcastLobby()
    if (midMatch && this.world) {
      this.send(conn, { v: PROTOCOL_VERSION, type: 'matchStart', seed: this.seed, roster: [...this.world.players.keys()] })
    }
  }

  onMessage(conn: Connection, raw: string | ArrayBuffer | ArrayBufferView): void {
    const member = this.members.get(conn.id)
    if (!member) return
    const msg = parseClientMsg(typeof raw === 'string' ? raw : '')
    if (!msg) return this.sendError(conn, 'bad-message', 'Unparseable message')

    switch (msg.type) {
      case 'ready': {
        if (this.phase !== 'lobby') return
        if (msg.ready) this.ready.add(member.handle)
        else this.ready.delete(member.handle)
        this.broadcastLobby()
        return
      }
      case 'start': {
        if (this.phase !== 'lobby') return
        if (member.handle !== this.creator) return this.sendError(conn, 'not-creator', 'Only the squad leader starts')
        const allReady = [...this.members.values()].every(
          (m) => m.handle === this.creator || this.ready.has(m.handle),
        )
        if (!allReady) return
        this.startMatch()
        return
      }
      case 'input': {
        if (!this.world || this.phase !== 'match' || member.spectator) return
        applyPlayerUpdate(this.world, member.handle, {
          pos: new Vector3(msg.x, msg.y, msg.z),
          vel: new Vector3(msg.vx, msg.vy, msg.vz),
          onGround: msg.onGround,
          pose: { yaw: msg.yaw, pitch: msg.pitch, hooks: msg.hooks },
        })
        return
      }
      case 'slash': {
        if (!this.world || this.phase !== 'match' || member.spectator) return
        const look = msg.look ? new Vector3(msg.look.x, msg.look.y, msg.look.z) : null
        this.relayEvents(coopSlash(this.world, member.handle, look))
        return
      }
      case 'fire': {
        if (!this.world || this.phase !== 'match' || member.spectator) return
        this.relayEvents(coopFire(this.world, member.handle, new Vector3(msg.look.x, msg.look.y, msg.look.z)))
        return
      }
      case 'pick': {
        if (!this.world || this.phase !== 'match' || member.spectator) return
        this.relayEvents(coopPickUpgrade(this.world, member.handle, msg.upgradeId))
        return
      }
      case 'resupply': {
        if (!this.world || this.phase !== 'match' || member.spectator) return
        this.relayEvents(coopResupply(this.world, member.handle))
        return
      }
      case 'rematch': {
        if (this.phase !== 'results') return
        if (member.handle !== this.creator) return this.sendError(conn, 'not-creator', 'Only the squad leader restarts')
        this.toLobby()
        return
      }
    }
  }

  onClose(conn: Connection): void {
    const member = this.members.get(conn.id)
    if (!member) return
    this.members.delete(conn.id)
    this.ready.delete(member.handle)
    if (this.creator === member.handle) {
      this.creator = [...this.members.values()][0]?.handle ?? null
    }
    if (this.world && this.phase === 'match' && !member.spectator) {
      this.relayEvents(removePlayer(this.world, member.handle))
      if (this.world.phase === 'ended') this.finishMatch()
    }
    if (this.members.size === 0) this.reset()
    else this.broadcastLobby()
  }

  onError(conn: Connection, _error: unknown): void {
    this.onClose(conn)
  }

  private startMatch(): void {
    const roster = [...this.members.values()].map((m) => m.handle)
    this.rosterIds = new Map([...this.members.values()].map((m) => [m.handle, m.userId]))
    // the city is pinned to the room code (clients pre-build it from the URL);
    // the match seed varies per rematch so waves and offers stay fresh
    this.matchIndex += 1
    const citySeed = `coop-${this.name.toLowerCase()}`
    this.seed = `${citySeed}#${this.matchIndex}`
    this.world = createCoopWorld(this.seed, roster, citySeed)
    for (const member of this.members.values()) member.spectator = false
    this.phase = 'match'
    this.matchWritten = false
    this.broadcastMsg({ v: PROTOCOL_VERSION, type: 'matchStart', seed: this.seed, roster })
    this.broadcastLobby()
    this.lastTick = Date.now()
    this.acc = 0
    this.lastSnap = 0
    this.interval = setInterval(() => this.tick(), TICK_MS)
  }

  private tick(): void {
    if (!this.world || this.phase !== 'match') return
    const now = Date.now()
    this.acc += Math.min(MAX_CATCHUP_S, (now - this.lastTick) / 1000)
    this.lastTick = now
    const events: CoopEvent[] = []
    while (this.acc >= SIM_DT) {
      events.push(...coopStep(this.world, SIM_DT))
      this.acc -= SIM_DT
    }
    if (events.length > 0) this.relayEvents(events)
    if (now - this.lastSnap >= SNAPSHOT_MS) {
      this.lastSnap = now
      this.broadcastMsg({ v: PROTOCOL_VERSION, type: 'snapshot', snap: coopSnapshot(this.world) })
    }
    if (this.world.phase === 'ended') this.finishMatch()
  }

  private finishMatch(): void {
    if (this.phase === 'results') return // wipe can reach here twice in one tick
    if (this.interval !== null) {
      clearInterval(this.interval)
      this.interval = null
    }
    this.phase = 'results'
    const results = this.world?.results ?? null
    this.broadcastLobby()
    if (results && results.players.length > 0) {
      this.broadcastMsg({ v: PROTOCOL_VERSION, type: 'results', results })
      if (!this.matchWritten) {
        this.matchWritten = true
        const write = writeMatch(createDb(this.env.DB), this.name, this.seed, results, this.rosterIds)
        this.ctx.waitUntil(
          write.catch((err) => console.error('match write failed', err instanceof Error ? err.message : err)),
        )
      }
    }
  }

  private toLobby(): void {
    this.phase = 'lobby'
    this.world = null
    this.ready.clear()
    for (const member of this.members.values()) member.spectator = false
    this.broadcastLobby()
  }

  private reset(): void {
    if (this.interval !== null) {
      clearInterval(this.interval)
      this.interval = null
    }
    this.phase = 'lobby'
    this.world = null
    this.seed = ''
    this.ready.clear()
    this.creator = null
    this.members.clear()
    this.rosterIds.clear()
  }

  private relayEvents(events: CoopEvent[]): void {
    if (events.length === 0) return
    this.broadcastMsg({ v: PROTOCOL_VERSION, type: 'events', events })
    if (this.world?.phase === 'ended') this.finishMatch()
  }

  private broadcastLobby(): void {
    const players: RoomPlayer[] = [...this.members.values()].map((m) => ({
      id: m.handle,
      ready: m.handle === this.creator || this.ready.has(m.handle),
      inMatch: this.world ? (this.world.players.get(m.handle)?.connected ?? false) : !m.spectator,
      connected: true,
    }))
    for (const [connId, member] of this.members) {
      const conn = this.getConnection(connId)
      if (!conn) continue
      this.send(conn, {
        v: PROTOCOL_VERSION,
        type: 'lobby',
        code: this.name,
        you: member.handle,
        creator: this.creator ?? '',
        phase: this.phase,
        players,
        maxPlayers: MAX_ROOM_PLAYERS,
      })
    }
  }

  private broadcastMsg(msg: ServerMsg): void {
    this.broadcast(JSON.stringify(msg))
  }

  private send(conn: Connection, msg: ServerMsg): void {
    conn.send(JSON.stringify(msg))
  }

  private sendError(conn: Connection, code: ErrorCode, message: string): void {
    this.send(conn, { v: PROTOCOL_VERSION, type: 'error', code, message })
  }

  private refuse(conn: Connection, code: ErrorCode, wsCode: number, message: string): void {
    this.sendError(conn, code, message)
    conn.close(wsCode, message)
  }
}
