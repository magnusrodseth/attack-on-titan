import { Vector3 } from 'three'
import { DEFAULT_BLAST_RADIUS } from './constants'
import type { BossState } from './boss'
import { BOSS_LADDER } from './boss'
import { nearestStationDist } from './city'
import { grabHoldPoint } from './grab'
import type { CoopSnapshot, HookAnchor } from './coop'
import type { GameState } from './game'
import { copyInput, handleHookEdge, stepLamp, syncTitanHooks } from './game'
import type { InputState } from './player'
import { BOOST_COST, stepPlayer, tryBoost } from './player'
import type { SpearState } from './spear'
import { FIRE_COOLDOWN } from './spear'
import type { TitanState } from './titan'
import { createTitan } from './titan'
import { checkSupplyWarnings } from './world'

/**
 * The co-op client's half of the netcode: the local soldier still runs the full 120 Hz
 * movement sim (client-authoritative feel), while titans and teammates are mirrors of
 * server snapshots, interpolated a fixed delay behind the newest one. Slashes and
 * resupplies become intent events the session layer forwards to the room.
 */

export const INTERP_DELAY_MS = 120
const RESUPPLY_PROMPT_RADIUS = 10 // same prompt distance as solo; server allows slack

export function stepCoopClient(g: GameState, input: InputState, dt: number): void {
  g.events = []
  g.time += dt
  g.focusActive = false // a shared world cannot slow down for one soldier
  stepLamp(g, dt) // the flashlight is personal: drained locally, refilled by the server's resupply ack
  const p = g.player

  // a fist has me: my client owns no movement at all until it lets go. Every press is a
  // mash intent the server spends on the escape bar (the grab is `adapted` for co-op —
  // you mash your own way out, nobody can cut you free).
  if (g.grab) {
    if (input.jump && !g.prevInput.jump) g.events.push({ type: 'coopMash' })
    copyInput(g.prevInput, input)
    return
  }

  const canistersBefore = p.canisters
  if (input.gas && !g.prevInput.gas) {
    if (tryBoost(p, input.lookDir)) {
      g.events.push({ type: 'boost' })
    } else if (!p.onGround && p.boostCooldown <= 0 && p.gas < BOOST_COST && p.canisters <= 0) {
      g.events.push({ type: 'empty', kind: 'gas' })
    }
  }

  handleHookEdge(g, 0, input.hookL, g.prevInput.hookL, input)
  handleHookEdge(g, 1, input.hookR, g.prevInput.hookR, input)

  if (input.slash && !g.prevInput.slash) {
    if (p.blades <= 0) {
      g.events.push({ type: 'empty', kind: 'blades' }) // jam locally, no round trip
    } else if (p.slashTimer <= 0) {
      p.slashTimer = p.config.slashCooldown // local cooldown; the server enforces its own
      g.events.push({ type: 'coopSlash' })
    }
  }

  if (input.fire && !g.prevInput.fire) {
    if (p.spears <= 0) {
      g.events.push({ type: 'empty', kind: 'spears' }) // dry rack clicks locally
    } else if (p.fireTimer <= 0) {
      p.fireTimer = FIRE_COOLDOWN // local prediction; the server owns the launch
      g.events.push({ type: 'coopFire' })
    }
  }

  if (input.resupply && !g.prevInput.resupply) {
    // a Field Kit is a resupply with no station in it, so gating the intent on station range
    // would make the pick work in solo and do nothing in co-op — the client would refuse to
    // even ask. Ask whenever a station OR a kit could answer; worldResupply still decides.
    const atStation = nearestStationDist(g.arena, p.pos.x, p.pos.z) <= RESUPPLY_PROMPT_RADIUS
    if (atStation || p.kits > 0) {
      g.events.push({ type: 'coopResupply' })
    }
  }

  syncTitanHooks(g)
  stepPlayer(p, input, dt, g.arena)
  if (p.canisters < canistersBefore) {
    g.events.push({ type: 'canisterSwap', remaining: p.canisters })
  }
  // the same warnings a lone soldier gets: gas is client-owned and never reaches the room,
  // and blades mirror down from the snapshot, so both are read right here
  checkSupplyWarnings(g, g.soldiers[0]!)
  copyInput(g.prevInput, input)
}

