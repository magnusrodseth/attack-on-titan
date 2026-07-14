import { Vector3 } from 'three'
import type { Arena } from './city'
import { maxTitanHeightAt } from './city'
import { GRAVITY } from './constants'
import { createRng, hashSeed, resumeRng } from './rng'
import type { KindStats, TitanState } from './titan'
import { createTitan, forwardOf, staggerTitan } from './titan'

/**
 * Shifters: the Nine named boss titans, fought every 5th wave of Wave Survival (solo).
 * Combat model per ADR 0002: damage lands ONLY on the single lit Weak Point, by blade or
 * blast alike. Parts have HP pools; a cut at or above killSpeed always deals a flat 100
 * (the one-cut threshold never moves); breaks reuse the Staggered state and disable
 * anatomically-linked abilities; Plated parts bounce blades until a spear blast cracks
 * them. One framework, nine declarative specs.
 */

export type BossAbilityId =
  | 'throw'
  | 'summon'
  | 'steam'
  | 'roar'
  | 'spikes'
  | 'counter'
  | 'regen'

export interface BossPartSpec {
  /** Stable id; 'nape' is always last. Render uses it to place the glow on the rig. */
  id: string
  /** HUD label on the boss bar's plate. */
  name: string
  hp: number
  plated?: boolean
  /** Titan-local anchor as height fractions: up the spine, along facing, sideways. */
  up: number
  fwd: number
  lat: number
  /** Ability silenced when this part breaks (the Beast's throwing wrist). */
  disables?: BossAbilityId
}

export interface BossSpec {
  /** Also the body-builder key in src/render/titans/registry.ts. */
  id: string
  name: string
  /** Ladder slot: the first wave this shifter walks. */
  wave: number
  height: number
  /** Seconds the break-freeze lasts (the spear stagger is 3). */
  staggerSeconds: number
  stats: KindStats
  parts: BossPartSpec[]
  abilities: BossAbilityId[]
  /** Pures summoned per scream (summon ability only). */
  summonCount?: number
  /** Render hint: the Cart walks on all fours. */
  quadruped?: boolean
}

// Stat conventions: aggro is irrelevant (bosses chase relentlessly); walk/turn/swatRest
// carry each boss's temperament; leaps double as the Armored's flat charging rush.
const S = (over: Partial<KindStats>): KindStats => ({
  aggro: 10000,
  turn: 1.8,
  walk: 0.24,
  swatRest: 1.8,
  leaps: false,
  leapY: 13,
  ...over,
})

/**
 * The fixed ladder (grilled decision, 2026-07-13): same order every run, Founding as the
 * wave-45 apex; after 45 it repeats with scaled part HP. Part sequences are authored
 * choreography — 3 parts early, 5 at the apex, the nape always last.
 */
