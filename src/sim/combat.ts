import type { Vector3 } from 'three'
import type { PlayerState } from './player'
import type { TitanState } from './titan'
import { anklePos, bodyCenter, crippleTitan, napeCenter } from './titan'

export interface SlashResult {
  hit: boolean
  napeHit: boolean
  ankleHit: boolean
  crippled: boolean
  killed: boolean
  oneCut: boolean
  damage: number
  speed: number
  bladeBroke: boolean
  titanId?: number
  ankleSide?: 0 | 1
}

/**
 * Hit radii scale with the titan (plus a slashRange term so blade config still matters).
 * Coefficients keep a 15 m titan exactly as generous as the original flat tuning; smaller
 * titans tighten in proportion — the old near-constant bubbles were so wide on an 8.5 m
 * titan that the nape sphere swallowed its own ankles. Exported for the dev hitbox overlay,
 * which must draw exactly what trySlash judges.
 */
export function napeHitRadius(slashRange: number, t: TitanState): number {
  return (slashRange + t.height) * 0.35
}

export function ankleHitRadius(slashRange: number, t: TitanState): number {
  return slashRange * 0.3 + t.height * 0.17
}

export function bodyHitRadius(slashRange: number, t: TitanState): number {
  return slashRange * 0.5 + t.height * 0.42
}

export const NAPE_AIM_CONE_DEG = 60
const NAPE_AIM_COS = Math.cos((NAPE_AIM_CONE_DEG * Math.PI) / 180)
/** Inside this fraction of the nape radius the cone is waived: point-blank, any swing counts. */
export const NAPE_POINT_BLANK = 0.4

/**
 * The nape is the kill volume, so it demands intent: the crosshair within a generous cone
 * of the nape center. Waived point-blank, and for aimless intents (aim = null, sent by
 * pre-cone co-op clients) the gate stays open — legacy behavior, never a hard failure.
 */
export function napeAimOk(
  pos: Vector3,
  aim: Vector3 | null,
  t: TitanState,
  slashRange: number,
): boolean {
  if (!aim) return true
  const to = napeCenter(t).sub(pos)
  const dist = to.length()
  if (dist <= napeHitRadius(slashRange, t) * NAPE_POINT_BLANK) return true
  const aimLen = aim.length()
  if (aimLen < 1e-6 || dist < 1e-6) return true
  return to.dot(aim) / (dist * aimLen) >= NAPE_AIM_COS
}

interface SlashTarget {
  titan: TitanState
  kind: 'nape' | 'ankle' | 'body'
  side: 0 | 1
}

/**
 * The volume a swing lands in. Nape and ankles compete on distance normalized to their
 * radii — proximity is intent, so a shin-level slash cuts the tendon even where the
 * volumes overlap. The body is a consolation fallback: it never steals a swing from a
 * precise target, only catches the ones that would otherwise whiff.
 */
function resolveSlash(
  p: PlayerState,
  titans: TitanState[],
  aim: Vector3 | null,
): SlashTarget | null {
  const range = p.config.slashRange
  let best: SlashTarget | null = null
  let bestNorm = 1
  for (const t of titans) {
    if (t.hp <= 0) continue
    const napeNorm = p.pos.distanceTo(napeCenter(t)) / napeHitRadius(range, t)
    if (napeNorm <= bestNorm && napeAimOk(p.pos, aim, t, range)) {
      best = { titan: t, kind: 'nape', side: 0 }
      bestNorm = napeNorm
    }
    if (t.state === 'crippled') continue // already on its knees: tendons no longer matter
    for (const side of [0, 1] as const) {
      if (t.ankles[side]) continue
      const ankleNorm = p.pos.distanceTo(anklePos(t, side)) / ankleHitRadius(range, t)
      if (ankleNorm <= bestNorm) {
        best = { titan: t, kind: 'ankle', side }
        bestNorm = ankleNorm
      }
    }
  }
  if (best) return best
  let bodyNorm = 1
  for (const t of titans) {
    if (t.hp <= 0) continue
    const norm = p.pos.distanceTo(bodyCenter(t)) / bodyHitRadius(range, t)
    if (norm <= bodyNorm) {
      best = { titan: t, kind: 'body', side: 0 }
      bodyNorm = norm
    }
  }
  return best
}