// ---------------------------------------------------------------------------
// snapshot interpolation
// ---------------------------------------------------------------------------

export interface SnapshotBuffer {
  a: CoopSnapshot | null
  b: CoopSnapshot | null
  ta: number
  tb: number
}

export function createSnapshotBuffer(): SnapshotBuffer {
  return { a: null, b: null, ta: 0, tb: 0 }
}

export function pushSnapshot(buf: SnapshotBuffer, snap: CoopSnapshot, now: number): void {
  if (snap.tick <= (buf.b?.tick ?? -1)) return // drop out-of-order arrivals
  buf.a = buf.b
  buf.ta = buf.tb
  buf.b = snap
  buf.tb = now
}

function interpAlpha(buf: SnapshotBuffer, now: number): number {
  if (!buf.a || buf.tb <= buf.ta) return 1
  return Math.min(1, Math.max(0, (now - INTERP_DELAY_MS - buf.ta) / (buf.tb - buf.ta)))
}

function lerpAngle(a: number, b: number, t: number): number {
  let delta = b - a
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  return a + delta * t
}

/**
 * Writes interpolated titan poses into g.titans as real TitanState objects, so the
 * existing renderer, minimap, hook raycasts and nape/ankle anchors work untouched.
 * stateTime is maintained locally to drive death/cripple animations.
 */
export function syncTitanMirror(g: GameState, buf: SnapshotBuffer, now: number, frameDt: number): void {
  const b = buf.b
  if (!b) return
  const alpha = interpAlpha(buf, now)
  const prevById = new Map(buf.a?.titans.map((t) => [t.id, t]) ?? [])
  const liveById = new Map(g.titans.map((t) => [t.id, t]))
  const next: TitanState[] = []
  for (const snap of b.titans) {
    let titan = liveById.get(snap.id)
    if (!titan) {
      titan = createTitan({ id: snap.id, kind: snap.kind, height: snap.height, x: snap.x, z: snap.z })
      titan.maxHp = snap.maxHp
    }
    const prev = prevById.get(snap.id)
    if (prev) {
      titan.pos.set(
        prev.x + (snap.x - prev.x) * alpha,
        prev.y + (snap.y - prev.y) * alpha,
        prev.z + (snap.z - prev.z) * alpha,
      )
      titan.facing = lerpAngle(prev.facing, snap.facing, alpha)
    } else {
      titan.pos.set(snap.x, snap.y, snap.z)
      titan.facing = snap.facing
    }
    titan.hp = snap.hp
    titan.ankles = [snap.ankles[0], snap.ankles[1]]
    if (titan.state !== snap.state) {
      titan.state = snap.state
      titan.stateTime = 0
    } else {
      titan.stateTime += frameDt
    }
    next.push(titan)
  }
  g.titans = next
}

export interface RemoteSoldier {
  id: string
  pos: Vector3
  vel: Vector3
  yaw: number
  pitch: number
  hooks: [HookAnchor | null, HookAnchor | null]
  onGround: boolean
  alive: boolean
  connected: boolean
  hp: number
  maxHp: number
  score: number
  kills: number
}