export const BOSS_LADDER: BossSpec[] = [
  {
    id: 'beast-titan',
    name: 'Beast Titan',
    wave: 5,
    height: 17,
    staggerSeconds: 5,
    stats: S({ walk: 0.22, turn: 1.6, swatRest: 2.0 }),
    parts: [
      { id: 'ankle', name: 'Ankle', hp: 100, up: 0.06, fwd: 0.02, lat: 0.12 },
      { id: 'wrist', name: 'Throwing Wrist', hp: 100, up: 0.52, fwd: 0.1, lat: -0.22, disables: 'throw' },
      { id: 'nape', name: 'Nape', hp: 100, up: 0.82, fwd: -0.09, lat: 0 },
    ],
    abilities: ['throw'],
  },
  {
    id: 'cart-titan',
    name: 'Cart Titan',
    wave: 10,
    height: 10,
    staggerSeconds: 4.5,
    stats: S({ walk: 0.5, turn: 2.4, swatRest: 1.6 }),
    quadruped: true,
    parts: [
      { id: 'foreleg', name: 'Foreleg', hp: 120, up: 0.08, fwd: 0.3, lat: 0.14 },
      { id: 'haunch', name: 'Haunch', hp: 120, up: 0.4, fwd: -0.3, lat: -0.14 },
      { id: 'nape', name: 'Nape', hp: 120, up: 0.55, fwd: -0.05, lat: 0 },
    ],
    abilities: ['regen'],
  },
  {
    id: 'jaw-titan',
    name: 'Jaw Titan',
    wave: 15,
    height: 9,
    staggerSeconds: 3.5,
    stats: S({ walk: 0.5, turn: 3.0, swatRest: 1.0, leaps: true, leapY: 15 }),
    parts: [
      { id: 'ankle', name: 'Ankle', hp: 100, up: 0.06, fwd: 0.02, lat: 0.12 },
      { id: 'jaw', name: 'Jaw', hp: 140, up: 0.88, fwd: 0.1, lat: 0 },
      { id: 'nape', name: 'Nape', hp: 120, up: 0.82, fwd: -0.09, lat: 0 },
    ],
    abilities: [],
  },
  {
    id: 'female-titan',
    name: 'Female Titan',
    wave: 20,
    height: 14,
    staggerSeconds: 4.5,
    stats: S({ walk: 0.42, turn: 2.6, swatRest: 1.2, leaps: true, leapY: 15 }),
    parts: [
      { id: 'wrist', name: 'Hardened Wrist', hp: 140, up: 0.52, fwd: 0.1, lat: 0.22, plated: true },
      { id: 'calf', name: 'Calf', hp: 140, up: 0.18, fwd: -0.04, lat: -0.12 },
      { id: 'nape', name: 'Nape', hp: 160, up: 0.82, fwd: -0.09, lat: 0 },
    ],
    abilities: ['summon'],
    summonCount: 2,
  },
  {
    id: 'armored-titan',
    name: 'Armored Titan',
    wave: 25,
    height: 15,
    staggerSeconds: 5,
    stats: S({ walk: 0.4, turn: 2.0, swatRest: 1.4, leaps: true, leapY: 8 }),
    parts: [
      { id: 'shoulder', name: 'Shoulder Plate', hp: 150, up: 0.72, fwd: 0.04, lat: 0.2, plated: true },
      { id: 'knee', name: 'Knee Plate', hp: 150, up: 0.28, fwd: 0.08, lat: -0.12, plated: true },
      { id: 'nape', name: 'Nape', hp: 180, up: 0.82, fwd: -0.09, lat: 0, plated: true },
    ],
    abilities: [],
  },
  {
    id: 'warhammer-titan',
    name: 'War Hammer Titan',
    wave: 30,
    height: 15,
    staggerSeconds: 4.5,
    stats: S({ walk: 0.3, turn: 1.8, swatRest: 1.8 }),
    parts: [
      { id: 'wrist', name: 'Hammer Wrist', hp: 160, up: 0.52, fwd: 0.1, lat: 0.22, disables: 'spikes' },
      { id: 'shoulder', name: 'Shoulder', hp: 160, up: 0.72, fwd: 0.04, lat: -0.2 },
      { id: 'nape', name: 'Crystal Nape', hp: 200, up: 0.82, fwd: -0.09, lat: 0, plated: true },
    ],
    abilities: ['spikes'],
  },
  {
    id: 'attack-titan',
    name: 'Attack Titan',
    wave: 35,
    height: 15,
    staggerSeconds: 4,
    stats: S({ walk: 0.46, turn: 2.8, swatRest: 0.9, leaps: true, leapY: 14 }),
    parts: [
      { id: 'hamstring', name: 'Hamstring', hp: 180, up: 0.3, fwd: -0.06, lat: 0.12 },
      { id: 'forearm', name: 'Forearm', hp: 180, up: 0.5, fwd: 0.12, lat: -0.22 },
      { id: 'shoulder', name: 'Shoulder', hp: 180, up: 0.72, fwd: 0.04, lat: 0.2 },
      { id: 'nape', name: 'Nape', hp: 200, up: 0.82, fwd: -0.09, lat: 0 },
    ],
    abilities: ['counter'],
  },
  {
    id: 'colossus-titan',
    name: 'Colossus Titan',
    wave: 40,
    height: 60,
    staggerSeconds: 6,
    stats: S({ walk: 0.05, turn: 0.6, swatRest: 4.5 }),
    parts: [
      { id: 'ankle', name: 'Ankle', hp: 200, up: 0.04, fwd: 0.02, lat: 0.1 },
      { id: 'calf', name: 'Calf', hp: 200, up: 0.14, fwd: -0.03, lat: -0.1 },
      { id: 'hand', name: 'Hand', hp: 220, up: 0.45, fwd: 0.1, lat: 0.18 },
      { id: 'nape', name: 'Nape', hp: 250, up: 0.84, fwd: -0.07, lat: 0 },
    ],
    abilities: ['steam'],
  },
  {
    id: 'founding-titan',
    name: 'Founding Titan',
    wave: 45,
    height: 20,
    staggerSeconds: 4.5,
    stats: S({ walk: 0.34, turn: 2.2, swatRest: 1.2 }),
    parts: [
      { id: 'ankle', name: 'Ankle', hp: 200, up: 0.06, fwd: 0.02, lat: 0.12 },
      { id: 'wrist', name: 'Wrist', hp: 200, up: 0.52, fwd: 0.1, lat: -0.22 },
      { id: 'spine', name: 'Spine Ridge', hp: 220, up: 0.62, fwd: -0.1, lat: 0 },
      { id: 'eye', name: 'Eye', hp: 220, up: 0.92, fwd: 0.08, lat: 0.04 },
      { id: 'nape', name: 'Nape', hp: 250, up: 0.82, fwd: -0.09, lat: 0 },
    ],
    abilities: ['summon', 'roar'],
    summonCount: 3,
  },
]

