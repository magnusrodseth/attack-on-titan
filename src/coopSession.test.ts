import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClientMsg, ServerMsg } from './net/protocol'
import { PROTOCOL_VERSION } from './net/protocol'

/**
 * The seam under test is the one that threw soldiers out of lobbies: what a CoopSession does
 * when its socket closes. The transport is faked so a close can be delivered on demand.
 */
interface FakeSocket {
  onMessage(msg: ServerMsg): void
  onClose(): void
  sent: ClientMsg[]
  closed: boolean
}

const sockets: FakeSocket[] = []

vi.mock('./net/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./net/client')>()
  return {
    ...actual,
    connectRoom: (
      _code: string,
      _token: string,
      onMessage: (msg: ServerMsg) => void,
      onClose: () => void,
    ) => {
      const fake: FakeSocket = { onMessage, onClose, sent: [], closed: false }
      sockets.push(fake)
      return {
        send: (msg: ClientMsg) => fake.sent.push(msg),
        close: () => {
          fake.closed = true
        },
      }
    },
  }
})

const { CoopSession } = await import('./coopSession')

const lobbyMsg = (): ServerMsg => ({
  v: PROTOCOL_VERSION,
  type: 'lobby',
  code: 'TROST-7K',
  you: 'eren',
  creator: 'eren',
  phase: 'lobby',
  players: [{ id: 'eren', ready: true, inMatch: false, connected: true }],
  maxPlayers: 4,
  mapId: 'forest',
  modeId: 'waves',
})

function open() {
  const hooks = {
    onLobby: vi.fn(),
    onMatchStart: vi.fn(),
    onEvents: vi.fn(),
    onResults: vi.fn(),
    onLinkLost: vi.fn(),
    onLinkBack: vi.fn(),
    onFatal: vi.fn(),
  }
  const session = new CoopSession('TROST-7K', { token: 't', username: 'eren' }, hooks)
  const socket = sockets.at(-1)!
  return { session, socket, hooks }
}

beforeEach(() => {
  sockets.length = 0
})

describe('CoopSession link handling', () => {
  it('a dropped socket is a blip, not an ejection: the soldier stays in the room', () => {
    const { socket, hooks } = open()
    socket.onClose()
    // the bug: this used to fatal, and onFatal navigates to the menu — so a teammate whose
    // socket dropped for a heartbeat (a reload in flight, a wifi hiccup) was thrown out
    expect(hooks.onFatal).not.toHaveBeenCalled()
    expect(hooks.onLinkLost).toHaveBeenCalledTimes(1)
  })

  it('reports the link back when the room answers again', () => {
    const { socket, hooks } = open()
    socket.onClose()
    socket.onMessage(lobbyMsg())
    expect(hooks.onLinkBack).toHaveBeenCalledTimes(1)
    expect(hooks.onLobby).toHaveBeenCalledTimes(1)
    expect(hooks.onFatal).not.toHaveBeenCalled()
  })

  it('announces a lost link once, however many closes arrive', () => {
    const { socket, hooks } = open()
    socket.onClose()
    socket.onClose()
    socket.onClose()
    expect(hooks.onLinkLost).toHaveBeenCalledTimes(1)
  })

  it.each(['unauthorized', 'room-full', 'outdated'] as const)(
    'a room that refuses us outright (%s) IS fatal',
    (code) => {
      const { socket, hooks } = open()
      socket.onMessage({ v: PROTOCOL_VERSION, type: 'error', code, message: 'no' })
      expect(hooks.onFatal).toHaveBeenCalledWith('no')
    },
  )

  it('a refusal closes the socket, so partysocket does not retry into the same wall', () => {
    const { socket, hooks } = open()
    socket.onMessage({ v: PROTOCOL_VERSION, type: 'error', code: 'outdated', message: 'stale' })
    expect(socket.closed).toBe(true)
    // and the close that follows our own close must not re-enter the link-lost path
    socket.onClose()
    expect(hooks.onLinkLost).not.toHaveBeenCalled()
    expect(hooks.onFatal).toHaveBeenCalledTimes(1)
  })

  it('leaving on purpose is silent: no ejection notice for a soldier who left', () => {
    const { session, socket, hooks } = open()
    session.leave()
    socket.onClose()
    expect(hooks.onLinkLost).not.toHaveBeenCalled()
    expect(hooks.onFatal).not.toHaveBeenCalled()
  })
})