/** Interpolates every teammate (everyone but `me`) into the soldiers map. */
export function syncSoldierMirror(
  soldiers: Map<string, RemoteSoldier>,
  buf: SnapshotBuffer,
  me: string,
  now: number,
): void {
  const b = buf.b
  if (!b) return
  const alpha = interpAlpha(buf, now)
  const prevById = new Map(buf.a?.players.map((p) => [p.id, p]) ?? [])
  const seen = new Set<string>()
  for (const snap of b.players) {
    if (snap.id === me) continue
    seen.add(snap.id)
    let soldier = soldiers.get(snap.id)
    if (!soldier) {
      soldier = {
        id: snap.id,
        pos: new Vector3(snap.x, snap.y, snap.z),
        vel: new Vector3(),
        yaw: snap.yaw,
        pitch: snap.pitch,
        hooks: [null, null],
        onGround: snap.onGround,
        alive: snap.alive,
        connected: snap.connected,
        hp: snap.hp,
        maxHp: snap.maxHp,
        score: snap.score,
        kills: snap.kills,
      }
      soldiers.set(snap.id, soldier)
    }
    const prev = prevById.get(snap.id)
    if (prev) {
      soldier.pos.set(
        prev.x + (snap.x - prev.x) * alpha,
        prev.y + (snap.y - prev.y) * alpha,
        prev.z + (snap.z - prev.z) * alpha,
      )
      soldier.yaw = lerpAngle(prev.yaw, snap.yaw, alpha)
      soldier.pitch = prev.pitch + (snap.pitch - prev.pitch) * alpha
    } else {
      soldier.pos.set(snap.x, snap.y, snap.z)
      soldier.yaw = snap.yaw
      soldier.pitch = snap.pitch
    }
    soldier.vel.set(snap.vx, snap.vy, snap.vz)
    soldier.hooks = snap.hooks
    soldier.onGround = snap.onGround
    soldier.alive = snap.alive
    soldier.connected = snap.connected
    soldier.hp = snap.hp
    soldier.maxHp = snap.maxHp
    soldier.score = snap.score
    soldier.kills = snap.kills
  }
  for (const id of soldiers.keys()) {
    if (!seen.has(id)) soldiers.delete(id)
  }
}

/**
 * Writes interpolated spears and the wave's caches into g.spears/g.pickups as real sim
 * shapes, so SpearsView, the minimap diamonds, the HUD gauge, and the fuse beeps all
 * work untouched. The server owns flight and fuses; this is display only.
 */
export function syncSpearMirror(g: GameState, buf: SnapshotBuffer, now: number): void {
  const b = buf.b
  if (!b) return
  const alpha = interpAlpha(buf, now)
  const prevById = new Map(buf.a?.spears.map((s) => [s.id, s]) ?? [])
  const liveById = new Map(g.spears.map((s) => [s.id, s]))
  const next: SpearState[] = []
  for (const snap of b.spears) {
    let spear = liveById.get(snap.id)
    if (!spear) {
      spear = {
        id: snap.id,
        phase: snap.phase,
        pos: new Vector3(snap.x, snap.y, snap.z),
        vel: new Vector3(),
        traveled: 0,
        titanId: snap.titanId,
        local: new Vector3(),
        fuse: snap.fuse,
        // this mirror never detonates — the server does, and its blast arrives as a
        // spearDetonated event carrying the firer's real radius. The default here is inert,
        // and it is the wire's business only if a client ever has to draw a fuse's kill circle.
        blastRadius: DEFAULT_BLAST_RADIUS,
      }
    }
    const prev = prevById.get(snap.id)
    if (prev) {
      spear.pos.set(
        prev.x + (snap.x - prev.x) * alpha,
        prev.y + (snap.y - prev.y) * alpha,
        prev.z + (snap.z - prev.z) * alpha,
      )
    } else {
      spear.pos.set(snap.x, snap.y, snap.z)
    }
    spear.phase = snap.phase
    spear.fuse = snap.fuse
    spear.titanId = snap.titanId
    next.push(spear)
  }
  g.spears = next
  // keep the pickups array referentially stable while the wave's caches are unchanged:
  // SpearsView keys its rack rebuild on array identity, so a fresh array per frame
  // would recreate every rack mesh every frame (and leak the old GPU buffers)
  const sameWave =
    g.pickups.length === b.pickups.length && g.pickups.every((pk, i) => pk.id === b.pickups[i]!.id)
  if (sameWave) {
    for (const [i, pk] of b.pickups.entries()) {
      const live = g.pickups[i]!
      live.x = pk.x
      live.z = pk.z
      live.taken = pk.taken
    }
  } else {
    g.pickups = b.pickups.map((pk) => ({ id: pk.id, x: pk.x, z: pk.z, taken: pk.taken }))
  }
}