export const BOSS_WAVE_INTERVAL = 5

/**
 * Which ladder slot (0-based) a wave holds, per mode: Wave Survival meets a Shifter
 * every 5th wave; The Nine (boss rush) is nothing but the ladder, one per wave.
 * Null = an ordinary wave.
 */
export function bossSlot(wave: number, modeId: string): number | null {
  if (wave <= 0) return null
  if (modeId === 'waves') return wave % BOSS_WAVE_INTERVAL === 0 ? wave / BOSS_WAVE_INTERVAL - 1 : null
  if (modeId === 'bossrush') return wave - 1
  return null
}

export function isBossWave(wave: number, modeId: string): boolean {
  return bossSlot(wave, modeId) !== null
}

/**
 * The Shifters that can actually stand up on this map. The Colossal is sixty metres of
 * titan and the Underground's dome peaks at forty-four: it does not fit down there, and a
 * Colossal shrunk until it fits is not a Colossal. So the cavern's ladder is simply the
 * ladder without the ones that cannot walk in — eight Shifters under the rock, all nine
 * under the sky. Every other map returns the full ladder.
 */
export function bossLadderFor(arena?: Arena): BossSpec[] {
  if (!arena) return BOSS_LADDER
  const [x, z] = bossSpawnPoint(arena)
  const room = maxTitanHeightAt(arena, x, z)
  const fits = BOSS_LADDER.filter((spec) => spec.height <= room)
  return fits.length > 0 ? fits : BOSS_LADDER
}

/** A slot walks the ladder in order; past the Founding it laps, HP-scaled. */
export function bossForSlot(slot: number, ladder: BossSpec[] = BOSS_LADDER): { spec: BossSpec; lap: number } {
  const spec = ladder[slot % ladder.length]!
  return { spec, lap: Math.floor(slot / ladder.length) }
}

/** The Shifter a wave fields in the given mode, or null on ordinary waves. */
export function bossForMilestone(
  wave: number,
  modeId: string,
  arena?: Arena,
): { spec: BossSpec; lap: number } | null {
  const slot = bossSlot(wave, modeId)
  return slot === null ? null : bossForSlot(slot, bossLadderFor(arena))
}

/** Wave Survival's ladder view (slot every 5th wave); tests and docs speak in waves. */
export function bossForWave(wave: number, arena?: Arena): { spec: BossSpec; lap: number } {
  return bossForSlot(Math.round(wave / BOSS_WAVE_INTERVAL) - 1, bossLadderFor(arena))
}

/** Each full lap of the Nine hardens the pools; the killSpeed bar never moves. */
export function partHpScale(lap: number): number {
  return 1 + 0.6 * lap
}

/** Where the Shifter walks in — the map decides what that means (see Arena.bossEntry). */
export function bossSpawnPoint(arena: Pick<Arena, 'bossEntry'>): [number, number] {
  return [arena.bossEntry.x, arena.bossEntry.z]
}

export interface BossPartState {
  hp: number
  maxHp: number
  broken: boolean
  plated: boolean
  /** Damaging hits taken (cracks excluded); one clean cut = flawless credit. */
  hits: number
  /** Any sub-clean damage (chip cut or blast) forfeits this part's flawless credit. */
  chipped: boolean
}

