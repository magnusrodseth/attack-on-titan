import type { Account, RoomSocket } from './net/client'
import { clientMsg, connectRoom } from './net/client'
import type { LobbyMsg, RoomPhase } from './net/protocol'
import type { CoopEvent, MatchResults } from './sim/coop'
import type { RemoteSoldier } from './sim/coopClient'
import {
  applySelfSnapshot,
  createSnapshotBuffer,
  pushSnapshot,
  syncSoldierMirror,
  syncTitanMirror,
} from './sim/coopClient'
import type { GameState } from './sim/game'

export interface CoopHooks {
  onLobby(lobby: LobbyMsg): void
  onMatchStart(roster: string[]): void
  onEvents(events: CoopEvent[]): void
  onResults(results: MatchResults): void
  /** Unrecoverable for this room (bad session, full squad, connection lost). */
  onFatal(message: string): void
}

/**
 * One joined room: owns the socket, the snapshot buffer and the teammate mirrors.
 * main.ts drives it from the render loop; all UI flows through the hooks.
 */
export class CoopSession {
  readonly code: string
  readonly me: string
  phase: RoomPhase = 'lobby'
  lobby: LobbyMsg | null = null
  results: MatchResults | null = null
  /** True when I am a combatant in the running match (not a late spectator). */
  playing = false
  roster: string[] = []
  readonly buf = createSnapshotBuffer()
  readonly soldiers = new Map<string, RemoteSoldier>()

  private socket: RoomSocket | null = null
  private fatalSent = false
  private leftOnPurpose = false

  constructor(code: string, account: Account, private hooks: CoopHooks) {
    this.code = code
    this.me = account.username
    this.socket = connectRoom(
      code,
      account.token,
      (msg) => this.onMessage(msg),
      () => this.onSocketClose(),
    )
  }

  private onMessage(msg: Parameters<Parameters<typeof connectRoom>[2]>[0]): void {
    switch (msg.type) {
      case 'lobby': {
        this.lobby = msg
        this.phase = msg.phase
        this.hooks.onLobby(msg)
        return
      }
      case 'matchStart': {
        this.phase = 'match'
        this.roster = msg.roster
        this.playing = msg.roster.includes(this.me)
        this.results = null
        this.soldiers.clear()
        this.buf.a = this.buf.b = null
        this.hooks.onMatchStart(msg.roster)
        return
      }
      case 'snapshot': {
        pushSnapshot(this.buf, msg.snap, performance.now())
        return
      }
      case 'events': {
        this.hooks.onEvents(msg.events)
        return
      }
      case 'results': {
        this.phase = 'results'
        this.results = msg.results
        this.hooks.onResults(msg.results)
        return
      }
      case 'error': {
        if (msg.code === 'unauthorized' || msg.code === 'room-full') this.fatal(msg.message)
        return
      }
    }
  }

  private onSocketClose(): void {
    if (!this.leftOnPurpose) this.fatal('Connection to the squad lost')
  }

  private fatal(message: string): void {
    if (this.fatalSent) return
    this.fatalSent = true
    this.leave()
    this.hooks.onFatal(message)
  }

  get isCreator(): boolean {
    return this.lobby?.creator === this.me
  }

  get everyoneReady(): boolean {
    return this.lobby?.players.every((p) => p.ready) ?? false
  }

  /** Per-frame mirror sync while a match runs; feeds the untouched renderer. */
  syncFrame(g: GameState, now: number, frameDt: number): void {
    if (this.phase !== 'match') return
    syncTitanMirror(g, this.buf, now, frameDt)
    syncSoldierMirror(this.soldiers, this.buf, this.me, now)
    if (this.playing) applySelfSnapshot(g, this.buf, this.me)
  }

  /** Somebody to watch while dead or spectating. */
  livingTeammate(): RemoteSoldier | null {
    for (const soldier of this.soldiers.values()) {
      if (soldier.alive && soldier.connected) return soldier
    }
    return null
  }

  myPickTimer(): number {
    return this.buf.b?.pickTimer ?? 0
  }

  amDeadInSnapshot(): boolean {
    const me = this.buf.b?.players.find((p) => p.id === this.me)
    return me ? !me.alive : false
  }

  sendInput(g: GameState, yaw: number, pitch: number): void {
    const p = g.player
    this.socket?.send(
      clientMsg({
        type: 'input',
        x: r2(p.pos.x),
        y: r2(p.pos.y),
        z: r2(p.pos.z),
        vx: r2(p.vel.x),
        vy: r2(p.vel.y),
        vz: r2(p.vel.z),
        onGround: p.onGround,
        yaw: r2(yaw),
        pitch: r2(pitch),
        hooks: [hookAnchor(p, 0), hookAnchor(p, 1)],
      }),
    )
  }

  sendReady(ready: boolean): void {
    this.socket?.send(clientMsg({ type: 'ready', ready }))
  }

  sendStart(): void {
    this.socket?.send(clientMsg({ type: 'start' }))
  }

  sendSlash(): void {
    this.socket?.send(clientMsg({ type: 'slash' }))
  }

  sendPick(upgradeId: string): void {
    this.socket?.send(clientMsg({ type: 'pick', upgradeId }))
  }

  sendResupply(): void {
    this.socket?.send(clientMsg({ type: 'resupply' }))
  }

  sendRematch(): void {
    this.socket?.send(clientMsg({ type: 'rematch' }))
  }

  leave(): void {
    this.leftOnPurpose = true
    this.socket?.close()
    this.socket = null
  }
}

const r2 = (v: number): number => Math.round(v * 100) / 100

function hookAnchor(p: GameState['player'], index: 0 | 1): { x: number; y: number; z: number } | null {
  const hook = p.hooks[index]
  if (!hook || hook.state !== 'attached') return null
  return { x: r2(hook.anchor.x), y: r2(hook.anchor.y), z: r2(hook.anchor.z) }
}