/** Mirrors the server-authoritative bits of MY soldier into the local player + score. */
export function applySelfSnapshot(g: GameState, buf: SnapshotBuffer, me: string): void {
  const snap = buf.b?.players.find((p) => p.id === me)
  if (!snap) return
  g.player.hp = snap.hp
  g.player.config.maxHp = snap.maxHp
  g.player.blades = snap.blades
  g.player.bladeHp = snap.bladeHp
  g.player.spears = snap.spears
  g.player.kits = snap.kits // the server spends them, so the pouch is never predicted locally
  g.score.score = snap.score
  g.score.kills = snap.kills
  g.score.combo = snap.combo
  // the fist: while it holds me the server owns my position, so the mirror puts me where
  // the hand is instead of letting my client keep flying (the HUD reads presses/timeLeft)
  if (snap.grab) {
    g.grab = { titanId: snap.grab.titanId, presses: snap.grab.presses, timeLeft: snap.grab.timeLeft }
    const holder = g.titans.find((t) => t.id === snap.grab!.titanId)
    if (holder) {
      g.player.pos.copy(grabHoldPoint(holder))
      g.player.vel.set(0, 0, 0)
      g.player.onGround = false
    }
  } else {
    g.grab = null
  }
}

/**
 * Rebuilds the live Shifter from the snapshot so the renderer, the boss bar and the
 * weak-point glow read it exactly as they do in solo. The client never simulates the
 * fight — it draws the server's — but everything downstream of `g.boss` is the same code.
 */
export function syncBossMirror(g: GameState, buf: SnapshotBuffer): void {
  const snap = buf.b?.boss
  if (!snap) {
    g.boss = null
    return
  }
  const spec = BOSS_LADDER.find((b) => b.id === snap.specId)
  const titan = g.titans.find((t) => t.id === snap.titanId)
  // an unknown Shifter id means this build is older than the server's: the content guard
  // refuses that connection at the handshake, so reaching here means the titan just has
  // not arrived in the mirror yet
  if (!spec || !titan) {
    g.boss = null
    return
  }
  const existing = g.boss && g.boss.spec.id === spec.id ? g.boss : null
  const state: BossState = existing?.state ?? {
    titanId: snap.titanId,
    specId: snap.specId,
    phase: 0,
    parts: [],
    engaged: false,
    announced: false,
    cooldowns: { throw: 0, summon: 0, roar: 0, spike: 0 },
    windup: null,
    projectiles: [],
    pendingSpikes: [],
    steamOn: false,
    steamTimer: 0,
    regenTimer: 0,
    summonIds: [],
    nextProjectileId: 1,
    rngState: 0,
  }
  state.titanId = snap.titanId
  state.phase = snap.phase
  state.engaged = snap.engaged
  state.steamOn = snap.steamOn
  // the windup is a pose, not a clock, on this side: any non-null value reads as "winding"
  state.windup = snap.windup ? 1 : null
  state.parts = snap.parts.map((p, i) => ({
    hp: p.hp,
    maxHp: p.maxHp,
    broken: p.broken,
    plated: p.plated,
    hits: state.parts[i]?.hits ?? 0,
    chipped: state.parts[i]?.chipped ?? false,
  }))
  state.projectiles = snap.projectiles.map((p) => ({
    id: p.id,
    pos: new Vector3(p.x, p.y, p.z),
    vel: new Vector3(),
  }))
  state.pendingSpikes = snap.spikes.map((s) => ({ x: s.x, z: s.z, timer: s.timer }))
  g.boss = { spec, state, titan }
}