export interface BossProjectile {
  id: number
  pos: Vector3
  vel: Vector3
}

export interface BossSpike {
  x: number
  z: number
  timer: number
}

export interface BossState {
  titanId: number
  specId: string
  /** Index of the current lit Weak Point in the spec's part sequence. */
  phase: number
  parts: BossPartState[]
  engaged: boolean
  announced: boolean
  cooldowns: { throw: number; summon: number; roar: number; spike: number }
  /** Ticks down toward the boulder release once a throw is telegraphed. */
  windup: number | null
  projectiles: BossProjectile[]
  pendingSpikes: BossSpike[]
  steamOn: boolean
  steamTimer: number
  /** Seconds until the regen ability may knit the lit part again. */
  regenTimer: number
  /** Live titan ids this boss screamed into the wave; dissolved on its death. */
  summonIds: number[]
  nextProjectileId: number
  /** Resumable rng stream state (seed:boss:wave); serialized with the run. */
  rngState: number
}

/** Everything one boss fight carries: the authored spec, live state, and its titan. */
export interface BossFight {
  spec: BossSpec
  state: BossState
  titan: TitanState
}

export const BOSS_ENGAGE_RADIUS = 70
export const BOSS_SUMMON_CAP = 4
export const THROW_WINDUP_SECONDS = 1.2
export const THROW_COOLDOWN = 6
export const THROW_IMPACT_RADIUS = 5
export const SUMMON_COOLDOWN = 18
export const ROAR_COOLDOWN = 12
export const ROAR_RADIUS = 32
export const SPIKE_COOLDOWN = 5
export const SPIKE_TELEGRAPH_SECONDS = 0.9
export const SPIKE_RADIUS = 4
export const STEAM_ON_SECONDS = 6
export const STEAM_OFF_SECONDS = 4
export const REGEN_DELAY = 8
export const REGEN_RATE = 12
/** A clean cut's flat worth against a part pool; the boss analog of the one-cut kill. */
export const CLEAN_CUT_DAMAGE = 100

export function steamRadius(t: TitanState): number {
  return t.height * 0.42
}

/**
 * How much thicker a Shifter's part pools get with each extra soldier on it. Four blades
 * cut four times as fast, so without this a co-op Shifter would fall in a quarter of the
 * time and the fight would lose its shape. The pools grow, the killSpeed bar never moves,
 * and the ladder is unchanged: a four-hand Beast is the same fight, four-handed.
 */
export function rosterHpScale(squad: number): number {
  return Math.max(1, squad)
}

export function createBossFight(
  titanId: number,
  spec: BossSpec,
  wave: number,
  seed: string,
  x: number,
  z: number,
  lap = 0,
  squad = 1,
): BossFight {
  // no height clamp here on purpose: a Shifter fights at its true scale, and any that
  // cannot stand up on this map was never on its ladder (see bossLadderFor)
  const titan = createTitan({ id: titanId, kind: 'shifter', height: spec.height, x, z })
  const scale = partHpScale(lap) * rosterHpScale(squad)
  const parts: BossPartState[] = spec.parts.map((p) => ({
    hp: Math.round(p.hp * scale),
    maxHp: Math.round(p.hp * scale),
    broken: false,
    plated: p.plated ?? false,
    hits: 0,
    chipped: false,
  }))
  // the titan's own hp mirrors the pools so alive/dead checks stay kind-agnostic
  const totalHp = parts.reduce((sum, p) => sum + p.maxHp, 0)
  titan.hp = totalHp
  titan.maxHp = totalHp
  return {
    spec,
    titan,
    state: {
      titanId,
      specId: spec.id,
      phase: 0,
      parts,
      engaged: false,
      announced: false,
      cooldowns: { throw: 2, summon: 1.5, roar: 1, spike: 1 },
      windup: null,
      projectiles: [],
      pendingSpikes: [],
      steamOn: false,
      steamTimer: 2,
      regenTimer: 0,
      summonIds: [],
      nextProjectileId: 1,
      rngState: hashSeed(`${seed}:boss:${wave}`),
    },
  }
}

export function litPartIndex(state: BossState): number {
  return state.phase
}