/** A pressed swing stays live this long; pressing a beat early on a fast pass is not a whiff. */
export const SLASH_BUFFER_S = 0.15

/**
 * Speed is damage: at or above killSpeed a nape hit is a one-cut kill, below it the cut
 * only chips. Body hits are a consolation prize that mostly costs you blade edge. A press
 * with nothing in reach arms the swing buffer instead of whiffing outright — call
 * stepSlashBuffer every tick to let it connect mid-pass.
 */
export function trySlash(p: PlayerState, titans: TitanState[], aim: Vector3 | null): SlashResult {
  const speed = p.vel.length()
  const none: SlashResult = {
    hit: false,
    napeHit: false,
    ankleHit: false,
    crippled: false,
    killed: false,
    oneCut: false,
    damage: 0,
    speed,
    bladeBroke: false,
  }
  if (p.slashTimer > 0) return none
  if (p.blades <= 0) return none
  p.slashTimer = p.config.slashCooldown

  const target = resolveSlash(p, titans, aim)
  if (!target) {
    p.slashBuffer = SLASH_BUFFER_S
    return none
  }
  p.slashBuffer = 0
  return applySlash(p, target, speed)
}

/** Ticks a live buffered swing; returns the connect the moment a volume comes into reach. */
export function stepSlashBuffer(
  p: PlayerState,
  titans: TitanState[],
  aim: Vector3 | null,
  dt: number,
): SlashResult | null {
  if (p.slashBuffer <= 0) return null
  const target = resolveSlash(p, titans, aim)
  if (!target) {
    p.slashBuffer = Math.max(0, p.slashBuffer - dt)
    return null
  }
  p.slashBuffer = 0
  return applySlash(p, target, p.vel.length())
}

/** Lands the swing on the resolved volume: wear, wounds and the result the caller scores. */
function applySlash(p: PlayerState, target: SlashTarget, speed: number): SlashResult {
  const t = target.titan

  if (target.kind === 'ankle') {
    const bladeBroke = wearBlade(p, 1)
    t.ankles[target.side] = true
    const crippled = crippleTitan(t)
    return {
      hit: true,
      napeHit: false,
      ankleHit: true,
      crippled,
      killed: false,
      oneCut: false,
      damage: 0,
      speed,
      bladeBroke,
      titanId: t.id,
      ankleSide: target.side,
    }
  }

  if (target.kind === 'nape') {
    const bladeBroke = wearBlade(p, 1)
    if (speed >= p.config.killSpeed) {
      const oneCut = t.hp === t.maxHp
      const damage = t.hp
      t.hp = 0
      return {
        hit: true,
        napeHit: true,
        ankleHit: false,
        crippled: false,
        killed: true,
        oneCut,
        damage,
        speed,
        bladeBroke,
        titanId: t.id,
      }
    }
    const damage = Math.max(6, 45 * Math.pow(speed / p.config.killSpeed, 1.5))
    t.hp = Math.max(0, t.hp - damage)
    return {
      hit: true,
      napeHit: true,
      ankleHit: false,
      crippled: false,
      killed: t.hp <= 0,
      oneCut: false,
      damage,
      speed,
      bladeBroke,
      titanId: t.id,
    }
  }

  const bladeBroke = wearBlade(p, 2)
  const damage = 4
  t.hp = Math.max(0, t.hp - damage)
  return {
    hit: true,
    napeHit: false,
    ankleHit: false,
    crippled: false,
    killed: t.hp <= 0,
    oneCut: false,
    damage,
    speed,
    bladeBroke,
    titanId: t.id,
  }
}

/** Returns true when the current pair broke. */
function wearBlade(p: PlayerState, amount: number): boolean {
  p.bladeHp -= amount
  if (p.bladeHp > 0) return false
  p.blades -= 1
  p.bladeHp = p.blades > 0 ? p.config.bladeDurability : 0
  return true
}
