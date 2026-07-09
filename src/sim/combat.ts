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
 * Speed is damage: at or above killSpeed a nape hit is a one-cut kill, below it the cut
 * only chips. Body hits are a consolation prize that mostly costs you blade edge.
 */
export function trySlash(p: PlayerState, titans: TitanState[]): SlashResult {
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

  let best: TitanState | null = null
  let bestDist = Infinity
  let napeHit = false
  for (const t of titans) {
    if (t.hp <= 0) continue
    const napeDist = p.pos.distanceTo(napeCenter(t))
    if (napeDist <= p.config.slashRange * 0.85 + t.height * 0.09 && napeDist < bestDist) {
      best = t
      bestDist = napeDist
      napeHit = true
    }
  }
  if (!best) {
    // ankles: any speed cuts the tendon; the radius is generous enough that both
    // ankles can be in range at once, so the cut lands on the nearer one
    let ankleTitan: TitanState | null = null
    let ankleSide: 0 | 1 = 0
    let ankleBest = Infinity
    for (const t of titans) {
      if (t.hp <= 0 || t.state === 'crippled') continue
      for (const side of [0, 1] as const) {
        if (t.ankles[side]) continue
        const ankleDist = p.pos.distanceTo(anklePos(t, side))
        if (ankleDist <= p.config.slashRange * 0.5 + t.height * 0.035 && ankleDist < ankleBest) {
          ankleTitan = t
          ankleSide = side
          ankleBest = ankleDist
        }
      }
    }
    if (ankleTitan) {
      const bladeBroke = wearBlade(p, 1)
      ankleTitan.ankles[ankleSide] = true
      const crippled = crippleTitan(ankleTitan)
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
        titanId: ankleTitan.id,
        ankleSide,
      }
    }
  }
  if (!best) {
    for (const t of titans) {
      if (t.hp <= 0) continue
      const bodyDist = p.pos.distanceTo(bodyCenter(t))
      if (bodyDist <= p.config.slashRange + t.height * 0.22 && bodyDist < bestDist) {
        best = t
        bestDist = bodyDist
      }
    }
  }
  if (!best) return none

  const bladeBroke = wearBlade(p, napeHit ? 1 : 2)

  if (napeHit) {
    if (speed >= p.config.killSpeed) {
      const oneCut = best.hp === best.maxHp
      const damage = best.hp
      best.hp = 0
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
        titanId: best.id,
      }
    }
    const damage = Math.max(6, 45 * Math.pow(speed / p.config.killSpeed, 1.5))
    best.hp = Math.max(0, best.hp - damage)
    return {
      hit: true,
      napeHit: true,
      ankleHit: false,
      crippled: false,
      killed: best.hp <= 0,
      oneCut: false,
      damage,
      speed,
      bladeBroke,
      titanId: best.id,
    }
  }

  const damage = 4
  best.hp = Math.max(0, best.hp - damage)
  return {
    hit: true,
    napeHit: false,
    ankleHit: false,
    crippled: false,
    killed: best.hp <= 0,
    oneCut: false,
    damage,
    speed,
    bladeBroke,
    titanId: best.id,
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