/** World position of a part anchor, riding the titan's pose like nape/ankle math. */
export function bossPartCenter(t: TitanState, part: BossPartSpec): Vector3 {
  const fwd = forwardOf(t)
  const lateral = part.lat * t.height
  return new Vector3(
    t.pos.x + fwd.x * part.fwd * t.height + fwd.z * lateral,
    t.pos.y + t.height * part.up,
    t.pos.z + fwd.z * part.fwd * t.height - fwd.x * lateral,
  )
}

/** Generous like the ankle bubble, scaled to the boss; exported for the dev overlay. */
export function bossPartRadius(slashRange: number, t: TitanState): number {
  return slashRange * 0.5 + t.height * 0.12
}

export interface BossSlashOutcome {
  hit: boolean
  /** The blade bounced off an uncracked plate: wear without wound. */
  plated: boolean
  damage: number
  broken: boolean
  killed: boolean
  /** Meaningful when killed: every part fell to a single clean cut. */
  flawless: boolean
  partIndex: number
  partName: string
}

/**
 * A blade landing on the lit Weak Point. Clean cuts (>= killSpeed) always deal a flat
 * CLEAN_CUT_DAMAGE; slower cuts chip with the nape formula. The caller has already
 * resolved that the swing reached the part (combat.ts owns radii and blade wear).
 */
export function applyBossSlash(fight: BossFight, speed: number, killSpeed: number): BossSlashOutcome {
  const { spec, state, titan } = fight
  const index = state.phase
  const partSpec = spec.parts[index]!
  const part = state.parts[index]!
  state.engaged = true

  if (part.plated) {
    return {
      hit: true,
      plated: true,
      damage: 0,
      broken: false,
      killed: false,
      flawless: false,
      partIndex: index,
      partName: partSpec.name,
    }
  }

  const clean = speed >= killSpeed
  const damage = clean
    ? CLEAN_CUT_DAMAGE
    : Math.max(6, 45 * Math.pow(speed / killSpeed, 1.5))
  wound(fight, part, damage, !clean)
  const { broken, killed } = part.hp <= 0 ? breakPart(fight) : { broken: false, killed: false }

  // the Attack Titan punishes chip-spam: a non-breaking wound answers instantly
  if (!broken && spec.abilities.includes('counter') && titan.hp > 0 && titan.state !== 'staggered') {
    titan.state = 'attack'
    titan.stateTime = 0.3
    titan.attackCooldown = 0
  }

  return {
    hit: true,
    plated: false,
    damage,
    broken,
    killed,
    flawless: killed ? isFlawless(state) : false,
    partIndex: index,
    partName: partSpec.name,
  }
}

export interface BossBlastOutcome {
  /** The blast reached the lit part at all (cracked or wounded it). */
  affected: boolean
  cracked: boolean
  damage: number
  broken: boolean
  killed: boolean
  staggered: boolean
  partIndex: number
  partName: string
}

/**
 * A Thunder Spear blast against the boss: only the lit Weak Point reacts. A plated part
 * cracks open (no damage); flesh takes the spear's 60. There is no nape instakill here —
 * that rule belongs to pure titans (ADR 0002).
 */
export function applyBossBlast(fight: BossFight, blastPos: Vector3, radius = 5): BossBlastOutcome {
  const { spec, state, titan } = fight
  const index = state.phase
  const partSpec = spec.parts[index]!
  const part = state.parts[index]!
  const none: BossBlastOutcome = {
    affected: false,
    cracked: false,
    damage: 0,
    broken: false,
    killed: false,
    staggered: false,
    partIndex: index,
    partName: partSpec.name,
  }
  if (titan.hp <= 0) return none
  if (bossPartCenter(titan, partSpec).distanceTo(blastPos) > radius) return none

  state.engaged = true
  if (part.plated) {
    part.plated = false
    const staggered = staggerTitan(titan)
    return { ...none, affected: true, cracked: true, staggered }
  }

  wound(fight, part, 60, true)
  if (part.hp <= 0) {
    const { broken, killed } = breakPart(fight)
    return { ...none, affected: true, damage: 60, broken, killed, staggered: broken && !killed }
  }
  const staggered = staggerTitan(titan)
  return { ...none, affected: true, damage: 60, staggered }
}

function wound(fight: BossFight, part: BossPartState, damage: number, chip: boolean): void {
  part.hp = Math.max(0, part.hp - damage)
  part.hits += 1
  if (chip) part.chipped = true
  fight.state.regenTimer = REGEN_DELAY
  fight.state.engaged = true
}

/** The break beat: freeze for the spec duration, light the next part, or fall for good. */
function breakPart(fight: BossFight): { broken: true; killed: boolean } {
  const { spec, state, titan } = fight
  state.parts[state.phase]!.broken = true
  state.phase += 1
  if (state.phase >= spec.parts.length) {
    titan.hp = 0
    return { broken: true, killed: true }
  }
  if (staggerTitan(titan)) titan.staggerTimer = spec.staggerSeconds
  return { broken: true, killed: false }
}

function isFlawless(state: BossState): boolean {
  return state.parts.every((p) => p.hits === 1 && !p.chipped)
}

export type BossEvent =
  | { type: 'engaged' }
  | { type: 'throwWindup' }
  | { type: 'throw'; projectileId: number }
  | { type: 'projectileImpact'; pos: Vector3; radius: number }
  | { type: 'summon'; spawns: { height: number; x: number; z: number }[] }
  | { type: 'steam'; on: boolean }
  | { type: 'roar'; pos: Vector3; radius: number }
  | { type: 'spikeTelegraph'; x: number; z: number }
  | { type: 'spike'; x: number; z: number; radius: number }

export interface BossStepCtx {
  playerPos: Vector3
  dt: number
  /** Living pures this boss has already screamed in (the cap gate). */
  liveSummons: number
  groundY: (x: number, z: number) => number
}

function abilityDisabled(fight: BossFight, ability: BossAbilityId): boolean {
  return fight.spec.parts.some(
    (p, i) => p.disables === ability && fight.state.parts[i]!.broken,
  )
}

/**
 * One tick of boss-only behavior, layered over the shared titan state machine (which
 * game.ts steps separately with the spec's stats). Emits events for game.ts to apply to
 * the world — this module never touches the player or the titan roster directly.
 */
export function stepBoss(fight: BossFight, ctx: BossStepCtx): BossEvent[] {
  const { spec, state, titan } = fight
  const events: BossEvent[] = []
  if (titan.hp <= 0) return events
  const dt = ctx.dt
  const rng = resumeRng(state.rngState)

  const dist = Math.hypot(ctx.playerPos.x - titan.pos.x, ctx.playerPos.z - titan.pos.z)
  if (!state.announced && (state.engaged || dist < BOSS_ENGAGE_RADIUS)) {
    state.engaged = true
    state.announced = true
    events.push({ type: 'engaged' })
  }

  // boulders in flight land whether or not anyone is watching
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const proj = state.projectiles[i]!
    proj.vel.y += GRAVITY * dt
    proj.pos.addScaledVector(proj.vel, dt)
    if (proj.pos.y <= ctx.groundY(proj.pos.x, proj.pos.z)) {
      proj.pos.y = ctx.groundY(proj.pos.x, proj.pos.z)
      events.push({ type: 'projectileImpact', pos: proj.pos.clone(), radius: THROW_IMPACT_RADIUS })
      state.projectiles.splice(i, 1)
    }
  }

  // pending spikes strike on their telegraph timer even if the boss is mid-stagger
  for (let i = state.pendingSpikes.length - 1; i >= 0; i--) {
    const spike = state.pendingSpikes[i]!
    spike.timer -= dt
    if (spike.timer <= 0) {
      events.push({ type: 'spike', x: spike.x, z: spike.z, radius: SPIKE_RADIUS })
      state.pendingSpikes.splice(i, 1)
    }
  }

  if (!state.engaged) {
    state.rngState = rng.state()
    return events
  }

  const acting = titan.state === 'chase' || titan.state === 'attack' || titan.state === 'wander'
  state.cooldowns.throw = Math.max(0, state.cooldowns.throw - dt)
  state.cooldowns.summon = Math.max(0, state.cooldowns.summon - dt)
  state.cooldowns.roar = Math.max(0, state.cooldowns.roar - dt)
  state.cooldowns.spike = Math.max(0, state.cooldowns.spike - dt)

  // Throw: telegraphed boulder, aimed at the player's position on release
  if (spec.abilities.includes('throw') && !abilityDisabled(fight, 'throw')) {
    if (state.windup !== null) {
      state.windup -= dt
      if (state.windup <= 0) {
        state.windup = null
        const hand = bossPartCenter(titan, {
          id: 'hand',
          name: '',
          hp: 0,
          up: 0.62,
          fwd: 0.2,
          lat: -0.22,
        })
        const flight = Math.min(2.5, Math.max(1.0, dist / 28))
        // aim at the soldier, not at the dirt beneath them: on a rooftop, and above all on
        // a branch 40m up a giant tree, the ground under the player is nowhere near them
        const targetY = ctx.playerPos.y
        const vel = new Vector3(
          (ctx.playerPos.x - hand.x) / flight,
          (targetY - hand.y - 0.5 * GRAVITY * flight * flight) / flight,
          (ctx.playerPos.z - hand.z) / flight,
        )
        const id = state.nextProjectileId++
        state.projectiles.push({ id, pos: hand, vel })
        events.push({ type: 'throw', projectileId: id })
        state.cooldowns.throw = THROW_COOLDOWN
      }
    } else if (acting && state.cooldowns.throw <= 0 && dist > 15 && dist < 120) {
      state.windup = THROW_WINDUP_SECONDS
      events.push({ type: 'throwWindup' })
    }
  } else {
    state.windup = null
  }

  // Summon: the scream that calls pures in, capped so the wave stays a boss fight
  if (
    spec.abilities.includes('summon') &&
    !abilityDisabled(fight, 'summon') &&
    acting &&
    state.cooldowns.summon <= 0 &&
    dist < 90 &&
    ctx.liveSummons < BOSS_SUMMON_CAP
  ) {
    const spawns = []
    for (let i = 0; i < (spec.summonCount ?? 2); i++) {
      const angle = rng() * Math.PI * 2
      const r = 18 + rng() * 14
      spawns.push({
        height: 8 + rng() * 3,
        x: titan.pos.x + Math.cos(angle) * r,
        z: titan.pos.z + Math.sin(angle) * r,
      })
    }
    events.push({ type: 'summon', spawns })
    state.cooldowns.summon = SUMMON_COOLDOWN
  }

  // Steam: the Colossus alternates a lethal aura with the vent windows you dive through
  if (spec.abilities.includes('steam')) {
    state.steamTimer -= dt
    if (state.steamTimer <= 0) {
      state.steamOn = !state.steamOn
      state.steamTimer = state.steamOn ? STEAM_ON_SECONDS : STEAM_OFF_SECONDS
      events.push({ type: 'steam', on: state.steamOn })
    }
  }

  // Roar: a point-blank shockwave that throws the soldier off the body
  if (
    spec.abilities.includes('roar') &&
    acting &&
    state.cooldowns.roar <= 0 &&
    dist < ROAR_RADIUS
  ) {
    events.push({
      type: 'roar',
      pos: titan.pos.clone().add(new Vector3(0, titan.height * 0.5, 0)),
      radius: ROAR_RADIUS,
    })
    state.cooldowns.roar = ROAR_COOLDOWN
  }

  // Spikes: the War Hammer raises the street under your feet after a telegraph
  if (
    spec.abilities.includes('spikes') &&
    !abilityDisabled(fight, 'spikes') &&
    acting &&
    state.cooldowns.spike <= 0 &&
    dist > 8 &&
    dist < 90
  ) {
    state.pendingSpikes.push({ x: ctx.playerPos.x, z: ctx.playerPos.z, timer: SPIKE_TELEGRAPH_SECONDS })
    events.push({ type: 'spikeTelegraph', x: ctx.playerPos.x, z: ctx.playerPos.z })
    state.cooldowns.spike = SPIKE_COOLDOWN
  }

  // Regen: an unpressured Cart knits its lit wound closed
  if (spec.abilities.includes('regen')) {
    state.regenTimer = Math.max(0, state.regenTimer - dt)
    const part = state.parts[state.phase]
    if (part && !part.broken && part.hp < part.maxHp && state.regenTimer <= 0) {
      part.hp = Math.min(part.maxHp, part.hp + REGEN_RATE * dt)
    }
  }

  state.rngState = rng.state()
  return events
}

/** Deterministic ladder rng helper for future variance needs; unused streams stay unused. */
export function bossRng(seed: string, wave: number) {
  return createRng(hashSeed(`${seed}:boss:${wave}`))
}
